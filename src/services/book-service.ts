import "server-only";
import { ApiError } from "../lib/api-errors";
import {
  createBookCursor,
  parseBookCursor,
  type BookCursorPayload,
} from "../lib/book-cursor";
import {
  deleteBook as deleteBookRecord,
  lendBook as lendBookRecord,
  listBooks as listBookRecords,
  putBook as putBookRecord,
  returnBook as returnBookRecord,
} from "../repositories/book-repository";
import {
  bookIdSchema,
  type BookDocument,
  type BookListQuery,
  type BookWriteInput,
  type LoanWriteInput,
} from "../schemas/book";

export type BookListResponse = {
  items: BookDocument[];
  servidor_ahora: string;
  next_cursor: string | null;
};

function validateBookId(id: string): string {
  const parsed = bookIdSchema.safeParse(id);

  if (!parsed.success) {
    throw new ApiError(400, "Solicitud inválida", [
      { campo: "id", mensaje: "Valor inválido" },
    ]);
  }

  return parsed.data;
}

function newCursorPayload(
  uid: string,
  since: string | null,
  watermark: string,
  lastUpdatedAt: string,
  lastId: string,
): BookCursorPayload {
  return {
    version: 1,
    uid,
    since,
    watermark,
    lastUpdatedAt,
    lastId,
  };
}

export async function listUserBooks(
  uid: string,
  query: BookListQuery,
): Promise<BookListResponse> {
  let state: BookCursorPayload;

  if (query.cursor !== undefined) {
    state = parseBookCursor(query.cursor, uid, query.since);
  } else {
    const watermark = new Date().toISOString();
    const since = query.since ?? null;

    if (since !== null && Date.parse(since) > Date.parse(watermark)) {
      throw new ApiError(400, "Solicitud inválida", [
        { campo: "since", mensaje: "Valor inválido" },
      ]);
    }

    state = {
      version: 1,
      uid,
      since,
      watermark,
      lastUpdatedAt: watermark,
      lastId: "00000000-0000-0000-0000-000000000000",
    };
  }

  const page = await listBookRecords(uid, {
    since: state.since,
    watermark: state.watermark,
    lastUpdatedAt: query.cursor === undefined ? undefined : state.lastUpdatedAt,
    lastId: query.cursor === undefined ? undefined : state.lastId,
  });
  const lastItem = page.items.at(-1);
  const nextCursor =
    page.hasMore && lastItem
      ? createBookCursor(
          newCursorPayload(
            uid,
            state.since,
            state.watermark,
            lastItem.updated_at,
            lastItem.id,
          ),
        )
      : null;

  return {
    items: page.items,
    servidor_ahora: state.watermark,
    next_cursor: nextCursor,
  };
}

export async function upsertUserBook(
  uid: string,
  id: string,
  input: BookWriteInput,
): Promise<BookDocument> {
  return putBookRecord(uid, validateBookId(id), input);
}

export async function logicallyDeleteUserBook(
  uid: string,
  id: string,
): Promise<void> {
  await deleteBookRecord(uid, validateBookId(id));
}

export async function lendUserBook(
  uid: string,
  id: string,
  input: LoanWriteInput,
): Promise<BookDocument> {
  return lendBookRecord(uid, validateBookId(id), input);
}

export async function returnUserBook(
  uid: string,
  id: string,
): Promise<BookDocument> {
  return returnBookRecord(uid, validateBookId(id));
}
