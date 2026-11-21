import { beforeEach, describe, expect, it, vi } from "vitest";

const authServiceMocks = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  refreshSession: vi.fn(),
  registerWithEmail: vi.fn(),
}));

vi.mock("../../src/services/firebase-auth-service", () => authServiceMocks);

import { POST as login } from "../../app/api/auth/login/route";
import { POST as refresh } from "../../app/api/auth/refresh/route";
import { POST as register } from "../../app/api/auth/registro/route";

const testSession = {
  token: "TEST_ID_TOKEN",
  refreshToken: "TEST_REFRESH_TOKEN",
  expiraEnSeg: 3600,
  usuario: { id: "test-user-not-real", email: "reader@example.invalid" },
};

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`https://api.example.invalid${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("authentication credential routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns registration tokens only on success and prevents caching", async () => {
    authServiceMocks.registerWithEmail.mockResolvedValue(testSession);

    const response = await register(
      jsonRequest("/api/auth/registro", {
        email: "reader@example.invalid",
        password: "password-for-test",
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(testSession);
  });

  it("returns login tokens only on success and prevents caching", async () => {
    authServiceMocks.loginWithEmail.mockResolvedValue(testSession);

    const response = await login(
      jsonRequest("/api/auth/login", {
        email: "reader@example.invalid",
        password: "password-for-test",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(testSession);
  });

  it("returns refreshed tokens only on success and prevents caching", async () => {
    const refreshedSession = {
      token: "NEW_TEST_ID_TOKEN",
      refreshToken: "NEW_TEST_REFRESH_TOKEN",
      expiraEnSeg: 3600,
    };
    authServiceMocks.refreshSession.mockResolvedValue(refreshedSession);

    const response = await refresh(
      jsonRequest("/api/auth/refresh", {
        refreshToken: "TEST_REFRESH_TOKEN",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(refreshedSession);
    expect(authServiceMocks.refreshSession).toHaveBeenCalledWith(
      "TEST_REFRESH_TOKEN",
    );
  });

  it("rejects invalid input without calling the service", async () => {
    const response = await register(
      jsonRequest("/api/auth/registro", {
        email: "not-an-email",
        password: "short",
        rol: "admin",
      }),
    );

    expect(response.status).toBe(400);
    expect(authServiceMocks.registerWithEmail).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toMatchObject({ error: "Solicitud inválida" });
    expect(JSON.stringify(body)).not.toContain("short");
  });

  it("does not expose internal service errors", async () => {
    authServiceMocks.loginWithEmail.mockRejectedValue(
      new Error("INTERNAL_TEST_TOKEN_DETAIL"),
    );

    const response = await login(
      jsonRequest("/api/auth/login", {
        email: "reader@example.invalid",
        password: "password-for-test",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Error interno" });
    expect(JSON.stringify(body)).not.toContain("INTERNAL_TEST_TOKEN_DETAIL");
  });

  it("does not return tokens when registration fails", async () => {
    authServiceMocks.registerWithEmail.mockRejectedValue(
      new Error("TEST_ID_TOKEN TEST_REFRESH_TOKEN"),
    );

    const response = await register(
      jsonRequest("/api/auth/registro", {
        email: "reader@example.invalid",
        password: "password-for-test",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe(JSON.stringify({ error: "Error interno" }));
    expect(body).not.toContain("TEST_ID_TOKEN");
    expect(body).not.toContain("TEST_REFRESH_TOKEN");
  });

  it("does not return tokens when refresh fails", async () => {
    authServiceMocks.refreshSession.mockRejectedValue(
      new Error("NEW_TEST_ID_TOKEN NEW_TEST_REFRESH_TOKEN"),
    );

    const response = await refresh(
      jsonRequest("/api/auth/refresh", {
        refreshToken: "TEST_REFRESH_TOKEN",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe(JSON.stringify({ error: "Error interno" }));
    expect(body).not.toContain("NEW_TEST_ID_TOKEN");
    expect(body).not.toContain("NEW_TEST_REFRESH_TOKEN");
  });
});
