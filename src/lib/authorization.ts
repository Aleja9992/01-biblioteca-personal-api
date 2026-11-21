import { ApiError } from "./api-errors";
import {
  authenticateRequestWithRevocation,
  type AuthenticatedUser,
} from "./authentication";

export function authorizeAdmin(user: AuthenticatedUser): AuthenticatedUser {
  if (user.rol !== "admin") {
    throw new ApiError(403, "Permisos insuficientes");
  }

  return user;
}

export async function requireAdminRequest(
  request: Request,
): Promise<AuthenticatedUser> {
  const user = await authenticateRequestWithRevocation(request);
  return authorizeAdmin(user);
}
