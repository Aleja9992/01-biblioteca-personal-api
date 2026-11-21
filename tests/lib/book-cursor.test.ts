import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ApiError } from "../../src/lib/api-errors";
import {
  createBookCursor,
  parseBookCursor,
  type BookCursorPayload,
} from "../../src/lib/book-cursor";

const cursorPayload: BookCursorPayload = {
  version: 1,
  uid: "user-a",
  since: "2026-11-20T15:00:00.000Z",
  watermark: "2026-11-20T15:10:00.000Z",
  lastUpdatedAt: "2026-11-20T15:05:00.000Z",
  lastId: "123e4567-e89b-42d3-a456-426614174000",
};

describe("book pagination cursor", () => {
  beforeEach(() => {
    vi.stubEnv("API_CURSOR_SECRET", "test-cursor-secret-that-is-long-enough");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips the signed cursor for its authenticated user and filter", () => {
    const cursor = createBookCursor(cursorPayload);

    expect(parseBookCursor(cursor, "user-a", cursorPayload.since)).toEqual(
      cursorPayload,
    );
  });

  it("rejects a cursor altered after signing", () => {
    const cursor = createBookCursor(cursorPayload);
    const [payload, encodedSignature] = cursor.split(".");
    if (payload === undefined || encodedSignature === undefined) {
      throw new Error("Expected a two-part cursor");
    }
    const signature = Buffer.from(encodedSignature, "base64url");
    const firstByte = signature.at(0);
    if (firstByte === undefined) {
      throw new Error("Expected a non-empty cursor signature");
    }
    signature[0] = firstByte ^ 1;
    const altered = `${payload}.${signature.toString("base64url")}`;

    expect(() => parseBookCursor(altered, "user-a")).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("rejects a cursor bound to another user or since filter", () => {
    const cursor = createBookCursor(cursorPayload);

    expect(() => parseBookCursor(cursor, "user-b")).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
    expect(() =>
      parseBookCursor(cursor, "user-a", "2026-11-20T14:00:00.000Z"),
    ).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it("fails safely when the signing secret is missing", () => {
    vi.stubEnv("API_CURSOR_SECRET", "");

    try {
      createBookCursor(cursorPayload);
      throw new Error("Expected cursor creation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 503,
        message: "Servicio no disponible",
      });
    }
  });
});
