import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  getFirestoreDb: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/firestore", () => ({
  FieldPath: { documentId: () => "__name__" },
}));
vi.mock("../../src/lib/firebase-admin", () => ({
  getFirestoreDb: firestoreMocks.getFirestoreDb,
}));

import {
  deleteBook,
  lendBook,
  listBooks,
  putBook,
  returnBook,
} from "../../src/repositories/book-repository";
import type { BookDocument, BookWriteInput } from "../../src/schemas/book";

type StoredData = Record<string, unknown>;
type Filter = { field: string; operator: string; value: unknown };
type Order = { field: string; direction: "asc" | "desc" };
type PendingWrite = {
  kind: "set" | "create" | "update" | "delete";
  reference: FakeReference;
  data?: StoredData;
};

class FakeSnapshot {
  constructor(
    readonly id: string,
    private readonly value: StoredData | undefined,
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): StoredData | undefined {
    return this.value === undefined ? undefined : { ...this.value };
  }
}

class FakeReference {
  readonly id: string;

  constructor(
    readonly path: string,
    private readonly database: FakeDatabase,
  ) {
    this.id = path.split("/").at(-1) ?? "";
  }

  collection(name: string): FakeCollection {
    return new FakeCollection(`${this.path}/${name}`, this.database);
  }
}

class FakeCollection {
  constructor(
    readonly path: string,
    private readonly database: FakeDatabase,
  ) {}

  doc(id: string): FakeReference {
    return new FakeReference(`${this.path}/${id}`, this.database);
  }

  where(field: string, operator: string, value: unknown): FakeQuery {
    return new FakeQuery(this.path, this.database).where(field, operator, value);
  }
}

class FakeQuery {
  private readonly filters: Filter[];
  private readonly orders: Order[];
  private readonly after: unknown[] | undefined;
  private readonly count: number | undefined;

  constructor(
    private readonly path: string,
    private readonly database: FakeDatabase,
    filters: Filter[] = [],
    orders: Order[] = [],
    after?: unknown[],
    count?: number,
  ) {
    this.filters = filters;
    this.orders = orders;
    this.after = after;
    this.count = count;
  }

  where(field: string, operator: string, value: unknown): FakeQuery {
    return new FakeQuery(
      this.path,
      this.database,
      [...this.filters, { field, operator, value }],
      this.orders,
      this.after,
      this.count,
    );
  }

  orderBy(field: string, direction: "asc" | "desc"): FakeQuery {
    return new FakeQuery(
      this.path,
      this.database,
      this.filters,
      [...this.orders, { field, direction }],
      this.after,
      this.count,
    );
  }

  startAfter(...values: unknown[]): FakeQuery {
    return new FakeQuery(
      this.path,
      this.database,
      this.filters,
      this.orders,
      values,
      this.count,
    );
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(
      this.path,
      this.database,
      this.filters,
      this.orders,
      this.after,
      count,
    );
  }

  async get(): Promise<{ docs: Array<{ id: string; data(): StoredData }> }> {
    let entries = [...this.database.documents.entries()].filter(([path]) => {
      const remainder = path.slice(`${this.path}/`.length);
      return path.startsWith(`${this.path}/`) && !remainder.includes("/");
    });

    entries = entries.filter(([, data]) =>
      this.filters.every(({ field, operator, value }) => {
        const actual = field === "__name__" ? undefined : data[field];
        if (operator === "<=") {
          return (
            typeof actual === "string" &&
            typeof value === "string" &&
            actual <= value
          );
        }
        if (operator === ">=") {
          return (
            typeof actual === "string" &&
            typeof value === "string" &&
            actual >= value
          );
        }
        if (operator === "==") return actual === value;
        return false;
      }),
    );

    entries.sort((left, right) => {
      for (const order of this.orders) {
        const leftValue =
          order.field === "__name__"
            ? left[0].slice(`${this.path}/`.length)
            : left[1][order.field];
        const rightValue =
          order.field === "__name__"
            ? right[0].slice(`${this.path}/`.length)
            : right[1][order.field];
        const compared = String(leftValue).localeCompare(String(rightValue));
        if (compared !== 0) {
          return order.direction === "asc" ? compared : -compared;
        }
      }
      return 0;
    });

    if (this.after) {
      entries = entries.filter(([path, data]) => {
        const values = this.orders.map((order) =>
          order.field === "__name__"
            ? path.slice(`${this.path}/`.length)
            : data[order.field],
        );
        for (let index = 0; index < values.length; index += 1) {
          const compared = String(values[index]).localeCompare(
            String(this.after?.[index]),
          );
          if (compared !== 0) {
            return this.orders[index]?.direction === "desc"
              ? compared < 0
              : compared > 0;
          }
        }
        return false;
      });
    }

    if (this.count !== undefined) {
      entries = entries.slice(0, this.count);
    }

    return {
      docs: entries.map(([path, data]) => ({
        id: path.split("/").at(-1) ?? "",
        data: () => ({ ...data }),
      })),
    };
  }
}

