import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}));
const bookServiceMocks = vi.hoisted(() => ({
  lendUserBook: vi.fn(),
  listUserBooks: vi.fn(),
  logicallyDeleteUserBook: vi.fn(),
  returnUserBook: vi.fn(),
  upsertUserBook: vi.fn(),
}));

vi.mock("../../src/lib/authentication", () => authMocks);
vi.mock("../../src/services/book-service", () => bookServiceMocks);

import { ApiError } from "../../src/lib/api-errors";
import { GET as listBooks } from "../../app/api/libros/route";
import {
  DELETE as deleteBook,
  PUT as putBook,
} from "../../app/api/libros/[id]/route";
import {
  DELETE as returnBook,
  PUT as lendBook,
} from "../../app/api/libros/[id]/prestamo/route";

const id = "123e4567-e89b-42d3-a456-426614174000";
const book = {
  id,
  titulo: "Libro",
  autor: "Autora",
  isbn: null,
  estado: "pendiente",
  portada_url: null,
  prestado_a: null,
  fecha_prestamo: null,
  created_at: "2026-11-20T15:00:00.000Z",
  updated_at: "2026-11-20T15:00:00.000Z",
  deleted_at: null,
};

function request(
  path: string,
  method = "GET",
  body?: unknown,
): Request {
  return new Request(`https://api.example.invalid${path}`, {
    method,
    headers: {
      Authorization: "Bearer TEST_ID_TOKEN",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context(bookId = id) {
  return { params: Promise.resolve({ id: bookId }) };
}

describe("book Route Handlers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.authenticateRequest.mockResolvedValue({
      uid: "verified-user",
      email: null,
      rol: null,
    });
  });

  it("rejects unauthenticated list requests before calling the service", async () => {
    authMocks.authenticateRequest.mockRejectedValue(
      new ApiError(401, "Autenticación requerida"),
    );

    const response = await listBooks(
      new Request("https://api.example.invalid/api/libros"),
    );

    expect(response.status).toBe(401);
    expect(bookServiceMocks.listUserBooks).not.toHaveBeenCalled();
  });

  it("validates the list query and uses only the verified UID", async () => {
    bookServiceMocks.listUserBooks.mockResolvedValue({
      items: [book],
      servidor_ahora: book.updated_at,
      next_cursor: null,
    });

    const response = await listBooks(
      request(
        `/api/libros?since=${encodeURIComponent(book.updated_at)}&uid=attacker`,
      ),
    );

    expect(response.status).toBe(200);
    expect(bookServiceMocks.listUserBooks).toHaveBeenCalledWith(
      "verified-user",
      { since: book.updated_at, cursor: undefined },
    );
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id }],
      next_cursor: null,
    });
  });

  it("rejects an invalid since value", async () => {
    const response = await listBooks(
      request("/api/libros?since=not-a-date"),
    );

    expect(response.status).toBe(400);
    expect(bookServiceMocks.listUserBooks).not.toHaveBeenCalled();
  });

  it("sanitizes Firestore failures at the Route Handler boundary", async () => {
    bookServiceMocks.listUserBooks.mockRejectedValue(
      new Error("FIRESTORE_INTERNAL_TEST_DETAIL"),
    );

    const response = await listBooks(
      request("/api/libros"),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe(JSON.stringify({ error: "Error interno" }));
    expect(body).not.toContain("FIRESTORE_INTERNAL_TEST_DETAIL");
  });

  it("upserts a book while stripping UID, loan, and server timestamp fields", async () => {
    bookServiceMocks.upsertUserBook.mockResolvedValue(book);
    const response = await putBook(
      request(
        `/api/libros/${id}`,
        "PUT",
        {
          titulo: "Libro",
          autor: "Autora",
          prestado_a: "No autorizado",
          fecha_prestamo: "2026-11-20",
          uid: "otro-usuario",
          created_at: "2000-01-01T00:00:00.000Z",
          updated_at: "2000-01-01T00:00:00.000Z",
          deleted_at: null,
        },
      ),
      context(),
    );

    expect(response.status).toBe(200);
    expect(bookServiceMocks.upsertUserBook).toHaveBeenCalledWith(
      "verified-user",
      id,
      {
        titulo: "Libro",
        autor: "Autora",
        isbn: null,
        estado: "pendiente",
        portada_url: null,
      },
    );
  });

  it("returns 404 for an invalid or inaccessible book without leaking details", async () => {
    bookServiceMocks.upsertUserBook.mockRejectedValue(
      new ApiError(404, "Libro no encontrado"),
    );

    const response = await putBook(
      request(`/api/libros/${id}`, "PUT", {
        titulo: "Libro",
        autor: "Autora",
      }),
      context(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Libro no encontrado",
    });
  });

  it("deletes through the service using the token UID", async () => {
    bookServiceMocks.logicallyDeleteUserBook.mockResolvedValue(undefined);

    const response = await deleteBook(
      request(`/api/libros/${id}`, "DELETE"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(bookServiceMocks.logicallyDeleteUserBook).toHaveBeenCalledWith(
      "verified-user",
      id,
    );
  });

  it("routes valid loan requests and returns business conflicts safely", async () => {
    bookServiceMocks.lendUserBook.mockResolvedValue({
      ...book,
      prestado_a: "Lector",
      fecha_prestamo: "2026-11-20",
    });

    const lentResponse = await lendBook(
      request(`/api/libros/${id}/prestamo`, "PUT", {
        prestado_a: "Lector",
        fecha_prestamo: "2026-11-20",
      }),
      context(),
    );

    expect(lentResponse.status).toBe(200);
    expect(bookServiceMocks.lendUserBook).toHaveBeenCalledWith(
      "verified-user",
      id,
      { prestado_a: "Lector", fecha_prestamo: "2026-11-20" },
    );

    bookServiceMocks.lendUserBook.mockRejectedValue(
      new ApiError(409, "El libro ya está prestado"),
    );
    const conflictResponse = await lendBook(
      request(`/api/libros/${id}/prestamo`, "PUT", {
        prestado_a: "Otro",
        fecha_prestamo: "2026-11-21",
      }),
      context(),
    );

    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toEqual({
      error: "El libro ya está prestado",
    });
  });

  it("returns a book through the dedicated loan endpoint", async () => {
    bookServiceMocks.returnUserBook.mockResolvedValue(book);

    const response = await returnBook(
      request(`/api/libros/${id}/prestamo`, "DELETE"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(bookServiceMocks.returnUserBook).toHaveBeenCalledWith(
      "verified-user",
      id,
    );
  });
});
