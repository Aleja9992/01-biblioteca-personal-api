import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}));

const blobMocks = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/authentication", () => ({
  authenticateRequest: authMocks.authenticateRequest,
}));
vi.mock("@vercel/blob", () => blobMocks);

import { DELETE, POST } from "../../app/api/imagenes/route";

describe("/api/imagenes", () => {
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
    const response = await POST(
      new Request("https://api.example.invalid/api/imagenes"),
    );
    expect(response.status).toBe(401);
  });

  it("rejects unsupported image types", async () => {
    authMocks.authenticateRequest.mockResolvedValue({
      uid: "user",
      email: null,
      rol: null,
    });
    const response = await POST(
      new Request("https://api.example.invalid/api/imagenes", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "text",
      }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects images larger than 4 MiB", async () => {
    authMocks.authenticateRequest.mockResolvedValue({
      uid: "user",
      email: null,
      rol: null,
    });
    const response = await POST(
      new Request("https://api.example.invalid/api/imagenes", {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: new Uint8Array(4 * 1024 * 1024 + 1),
      }),
    );
    expect(response.status).toBe(413);
  });

  it("uploads an image under the authenticated UID", async () => {
    authMocks.authenticateRequest.mockResolvedValue({
      uid: "user",
      email: null,
      rol: null,
    });
    blobMocks.put.mockResolvedValue({
      url: "https://blob.example.invalid/usuarios/user/image.png",
      pathname: "usuarios/user/image.png",
    });
    const response = await POST(
      new Request("https://api.example.invalid/api/imagenes", {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: new Uint8Array([1, 2, 3]),
      }),
    );
    expect(response.status).toBe(201);
    expect(blobMocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^usuarios\/user\/.+\.png$/),
      expect.any(ArrayBuffer),
      expect.objectContaining({ access: "public", addRandomSuffix: true }),
    );
  });

  it("allows deletion only for an owned image", async () => {
    authMocks.authenticateRequest.mockResolvedValue({
      uid: "user",
      email: null,
      rol: null,
    });
    blobMocks.del.mockResolvedValue(undefined);
    const owned = await DELETE(
      new Request(
        "https://api.example.invalid/api/imagenes?url=https://blob.example.invalid/usuarios/user/image.png",
        { method: "DELETE" },
      ),
    );
    expect(owned.status).toBe(200);

    const foreign = await DELETE(
      new Request(
        "https://api.example.invalid/api/imagenes?url=https://blob.example.invalid/usuarios/other/image.png",
        { method: "DELETE" },
      ),
    );
    expect(foreign.status).toBe(403);
  });
});
