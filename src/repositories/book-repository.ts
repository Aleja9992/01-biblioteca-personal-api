import "server-only";
import { FieldPath, type DocumentReference } from "firebase-admin/firestore";
import { ApiError } from "../lib/api-errors";
import { getFirestoreDb } from "../lib/firebase-admin";
import {
  bookDocumentSchema,
  type BookDocument,
  type BookWriteInput,
  type LoanWriteInput,
} from "../schemas/book";

const pageSize = 500;

export type BookPageCursor = {
  since: string | null;
  watermark: string;
  lastUpdatedAt?: string;
  lastId?: string;
};

export type BookPage = {
  items: BookDocument[];
  hasMore: boolean;
};

function collectionForUser(uid: string) {
  return getFirestoreDb().collection("usuarios").doc(uid);
}

function bookReference(uid: string, id: string): DocumentReference {
  return collectionForUser(uid).collection("libro").doc(id);
}

function toBookDocument(id: string, data: unknown): BookDocument {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Stored book document is invalid.");
  }

  const parsed = bookDocumentSchema.safeParse({ ...data, id });

  if (!parsed.success) {
    throw new Error("Stored book document is invalid.");
  }

  return parsed.data;
}

function reservationData(
  snapshot: FirebaseFirestore.DocumentSnapshot,
): { libro_id: string; isbn: string } | undefined {
  if (!snapshot.exists) {
    return undefined;
  }

  const data = snapshot.data();
  if (
    typeof data?.libro_id !== "string" ||
    typeof data.isbn !== "string"
  ) {
    throw new Error("Stored ISBN reservation is invalid.");
  }

  return { libro_id: data.libro_id, isbn: data.isbn };
}

function assertReservationForBook(
  reservation: { libro_id: string; isbn: string } | undefined,
  isbn: string,
  bookId: string,
): void {
  if (
    !reservation ||
    reservation.isbn !== isbn ||
    reservation.libro_id !== bookId
  ) {
    throw new ApiError(500, "Error interno");
  }
}

function nextUpdatedAt(previous?: string): string {
  const now = Date.now();
  const previousTime = previous === undefined ? Number.NaN : Date.parse(previous);
  const nextTime = Number.isFinite(previousTime)
    ? Math.max(now, previousTime + 1)
    : now;

  return new Date(nextTime).toISOString();
}

function sameBookData(
  current: BookDocument,
  next: Omit<BookDocument, "id" | "created_at" | "updated_at" | "deleted_at">,
): boolean {
  return (
    current.titulo === next.titulo &&
    current.autor === next.autor &&
    current.isbn === next.isbn &&
    current.estado === next.estado &&
    current.portada_url === next.portada_url &&
    current.prestado_a === next.prestado_a &&
    current.fecha_prestamo === next.fecha_prestamo
  );
}

export async function putBook(
  uid: string,
  id: string,
  input: BookWriteInput,
): Promise<BookDocument> {
  const user = collectionForUser(uid);
  const reference = user.collection("libro").doc(id);

  return getFirestoreDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists
      ? toBookDocument(id, snapshot.data())
      : undefined;
    const oldIsbn = current?.isbn ?? null;
    const newIsbn = input.isbn;
    const reservationIsbns = new Set(
      [oldIsbn, newIsbn].filter((isbn): isbn is string => isbn !== null),
    );
    const reservations = new Map<
      string,
      FirebaseFirestore.DocumentSnapshot
    >();

    for (const isbn of reservationIsbns) {
      reservations.set(
        isbn,
        await transaction.get(user.collection("isbn").doc(isbn)),
      );
    }

    const oldReservation = oldIsbn
      ? reservationData(reservations.get(oldIsbn)!)
      : undefined;
    const newReservation = newIsbn
      ? reservationData(reservations.get(newIsbn)!)
      : undefined;
    const currentIsActive = current !== undefined && current.deleted_at === null;

    if (oldReservation !== undefined && oldReservation.isbn !== oldIsbn) {
      throw new ApiError(500, "Error interno");
    }

    if (currentIsActive && oldIsbn !== null) {
      assertReservationForBook(oldReservation, oldIsbn, id);
    }

    if (newReservation) {
      if (newReservation.isbn !== newIsbn) {
        throw new ApiError(500, "Error interno");
      }

      if (newReservation.libro_id !== id) {
        throw new ApiError(409, "El ISBN ya está registrado");
      }

      if (
        current === undefined ||
        (current.deleted_at === null && current.isbn !== newIsbn) ||
        (current.deleted_at !== null && current.isbn !== newIsbn)
      ) {
        throw new ApiError(500, "Error interno");
      }
    }

    if (
      current !== undefined &&
      ((current.prestado_a === null) !== (current.fecha_prestamo === null))
    ) {
      throw new ApiError(409, "El estado del préstamo no es válido");
    }

    if (
      current !== undefined &&
      current.deleted_at !== null &&
      (current.prestado_a !== null || current.fecha_prestamo !== null)
    ) {
      throw new ApiError(409, "El estado del préstamo no es válido");
    }

    const nextBook = {
      titulo: input.titulo,
      autor: input.autor,
      isbn: newIsbn,
      estado: input.estado,
      portada_url: input.portada_url,
      prestado_a: current?.prestado_a ?? null,
      fecha_prestamo: current?.fecha_prestamo ?? null,
    };

    if (
      currentIsActive &&
      sameBookData(current, nextBook)
    ) {
      return current;
    }

    const timestamp = nextUpdatedAt(current?.updated_at);
    const document: BookDocument = {
      id,
      ...nextBook,
      created_at: current?.created_at ?? timestamp,
      updated_at: timestamp,
      deleted_at: null,
    };

    if (
      oldIsbn !== newIsbn &&
      oldIsbn !== null &&
      oldReservation
        ?.libro_id === id
    ) {
      transaction.delete(user.collection("isbn").doc(oldIsbn));
    }

    if (newIsbn !== null && newReservation === undefined) {
      transaction.create(user.collection("isbn").doc(newIsbn), {
        libro_id: id,
        isbn: newIsbn,
      });
    }

    const storedDocument: Omit<BookDocument, "id"> = {
      titulo: document.titulo,
      autor: document.autor,
      isbn: document.isbn,
      estado: document.estado,
      portada_url: document.portada_url,
      prestado_a: document.prestado_a,
      fecha_prestamo: document.fecha_prestamo,
      created_at: document.created_at,
      updated_at: document.updated_at,
      deleted_at: document.deleted_at,
    };
    transaction.set(reference, storedDocument);

    return document;
  });
}

