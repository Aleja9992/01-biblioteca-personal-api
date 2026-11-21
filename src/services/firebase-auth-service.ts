import "server-only";
import { z } from "zod";
import { ApiError } from "../lib/api-errors";
import type { AuthCredentials } from "../schemas/auth";

const firebaseAccountResponseSchema = z.object({
  localId: z.string().min(1),
  email: z.string().email().optional(),
  idToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value > 0),
});

const firebaseRefreshResponseSchema = z.object({
  id_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value > 0),
});

type AuthOperation = "register" | "login" | "refresh";

export type AuthSessionResponse = {
  token: string;
  refreshToken: string;
  expiraEnSeg: number;
  usuario: {
    id: string;
    email: string;
  };
};

export type RefreshedSessionResponse = {
  token: string;
  refreshToken: string;
  expiraEnSeg: number;
};

function getWebApiKey(): string {
  const parsed = z.string().min(1).safeParse(process.env.FIREBASE_WEB_API_KEY);

  if (!parsed.success) {
    throw new ApiError(
      503,
      "Falta FIREBASE_WEB_API_KEY en el entorno de la API",
    );
  }

  return parsed.data;
}

function firebaseEndpoint(path: string, apiKey: string): string {
  const url = new URL(path);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

function firebaseErrorCode(body: unknown): string | undefined {
  const parsed = z
    .object({
      error: z.object({ message: z.string() }),
    })
    .safeParse(body);

  if (!parsed.success) {
    return undefined;
  }

  return parsed.data.error.message.match(/^[A-Z0-9_]+/)?.[0];
}

function firebaseError(
  operation: AuthOperation,
  status: number,
  body: unknown,
): ApiError {
  const code = firebaseErrorCode(body);

  if (status === 429 || code === "TOO_MANY_ATTEMPTS_TRY_LATER") {
    return new ApiError(429, "Demasiados intentos. Inténtalo más tarde");
  }

  if (operation === "register" && code === "EMAIL_EXISTS") {
    return new ApiError(409, "El correo ya está registrado");
  }

  if (operation === "register" && code?.startsWith("WEAK_PASSWORD")) {
    return new ApiError(400, "La contraseña no cumple los requisitos");
  }

  if (
    operation === "login" &&
    code &&
    new Set([
      "EMAIL_NOT_FOUND",
      "INVALID_PASSWORD",
      "INVALID_LOGIN_CREDENTIALS",
      "USER_DISABLED",
    ]).has(code)
  ) {
    return new ApiError(401, "Correo o contraseña inválidos");
  }

  if (
    operation === "refresh" &&
    code &&
    new Set(["INVALID_REFRESH_TOKEN", "TOKEN_EXPIRED", "USER_DISABLED"]).has(
      code,
    )
  ) {
    return new ApiError(401, "Refresh token inválido o expirado");
  }

  if (status >= 500) {
    return new ApiError(503, "Servicio de autenticación no disponible");
  }

  return new ApiError(500, "Error interno");
}

async function postFirebaseJson<TSchema extends z.ZodType>(
  endpoint: string,
  operation: AuthOperation,
  payload: unknown,
  responseSchema: TSchema,
): Promise<z.output<TSchema>> {
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, "Servicio de autenticación no disponible");
  }

  return parseFirebaseResponse(response, operation, responseSchema);
}

async function postFirebaseForm<TSchema extends z.ZodType>(
  endpoint: string,
  operation: AuthOperation,
  body: URLSearchParams,
  responseSchema: TSchema,
): Promise<z.output<TSchema>> {
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, "Servicio de autenticación no disponible");
  }

  return parseFirebaseResponse(response, operation, responseSchema);
}

async function parseFirebaseResponse<TSchema extends z.ZodType>(
  response: Response,
  operation: AuthOperation,
  responseSchema: TSchema,
): Promise<z.output<TSchema>> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new ApiError(503, "Servicio de autenticación no disponible");
  }

  if (!response.ok) {
    throw firebaseError(operation, response.status, body);
  }

  const parsed = responseSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError(503, "Servicio de autenticación no disponible");
  }

  return parsed.data;
}

function accountEndpoint(action: "signUp" | "signInWithPassword"): string {
  const apiKey = getWebApiKey();
  return firebaseEndpoint(
    `https://identitytoolkit.googleapis.com/v1/accounts:${action}`,
    apiKey,
  );
}

function toAuthSession(
  response: z.output<typeof firebaseAccountResponseSchema>,
  fallbackEmail: string,
): AuthSessionResponse {
  return {
    token: response.idToken,
    refreshToken: response.refreshToken,
    expiraEnSeg: response.expiresIn,
    usuario: {
      id: response.localId,
      email: response.email ?? fallbackEmail,
    },
  };
}

export async function registerWithEmail(
  credentials: AuthCredentials,
): Promise<AuthSessionResponse> {
  const response = await postFirebaseJson(
    accountEndpoint("signUp"),
    "register",
    {
      email: credentials.email,
      password: credentials.password,
      returnSecureToken: true,
    },
    firebaseAccountResponseSchema,
  );

  return toAuthSession(response, credentials.email);
}

export async function loginWithEmail(
  credentials: AuthCredentials,
): Promise<AuthSessionResponse> {
  const response = await postFirebaseJson(
    accountEndpoint("signInWithPassword"),
    "login",
    {
      email: credentials.email,
      password: credentials.password,
      returnSecureToken: true,
    },
    firebaseAccountResponseSchema,
  );

  return toAuthSession(response, credentials.email);
}

export async function refreshSession(
  refreshToken: string,
): Promise<RefreshedSessionResponse> {
  const endpoint = firebaseEndpoint(
    "https://securetoken.googleapis.com/v1/token",
    getWebApiKey(),
  );
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const response = await postFirebaseForm(
    endpoint,
    "refresh",
    body,
    firebaseRefreshResponseSchema,
  );

  return {
    token: response.id_token,
    refreshToken: response.refresh_token,
    expiraEnSeg: response.expires_in,
  };
}
