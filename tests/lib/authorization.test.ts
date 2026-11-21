import { beforeEach, describe, expect, it, vi } from "vitest";

const firebaseMocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getFirebaseAdminApp: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: firebaseMocks.getAuth,
}));

vi.mock("server-only", () => ({}));

vi.mock("../../src/lib/firebase-admin", () => ({
  getFirebaseAdminApp: firebaseMocks.getFirebaseAdminApp,
}));

import { authorizeAdmin, requireAdminRequest } from "../../src/lib/authorization";

function adminRequest(body?: unknown): Request {
  return new Request("https://api.example.invalid/admin?rol=admin", {
    method: "POST",
    headers: {
      Authorization: "Bearer TEST_ADMIN_TOKEN",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
}

describe("admin authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firebaseMocks.getFirebaseAdminApp.mockReturnValue({});
    firebaseMocks.getAuth.mockReturnValue({
      verifyIdToken: firebaseMocks.verifyIdToken,
    });
  });

  it("denies a verified user without the admin claim", async () => {
    firebaseMocks.verifyIdToken.mockResolvedValue({
      uid: "verified-user",
      rol: "reader",
    });

    await expect(requireAdminRequest(adminRequest())).rejects.toMatchObject({
      status: 403,
      message: "Permisos insuficientes",
    });
    expect(firebaseMocks.verifyIdToken).toHaveBeenCalledWith(
      "TEST_ADMIN_TOKEN",
      true,
    );
  });

  it("allows only an admin claim from the verified token", async () => {
    firebaseMocks.verifyIdToken.mockResolvedValue({
      uid: "verified-admin",
      rol: "admin",
    });

    await expect(requireAdminRequest(adminRequest({ rol: "reader" }))).resolves
      .toMatchObject({ uid: "verified-admin", rol: "admin" });
    expect(firebaseMocks.verifyIdToken).toHaveBeenCalledWith(
      "TEST_ADMIN_TOKEN",
      true,
    );
  });

  it("does not grant admin access from request data", () => {
    expect(() =>
      authorizeAdmin({
        uid: "verified-user",
        email: null,
        rol: "reader",
      }),
    ).toThrow("Permisos insuficientes");
  });

  it("returns 401 for a revoked admin token", async () => {
    firebaseMocks.verifyIdToken.mockRejectedValue(
      Object.assign(new Error("revocation detail"), {
        code: "auth/id-token-revoked",
      }),
    );

    await expect(requireAdminRequest(adminRequest())).rejects.toMatchObject({
      status: 401,
      message: "Token inválido o expirado",
    });
  });
});
