import "server-only";
import { getAuth } from "firebase-admin/auth";
import { ApiError } from "./api-errors";
import { getFirebaseAdminApp } from "./firebase-admin";

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
  rol: unknown;
};

const invalidTokenCodes = new Set([
  "auth/argument-error",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/user-disabled",
]);

const unavailableCodes = new Set([
  "app/network-error",
  "auth/internal-error",
  "auth/network-request-failed",
]);

function firebaseErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

async function verifyRequest(
  request: Request,
  checkRevoked: boolean,
): Promise<AuthenticatedUser> {
  const authorization = request.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!bearerMatch) {
    throw new ApiError(401, "Autenticación requerida");
  }

  let decodedToken;

  try {
    const auth = getAuth(getFirebaseAdminApp());
    decodedToken = checkRevoked
      ? await auth.verifyIdToken(bearerMatch[1], true)
      : await auth.verifyIdToken(bearerMatch[1]);
  } catch (error) {
    const code = firebaseErrorCode(error);

    if (code && invalidTokenCodes.has(code)) {
      throw new ApiError(401, "Token inválido o expirado");
    }

    if (code && unavailableCodes.has(code)) {
      throw new ApiError(503, "Servicio de autenticación no disponible");
    }

    throw new ApiError(500, "Error interno");
  }

  if (!decodedToken.uid) {
    throw new ApiError(401, "Token inválido o expirado");
  }

  return {
    uid: decodedToken.uid,
    email: typeof decodedToken.email === "string" ? decodedToken.email : null,
    rol: decodedToken.rol,
  };
}

export function authenticateRequest(request: Request): Promise<AuthenticatedUser> {
  return verifyRequest(request, false);
}

export function authenticateRequestWithRevocation(
  request: Request,
): Promise<AuthenticatedUser> {
  return verifyRequest(request, true);
}
