import { apiErrorResponse, readJsonBody } from "../../../../src/lib/api-errors";
import { refreshTokenSchema } from "../../../../src/schemas/auth";
import { refreshSession } from "../../../../src/services/firebase-auth-service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const { refreshToken } = await readJsonBody(request, refreshTokenSchema);
    const session = await refreshSession(refreshToken);

    return Response.json(session, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
