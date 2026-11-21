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

import { GET } from "../../app/api/auth/yo/route";

describe("GET /api/auth/yo integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firebaseMocks.getFirebaseAdminApp.mockReturnValue({});
    firebaseMocks.getAuth.mockReturnValue({
      verifyIdToken: firebaseMocks.verifyIdToken,
    });
  });

  it("enforces authentication at the Route Handler boundary", async () => {
    const response = await GET(
      new Request("https://api.example.invalid/api/auth/yo"),
    );

    expect(response.status).toBe(401);
    expect(firebaseMocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns only identity from verified claims, not a query UID or token", async () => {
    firebaseMocks.verifyIdToken.mockResolvedValue({
      uid: "verified-user",
      email: "verified@example.invalid",
      rol: "reader",
    });
    const response = await GET(
      new Request(
        "https://api.example.invalid/api/auth/yo?uid=attacker&rol=admin",
        { headers: { Authorization: "Bearer TEST_ID_TOKEN" } },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      usuario: { id: "verified-user", email: "verified@example.invalid" },
    });
    expect(JSON.stringify(body)).not.toContain("TEST_ID_TOKEN");
    expect(firebaseMocks.verifyIdToken).toHaveBeenCalledWith("TEST_ID_TOKEN");
  });

  it.each(["auth/invalid-id-token", "auth/id-token-expired"])(
    "returns HTTP 401 for %s",
    async (code) => {
      firebaseMocks.verifyIdToken.mockRejectedValue(
        Object.assign(new Error("INTERNAL_TEST_TOKEN_DETAIL"), { code }),
      );

      const response = await GET(
        new Request("https://api.example.invalid/api/auth/yo", {
          headers: { Authorization: "Bearer TEST_ID_TOKEN" },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Token inválido o expirado",
      });
    },
  );
});
