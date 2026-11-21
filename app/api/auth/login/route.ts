import { apiErrorResponse, readJsonBody } from "../../../../src/lib/api-errors";
import { authCredentialsSchema } from "../../../../src/schemas/auth";
import { loginWithEmail } from "../../../../src/services/firebase-auth-service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const credentials = await readJsonBody(request, authCredentialsSchema);
    const session = await loginWithEmail(credentials);

    return Response.json(session, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
