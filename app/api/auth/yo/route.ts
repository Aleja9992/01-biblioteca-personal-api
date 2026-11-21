import { apiErrorResponse } from "../../../../src/lib/api-errors";
import { authenticateRequest } from "../../../../src/lib/authentication";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(request);

    return Response.json({
      usuario: {
        id: user.uid,
        email: user.email,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