class FakeDatabase {
  readonly documents = new Map<string, StoredData>();
  private transactionTail: Promise<void> = Promise.resolve();

  collection(name: string): FakeCollection {
    return new FakeCollection(name, this);
  }

  seed(path: string, data: StoredData): void {
    this.documents.set(path, { ...data });
  }

  get(path: string): StoredData | undefined {
    const data = this.documents.get(path);
    return data === undefined ? undefined : { ...data };
  }

  async runTransaction<T>(
    work: (transaction: FirebaseFirestore.Transaction) => Promise<T>,
  ): Promise<T> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const writes: PendingWrite[] = [];
    let hasWritten = false;
    const transaction = {
      get: async (reference: FakeReference) => {
        if (hasWritten) {
          throw new Error("Transactions must perform all reads before writes.");
        }
        return new FakeSnapshot(
          reference.id,
          this.documents.get(reference.path),
        );
      },
      set: (reference: FakeReference, data: StoredData) => {
        hasWritten = true;
        writes.push({ kind: "set", reference, data: { ...data } });
        return transaction;
      },
      create: (reference: FakeReference, data: StoredData) => {
        hasWritten = true;
        writes.push({ kind: "create", reference, data: { ...data } });
        return transaction;
      },
      update: (reference: FakeReference, data: StoredData) => {
        hasWritten = true;
        writes.push({ kind: "update", reference, data: { ...data } });
        return transaction;
      },
      delete: (reference: FakeReference) => {
        hasWritten = true;
        writes.push({ kind: "delete", reference });
        return transaction;
      },
    };

    try {
      const result = await work(
        transaction as unknown as FirebaseFirestore.Transaction,
      );
      for (const write of writes) {
        if (write.kind === "delete") {
          this.documents.delete(write.reference.path);
        } else if (write.kind === "create") {
          if (this.documents.has(write.reference.path)) {
            throw new Error("Document already exists.");
          }
          this.documents.set(write.reference.path, write.data ?? {});
        } else if (write.kind === "update") {
          const current = this.documents.get(write.reference.path);
          if (!current) {
            throw new Error("Document does not exist.");
          }
          this.documents.set(write.reference.path, {
            ...current,
            ...write.data,
          });
        } else {
          this.documents.set(write.reference.path, write.data ?? {});
        }
      }
      return result;
    } finally {
      release();
    }
  }
}

const uidA = "user-a";
const uidB = "user-b";
const idA = "123e4567-e89b-42d3-a456-426614174000";
const idB = "123e4567-e89b-42d3-a456-426614174001";
const isbnA = "0123456789";
const isbnB = "1234567890123";

function input(overrides: Partial<BookWriteInput> = {}): BookWriteInput {
  return {
    titulo: "Libro",
    autor: "Autora",
    isbn: null,
    estado: "pendiente",
    portada_url: null,
    ...overrides,
  };
}

