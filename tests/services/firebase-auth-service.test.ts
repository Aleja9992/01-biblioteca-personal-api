import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loginWithEmail,
  refreshSession,
  registerWithEmail,
} from "../../src/services/firebase-auth-service";

vi.mock("server-only", () => ({}));

const fetchMock = vi.fn<typeof fetch>();

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function signInResponse(overrides: Record<string, unknown> = {}) {
  return {
    localId: "test-user-not-real",
    email: "reader@example.invalid",
    idToken: "TEST_ID_TOKEN",
    refreshToken: "TEST_REFRESH_TOKEN",
    expiresIn: "3600",
    ...overrides,
  };
}

describe("Firebase Auth REST service", () => {
  beforeEach(() => {
    vi.stubEnv("FIREBASE_WEB_API_KEY", "TEST_WEB_API_KEY");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("registers and maps Firebase fields to the API contract", async () => {
    fetchMock.mockResolvedValue(response(signInResponse()));
    const password = "  password with spaces  ";

    await expect(
      registerWithEmail({ email: "reader@example.invalid", password }),
    ).resolves.toEqual({
      token: "TEST_ID_TOKEN",
      refreshToken: "TEST_REFRESH_TOKEN",
      expiraEnSeg: 3600,
      usuario: { id: "test-user-not-real", email: "reader@example.invalid" },
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    if (!requestInit) {
      throw new Error("Expected Firebase Auth request");
    }
    const sentBody = JSON.parse(String(requestInit.body)) as {
      password: string;
      returnSecureToken: boolean;
    };
    expect(new URL(String(requestUrl)).searchParams.get("key")).toBe(
      "TEST_WEB_API_KEY",
    );
    expect(sentBody.password).toBe(password);
    expect(sentBody.returnSecureToken).toBe(true);
  });

  it("logs in without transforming the password", async () => {
    fetchMock.mockResolvedValue(response(signInResponse()));
    const password = "  exact login password  ";

    await loginWithEmail({ email: "reader@example.invalid", password });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    if (!requestInit) {
      throw new Error("Expected Firebase Auth request");
    }
    const sentBody = JSON.parse(String(requestInit.body)) as {
      password: string;
    };
    expect(sentBody.password).toBe(password);
  });

  it("refreshes with form encoding and preserves the refresh token value", async () => {
    fetchMock.mockResolvedValue(
      response({
        id_token: "NEW_TEST_ID_TOKEN",
        refresh_token: "NEW_TEST_REFRESH_TOKEN",
        expires_in: "3600",
        user_id: "ignored-user",
      }),
    );
    const refreshToken = "TEST_REFRESH/token+with=chars";

    await expect(refreshSession(refreshToken)).resolves.toEqual({
      token: "NEW_TEST_ID_TOKEN",
      refreshToken: "NEW_TEST_REFRESH_TOKEN",
      expiraEnSeg: 3600,
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    if (!requestInit) {
      throw new Error("Expected Firebase Auth request");
    }
    const form = new URLSearchParams(String(requestInit.body));
    expect(String(requestUrl)).toContain(
      "https://securetoken.googleapis.com/v1/token",
    );
    expect(requestInit.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe(refreshToken);
  });

  it.each(["EMAIL_NOT_FOUND", "INVALID_PASSWORD"])(
    "uses the same login error for %s",
    async (code) => {
      fetchMock.mockResolvedValue(
        response({ error: { message: `${code}: private detail` } }, 400),
      );

      await expect(
        loginWithEmail({
          email: "reader@example.invalid",
          password: "password-for-test",
        }),
      ).rejects.toMatchObject({
        status: 401,
        message: "Correo o contraseña inválidos",
      });
    },
  );

  it("maps Firebase throttling without exposing the upstream message", async () => {
    fetchMock.mockResolvedValue(
      response(
        { error: { message: "TOO_MANY_ATTEMPTS_TRY_LATER: internal detail" } },
        400,
      ),
    );

    await expect(
      loginWithEmail({
        email: "reader@example.invalid",
        password: "password-for-test",
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: "Demasiados intentos. Inténtalo más tarde",
    });
  });

  it("maps an HTTP 429 response from Firebase Auth", async () => {
    fetchMock.mockResolvedValue(
      response({ error: { message: "INTERNAL_RATE_LIMIT_DETAIL" } }, 429),
    );

    await expect(
      loginWithEmail({
        email: "reader@example.invalid",
        password: "password-for-test",
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: "Demasiados intentos. Inténtalo más tarde",
    });
  });

  it("returns a safe unavailable error when Firebase cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("TEST_NETWORK_SECRET_DETAIL"));

    await expect(
      refreshSession("TEST_REFRESH_TOKEN"),
    ).rejects.toMatchObject({
      status: 503,
      message: "Servicio de autenticación no disponible",
    });
  });

  it("reports a missing server-side Web API key without exposing a value", async () => {
    vi.stubEnv("FIREBASE_WEB_API_KEY", "");

    await expect(
      loginWithEmail({
        email: "reader@example.invalid",
        password: "password-for-test",
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: "Falta FIREBASE_WEB_API_KEY en el entorno de la API",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
