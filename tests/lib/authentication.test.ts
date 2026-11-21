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

import { authenticateRequest } from "../../src/lib/authentication";

function requestWithAuthorization(authorization?: string): Request {
  const headers = new Headers();

  if (authorization !== undefined) {
    headers.set("Authorization", authorization);
  }

  return new Request("https://api.example.invalid/private?uid=attacker", {
    headers,
  });
}

function firebaseError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe("request authentication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firebaseMocks.getFirebaseAdminApp.mockReturnValue({});
    firebaseMocks.getAuth.mockReturnValue({
      verifyIdToken: firebaseMocks.verifyIdToken,
    });
  });

  it("rejects a request without a token", async () => {
    await expect(authenticateRequest(requestWithAuthorization())).rejects.toMatchObject({
      status: 401,
      message: "Autenticación requerida",
    });
    expect(firebaseMocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it.each(["Basic value", "Bearer", "Bearer token with spaces"])(
    "rejects a malformed authorization header: %s",
    async (authorization) => {
      await expect(
        authenticateRequest(requestWithAuthorization(authorization)),
      ).rejects.toMatchObject({ status: 401 });
      expect(firebaseMocks.verifyIdToken).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["auth/invalid-id-token", "invalid token detail"],
    ["auth/id-token-expired", "expired token detail"],
  ])("rejects %s without exposing SDK details", async (code, detail) => {
    firebaseMocks.verifyIdToken.mockRejectedValue(firebaseError(code, detail));

    let responseError: unknown;
    try {
      await authenticateRequest(requestWithAuthorization("Bearer TEST_TOKEN"));
    } catch (error) {
      responseError = error;
    }

    expect(responseError).toMatchObject({
      status: 401,
      message: "Token inválido o expirado",
    });
    expect((responseError as Error).message).not.toContain(detail);
  });

  it("uses the UID from the verified token, not request data", async () => {
    firebaseMocks.verifyIdToken.mockResolvedValue({
      uid: "verified-user",
      email: "verified@example.invalid",
      rol: "reader",
    });
    const request = new Request(
      "https://api.example.invalid/private?uid=query-attacker",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer TEST_TOKEN",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid: "body-attacker", rol: "admin" }),
      },
    );

    await expect(authenticateRequest(request)).resolves.toEqual({
      uid: "verified-user",
      email: "verified@example.invalid",
      rol: "reader",
    });
    expect(firebaseMocks.verifyIdToken).toHaveBeenCalledWith("TEST_TOKEN");
  });

  it("sanitizes an unexpected Firebase Admin error", async () => {
    const internalDetail = "INTERNAL_FIREBASE_TEST_DETAIL";
    firebaseMocks.verifyIdToken.mockRejectedValue(new Error(internalDetail));

    let responseError: unknown;
    try {
      await authenticateRequest(requestWithAuthorization("Bearer TEST_TOKEN"));
    } catch (error) {
      responseError = error;
    }

    expect(responseError).toMatchObject({ status: 500, message: "Error interno" });
    expect((responseError as Error).message).not.toContain(internalDetail);
  });
});
