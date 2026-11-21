import { describe, expect, it } from "vitest";
import {
  bookIdSchema,
  bookDocumentSchema,
  bookListQuerySchema,
  bookWriteSchema,
  loanWriteSchema,
} from "../../src/schemas/book";

describe("book schemas", () => {
  const document = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    titulo: "Libro",
    autor: "Autora",
    isbn: null,
    estado: "pendiente",
    portada_url: null,
    created_at: "2026-11-20T15:00:00.000Z",
    updated_at: "2026-11-20T15:00:00.000Z",
    deleted_at: null,
  };

  it("applies defaults and strips protected or undeclared fields", () => {
    const parsed = bookWriteSchema.parse({
      titulo: "Libro",
      autor: "Autora",
      prestado_a: "No debe aplicarse",
      fecha_prestamo: "2026-11-20",
      uid: "otro-usuario",
      created_at: "2000-01-01T00:00:00.000Z",
    });

    expect(parsed).toEqual({
      titulo: "Libro",
      autor: "Autora",
      isbn: null,
      estado: "pendiente",
      portada_url: null,
    });
  });

  it.each([" ", "x"])("rejects titles shorter than two non-space characters", (titulo) => {
    expect(
      bookWriteSchema.safeParse({ titulo, autor: "Autora" }).success,
    ).toBe(false);
  });

  it("accepts cover URLs and rejects malformed ISBNs", () => {
    expect(
      bookWriteSchema.safeParse({
        titulo: "Libro",
        autor: "Autora",
        portada_url: "https://example.invalid/cover.jpg",
      }).success,
    ).toBe(true);
    expect(
      bookWriteSchema.safeParse({
        titulo: "Libro",
        autor: "Autora",
        isbn: "978-1-234-56789-0",
      }).success,
    ).toBe(false);
  });

  it("validates UUIDs, ISO timestamps, and real calendar dates", () => {
    expect(bookIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(
      bookListQuerySchema.safeParse({ since: "2026-11-20T15:00:00-05:00" })
        .success,
    ).toBe(true);
    expect(
      loanWriteSchema.safeParse({
        prestado_a: "Lector",
        fecha_prestamo: "2026-02-30",
      }).success,
    ).toBe(false);
  });

  it.each([
    [null, null],
    ["Lector", "2026-11-20"],
  ])("accepts a consistent persisted loan state", (prestado_a, fecha_prestamo) => {
    expect(
      bookDocumentSchema.safeParse({
        ...document,
        prestado_a,
        fecha_prestamo,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["Lector", null],
    [null, "2026-11-20"],
  ])("rejects a partial persisted loan state", (prestado_a, fecha_prestamo) => {
    expect(
      bookDocumentSchema.safeParse({
        ...document,
        prestado_a,
        fecha_prestamo,
      }).success,
    ).toBe(false);
  });
});