function bookData(overrides: Partial<BookDocument> = {}): BookDocument {
  return {
    id: idA,
    titulo: "Libro",
    autor: "Autora",
    isbn: null,
    estado: "pendiente",
    portada_url: null,
    prestado_a: null,
    fecha_prestamo: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("book Firestore repository", () => {
  let database: FakeDatabase;

  beforeEach(() => {
    vi.resetAllMocks();
    database = new FakeDatabase();
    firestoreMocks.getFirestoreDb.mockReturnValue(database);
  });

  it("creates the book and its ISBN reservation under the verified user's path", async () => {
    const created = await putBook(uidA, idA, input({ isbn: isbnA }));

    expect(created.id).toBe(idA);
    expect(database.get(`usuarios/${uidA}/libro/${idA}`)).toMatchObject({
      isbn: isbnA,
      prestado_a: null,
      fecha_prestamo: null,
    });
    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)).toEqual({
      libro_id: idA,
      isbn: isbnA,
    });
    expect(database.get(`usuarios/${uidB}/libro/${idA}`)).toBeUndefined();
  });

  it("serializes concurrent claims for the same user's ISBN", async () => {
    const results = await Promise.allSettled([
      putBook(uidA, idA, input({ isbn: isbnA })),
      putBook(uidA, idB, input({ isbn: isbnA })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      status: 409,
      message: "El ISBN ya está registrado",
    });
    expect(
      [...database.documents.keys()].filter((path) =>
        path.startsWith(`usuarios/${uidA}/isbn/`),
      ),
    ).toHaveLength(1);
  });

  it("allows the same ISBN for a different user", async () => {
    await Promise.all([
      putBook(uidA, idA, input({ isbn: isbnA })),
      putBook(uidB, idB, input({ isbn: isbnA })),
    ]);

    expect(database.get(`usuarios/${uidA}/libro/${idA}`)?.isbn).toBe(isbnA);
    expect(database.get(`usuarios/${uidB}/libro/${idB}`)?.isbn).toBe(isbnA);
    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)?.libro_id).toBe(idA);
    expect(database.get(`usuarios/${uidB}/isbn/${isbnA}`)?.libro_id).toBe(idB);
  });

  it("does not list, delete, lend, or return another user's book", async () => {
    const book = await putBook(uidB, idA, input({ isbn: isbnA }));
    const bookPath = `usuarios/${uidB}/libro/${idA}`;
    const reservationPath = `usuarios/${uidB}/isbn/${isbnA}`;
    const originalBook = database.get(bookPath);
    const originalReservation = database.get(reservationPath);
    const watermark = new Date(Date.parse(book.updated_at) + 1).toISOString();

    const userAPage = await listBooks(uidA, {
      since: null,
      watermark,
    });
    expect(userAPage.items).toEqual([]);

    await expect(deleteBook(uidA, idA)).rejects.toMatchObject({ status: 404 });
    await expect(
      lendBook(uidA, idA, {
        prestado_a: "Lector",
        fecha_prestamo: "2026-11-20",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(returnBook(uidA, idA)).rejects.toMatchObject({ status: 404 });

    expect(database.get(bookPath)).toEqual(originalBook);
    expect(database.get(reservationPath)).toEqual(originalReservation);
  });

  it("upserts a colliding UUID only in the authenticated user's collection", async () => {
    await putBook(uidB, idA, input({ isbn: isbnA, titulo: "Libro de B" }));
    const userBBookPath = `usuarios/${uidB}/libro/${idA}`;
    const userBReservationPath = `usuarios/${uidB}/isbn/${isbnA}`;
    const originalUserBBook = database.get(userBBookPath);
    const originalUserBReservation = database.get(userBReservationPath);

    await putBook(uidA, idA, input({ isbn: isbnB, titulo: "Libro de A" }));

    expect(database.get(`usuarios/${uidA}/libro/${idA}`)).toMatchObject({
      titulo: "Libro de A",
      isbn: isbnB,
    });
    expect(database.get(`usuarios/${uidA}/isbn/${isbnB}`)?.libro_id).toBe(idA);
    expect(database.get(userBBookPath)).toEqual(originalUserBBook);
    expect(database.get(userBReservationPath)).toEqual(originalUserBReservation);
  });

  it("releases the old ISBN reservation when changing ISBN", async () => {
    await putBook(uidA, idA, input({ isbn: isbnA }));

    await putBook(uidA, idA, input({ isbn: isbnB }));

    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)).toBeUndefined();
    expect(database.get(`usuarios/${uidA}/isbn/${isbnB}`)?.libro_id).toBe(idA);
  });

  it("does not overwrite an inconsistent ISBN reservation", async () => {
    database.seed(`usuarios/${uidA}/isbn/${isbnA}`, {
      libro_id: idB,
      isbn: isbnA,
    });

    await expect(putBook(uidA, idA, input({ isbn: isbnA }))).rejects.toMatchObject({
      status: 409,
    });

    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)?.libro_id).toBe(idB);
    expect(database.get(`usuarios/${uidA}/libro/${idA}`)).toBeUndefined();
  });

  it("preserves timestamps for identical PUT data and updates only on a real change", async () => {
    const original = bookData({ isbn: isbnA });
    database.seed(`usuarios/${uidA}/libro/${idA}`, {
      ...original,
      id: undefined,
    });
    database.seed(`usuarios/${uidA}/isbn/${isbnA}`, {
      libro_id: idA,
      isbn: isbnA,
    });

    const identical = await putBook(uidA, idA, input({ isbn: isbnA }));
    expect(identical.created_at).toBe(original.created_at);
    expect(identical.updated_at).toBe(original.updated_at);

    const changed = await putBook(
      uidA,
      idA,
      input({ isbn: isbnA, titulo: "Libro editado" }),
    );
    expect(changed.created_at).toBe(original.created_at);
    expect(Date.parse(changed.updated_at)).toBeGreaterThan(
      Date.parse(original.updated_at),
    );
  });

  it("preserves active loans on PUT and changes only loan fields on lend/return", async () => {
    const original = bookData({
      prestado_a: "Lector",
      fecha_prestamo: "2026-11-20",
    });
    database.seed(`usuarios/${uidA}/libro/${idA}`, {
      ...original,
      id: undefined,
    });

    const edited = await putBook(uidA, idA, input({ titulo: "Editado" }));
    expect(edited.prestado_a).toBe("Lector");
    expect(edited.fecha_prestamo).toBe("2026-11-20");

    await expect(
      lendBook(uidA, idA, {
        prestado_a: "Otro lector",
        fecha_prestamo: "2026-11-21",
      }),
    ).rejects.toMatchObject({ status: 409 });

    const returned = await returnBook(uidA, idA);
    expect(returned.prestado_a).toBeNull();
    expect(returned.fecha_prestamo).toBeNull();
    expect(returned.estado).toBe("pendiente");
    expect(returned.titulo).toBe("Editado");
    expect(database.get(`usuarios/${uidA}/libro/${idA}`)).toMatchObject({
      prestado_a: null,
      fecha_prestamo: null,
      titulo: "Editado",
      estado: "pendiente",
    });
  });

  it("rejects deletion of a borrowed book and releases ISBN on logical deletion", async () => {
    await putBook(uidA, idA, input({ isbn: isbnA }));
    await lendBook(uidA, idA, {
      prestado_a: "Lector",
      fecha_prestamo: "2026-11-20",
    });

    await expect(deleteBook(uidA, idA)).rejects.toMatchObject({ status: 409 });
    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)?.libro_id).toBe(idA);

    await returnBook(uidA, idA);
    await deleteBook(uidA, idA);

    expect(database.get(`usuarios/${uidA}/libro/${idA}`)?.deleted_at).not.toBeNull();
    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)).toBeUndefined();
    await expect(deleteBook(uidA, "123e4567-e89b-42d3-a456-426614174099"))
      .rejects.toMatchObject({ status: 404 });
  });

  it("allows ISBN reuse after deletion and rejects restoration after it is claimed", async () => {
    await putBook(uidA, idA, input({ isbn: isbnA }));
    await deleteBook(uidA, idA);
    await putBook(uidA, idB, input({ isbn: isbnA }));

    await expect(putBook(uidA, idA, input({ isbn: isbnA }))).rejects.toMatchObject({
      status: 409,
    });
    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)?.libro_id).toBe(idB);
    expect(database.get(`usuarios/${uidA}/libro/${idA}`)?.deleted_at).not.toBeNull();
  });

  it("restores a tombstone and reacquires its released ISBN", async () => {
    await putBook(uidA, idA, input({ isbn: isbnA }));
    await deleteBook(uidA, idA);

    const restored = await putBook(uidA, idA, input({ isbn: isbnA }));

    expect(restored.deleted_at).toBeNull();
    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)?.libro_id).toBe(idA);
  });

  it("does not release another book's ISBN when restoring with a different ISBN", async () => {
    await putBook(uidA, idA, input({ isbn: isbnA }));
    await deleteBook(uidA, idA);
    await putBook(uidA, idB, input({ isbn: isbnA }));

    await putBook(uidA, idA, input({ isbn: isbnB }));

    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)?.libro_id).toBe(idB);
    expect(database.get(`usuarios/${uidA}/isbn/${isbnB}`)?.libro_id).toBe(idA);
  });

  it("releases a stale reservation owned by the restored tombstone", async () => {
    await putBook(uidA, idA, input({ isbn: isbnA }));
    await deleteBook(uidA, idA);
    database.seed(`usuarios/${uidA}/isbn/${isbnA}`, {
      libro_id: idA,
      isbn: isbnA,
    });

    await putBook(uidA, idA, input({ isbn: isbnB }));

    expect(database.get(`usuarios/${uidA}/isbn/${isbnA}`)).toBeUndefined();
    expect(database.get(`usuarios/${uidA}/isbn/${isbnB}`)?.libro_id).toBe(idA);
  });

  it("lists tombstones and paginates equal timestamps with the document ID tie-breaker", async () => {
    const timestamp = "2026-11-20T15:00:00.000Z";
    for (let index = 0; index < 501; index += 1) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const document = bookData({
        id,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: index === 0 ? timestamp : null,
      });
      database.seed(`usuarios/${uidA}/libro/${id}`, {
        ...document,
        id: undefined,
      });
    }

    const first = await listBooks(uidA, {
      since: null,
      watermark: "2026-11-20T15:00:00.000Z",
    });
    const second = await listBooks(uidA, {
      since: null,
      watermark: "2026-11-20T15:00:00.000Z",
      lastUpdatedAt: first.items.at(-1)?.updated_at,
      lastId: first.items.at(-1)?.id,
    });

    expect(first.items).toHaveLength(500);
    expect(first.hasMore).toBe(true);
    expect(first.items.some((item) => item.deleted_at !== null)).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(first.items.at(-1)!.id.localeCompare(second.items[0]!.id)).toBeLessThan(0);
  });

  it("rejects an inconsistent persisted loan without repairing it", async () => {
    const invalidBook = bookData({
      prestado_a: "Lector",
      fecha_prestamo: null,
    });
    const path = `usuarios/${uidA}/libro/${idA}`;
    database.seed(path, { ...invalidBook, id: undefined });

    await expect(
      listBooks(uidA, {
        since: null,
        watermark: "2026-11-21T00:00:00.000Z",
      }),
    ).rejects.toThrow("Stored book document is invalid.");

    expect(database.get(path)).toMatchObject({
      prestado_a: "Lector",
      fecha_prestamo: null,
    });
  });

  it("recovers a change that moves behind an in-progress cursor on the next since request", async () => {
    const since = "2026-11-20T14:00:00.000Z";
    const watermark = "2026-11-20T15:00:00.000Z";
    const earlyId = "00000000-0000-4000-8000-000000000000";
    const earlyBook = bookData({
      id: earlyId,
      created_at: since,
      updated_at: "2026-11-20T14:30:00.000Z",
    });
    database.seed(`usuarios/${uidA}/libro/${earlyId}`, {
      ...earlyBook,
      id: undefined,
    });

    for (let index = 1; index <= 500; index += 1) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const document = bookData({
        id,
        created_at: since,
        updated_at: watermark,
      });
      database.seed(`usuarios/${uidA}/libro/${id}`, {
        ...document,
        id: undefined,
      });
    }

    const first = await listBooks(uidA, { since, watermark });
    expect(first.items).toHaveLength(500);
    expect(first.hasMore).toBe(true);

    database.seed(`usuarios/${uidA}/libro/${earlyId}`, {
      ...earlyBook,
      id: undefined,
      titulo: "Actualizado durante la paginación",
      updated_at: watermark,
    });

    const lastFirstPageItem = first.items.at(-1)!;
    const second = await listBooks(uidA, {
      since,
      watermark,
      lastUpdatedAt: lastFirstPageItem.updated_at,
      lastId: lastFirstPageItem.id,
    });
    expect(second.items.some((item) => item.id === earlyId)).toBe(false);

    const nextSync = await listBooks(uidA, {
      since: watermark,
      watermark,
    });
    expect(nextSync.items.find((item) => item.id === earlyId)?.titulo).toBe(
      "Actualizado durante la paginación",
    );
  });
});
