import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  deleteBook: vi.fn(),
  lendBook: vi.fn(),
  listBooks: vi.fn(),
  putBook: vi.fn(),
  returnBook: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../src/repositories/book-repository", () => ({
  deleteBook: repositoryMocks.deleteBook,
  lendBook: repositoryMocks.lendBook,
  listBooks: repositoryMocks.listBooks,
  putBook: repositoryMocks.putBook,
  returnBook: repositoryMocks.returnBook,
}));

import { ApiError } from "../../src/lib/api-errors";
import {
  listUserBooks,
  logicallyDeleteUserBook,
  upsertUserBook,
} from "../../src/services/book-service";

const book = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  titulo: "Libro",
  autor: "Autora",
  isbn: null,
  estado: "pendiente" as const,
  portada_url: null,
  prestado_a: null,
  fecha_prestamo: null,
  created_at: "2026-11-20T15:00:00.000Z",
  updated_at: "2026-11-20T15:00:00.000Z",
  deleted_at: null,
};

describe("book service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("API_CURSOR_SECRET", "test-cursor-secret-that-is-long-enough");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("creates a signed next cursor and resumes from its exact boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T15:10:00.000Z"));
    repositoryMocks.listBooks
      .mockResolvedValueOnce({ items: [book], hasMore: true })
      .mockResolvedValueOnce({ items: [], hasMore: false });

    const firstPage = await listUserBooks("user-a", { since: undefined });
    expect(firstPage.next_cursor).not.toBeNull();
    expect(firstPage.servidor_ahora).toBe("2026-11-20T15:10:00.000Z");

    const secondPage = await listUserBooks("user-a", {
      cursor: firstPage.next_cursor!,
      since: undefined,
    });

    expect(secondPage.next_cursor).toBeNull();
    expect(repositoryMocks.listBooks).toHaveBeenLastCalledWith("user-a", {
      since: null,
      watermark: "2026-11-20T15:10:00.000Z",
      lastUpdatedAt: book.updated_at,
      lastId: book.id,
    });
  });

  it("rejects a since timestamp later than its watermark", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T15:10:00.000Z"));

    await expect(
      listUserBooks("user-a", { since: "2026-11-20T15:11:00.000Z" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repositoryMocks.listBooks).not.toHaveBeenCalled();
  });

  it("does not return a truncated page when cursor signing is unavailable", async () => {
    vi.stubEnv("API_CURSOR_SECRET", "");
    repositoryMocks.listBooks.mockResolvedValue({
      items: [book],
      hasMore: true,
    });

    await expect(
      listUserBooks("user-a", { since: undefined }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("validates the UUID before any repository operation", async () => {
    await expect(
      upsertUserBook("user-a", "bad-id", {
        titulo: "Libro",
        autor: "Autora",
        isbn: null,
        estado: "pendiente",
        portada_url: null,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(repositoryMocks.putBook).not.toHaveBeenCalled();
  });

  it("delegates delete using only the verified uid and validated id", async () => {
    repositoryMocks.deleteBook.mockResolvedValue(undefined);

    await logicallyDeleteUserBook("user-a", book.id);

    expect(repositoryMocks.deleteBook).toHaveBeenCalledWith("user-a", book.id);
  });
});
