import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/authentication", () => ({
  authenticateRequest: authMocks.authenticateRequest,
}));

import { GET } from "../../app/api/isbn/[isbn]/route";

describe("GET /api/isbn/:isbn", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 without authentication", async () => {
    authMocks.authenticateRequest.mockRejectedValue(
      new (await import("../../src/lib/api-errors")).ApiError(
        401,
        "Autenticación requerida",
      ),
    );
    const response = await GET(
      new Request("https://api.example.invalid/api/isbn/9781234567897"),
      { params: Promise.resolve({ isbn: "9781234567897" }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid ISBN", async () => {
    authMocks.authenticateRequest.mockResolvedValue({
      uid: "user",
      email: "user@example.invalid",
      rol: null,
    });
    const response = await GET(
      new Request("https://api.example.invalid/api/isbn/abc"),
      { params: Promise.resolve({ isbn: "abc" }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns only title, author and cover", async () => {
    authMocks.authenticateRequest.mockResolvedValue({
      uid: "user",
      email: "user@example.invalid",
      rol: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                volumeInfo: {
                  title: "El libro",
                  authors: ["Autora Uno"],
                  imageLinks: { thumbnail: "https://example.invalid/cover.jpg" },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const response = await GET(
      new Request("https://api.example.invalid/api/isbn/9781234567897"),
      { params: Promise.resolve({ isbn: "9781234567897" }) },
    );
    await expect(response.json()).resolves.toEqual({
      titulo: "El libro",
      autor: "Autora Uno",
      portada: "https://example.invalid/cover.jpg",
    });
  });
});