export async function listBooks(
  uid: string,
  cursor: BookPageCursor,
): Promise<BookPage> {
  const collection = collectionForUser(uid).collection("libro");
  let query = collection.where("updated_at", "<=", cursor.watermark);

  if (cursor.since !== null) {
    query = query.where("updated_at", ">=", cursor.since);
  }

  query = query
    .orderBy("updated_at", "asc")
    .orderBy(FieldPath.documentId(), "asc");

  if (cursor.lastUpdatedAt !== undefined && cursor.lastId !== undefined) {
    query = query.startAfter(cursor.lastUpdatedAt, cursor.lastId);
  }

  const snapshot = await query.limit(pageSize + 1).get();
  const hasMore = snapshot.docs.length > pageSize;
  const pageDocuments = snapshot.docs.slice(0, pageSize);

  return {
    items: pageDocuments.map((document) =>
      toBookDocument(document.id, document.data()),
    ),
    hasMore,
  };
}

export async function deleteBook(uid: string, id: string): Promise<void> {
  const user = collectionForUser(uid);
  const reference = user.collection("libro").doc(id);

  await getFirestoreDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists) {
      throw new ApiError(404, "Libro no encontrado");
    }

    const current = toBookDocument(id, snapshot.data());

    if (current.deleted_at !== null) {
      return;
    }

    if (current.prestado_a !== null || current.fecha_prestamo !== null) {
      throw new ApiError(409, "No se puede borrar un libro prestado");
    }

    const reservationSnapshot =
      current.isbn === null
        ? undefined
        : await transaction.get(user.collection("isbn").doc(current.isbn));
    const reservation =
      reservationSnapshot === undefined
        ? undefined
        : reservationData(reservationSnapshot);

    if (current.isbn !== null) {
      assertReservationForBook(reservation, current.isbn, id);
    }

    const timestamp = nextUpdatedAt(current.updated_at);
    transaction.update(reference, {
      deleted_at: timestamp,
      updated_at: timestamp,
    });

    if (current.isbn !== null) {
      transaction.delete(user.collection("isbn").doc(current.isbn));
    }
  });
}

export async function lendBook(
  uid: string,
  id: string,
  input: LoanWriteInput,
): Promise<BookDocument> {
  const reference = bookReference(uid, id);

  return getFirestoreDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists) {
      throw new ApiError(404, "Libro no encontrado");
    }

    const current = toBookDocument(id, snapshot.data());

    if (current.deleted_at !== null) {
      throw new ApiError(404, "Libro no encontrado");
    }

    if (current.prestado_a !== null || current.fecha_prestamo !== null) {
      throw new ApiError(409, "El libro ya está prestado");
    }

    const timestamp = nextUpdatedAt(current.updated_at);
    const updated: BookDocument = {
      ...current,
      prestado_a: input.prestado_a,
      fecha_prestamo: input.fecha_prestamo,
      updated_at: timestamp,
    };

    transaction.update(reference, {
      prestado_a: input.prestado_a,
      fecha_prestamo: input.fecha_prestamo,
      updated_at: timestamp,
    });

    return updated;
  });
}

export async function returnBook(uid: string, id: string): Promise<BookDocument> {
  const reference = bookReference(uid, id);

  return getFirestoreDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists) {
      throw new ApiError(404, "Libro no encontrado");
    }

    const current = toBookDocument(id, snapshot.data());

    if (current.deleted_at !== null) {
      throw new ApiError(404, "Libro no encontrado");
    }

    if (current.prestado_a === null && current.fecha_prestamo === null) {
      return current;
    }

    if (current.prestado_a === null || current.fecha_prestamo === null) {
      throw new ApiError(409, "El estado del préstamo no es válido");
    }

    const timestamp = nextUpdatedAt(current.updated_at);
    const updated: BookDocument = {
      ...current,
      prestado_a: null,
      fecha_prestamo: null,
      updated_at: timestamp,
    };

    transaction.update(reference, {
      prestado_a: null,
      fecha_prestamo: null,
      updated_at: timestamp,
    });

    return updated;
  });
}
