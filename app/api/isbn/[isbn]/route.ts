import { z } from "zod";
import { apiErrorResponse, ApiError } from "../../../../src/lib/api-errors";
import { authenticateRequest } from "../../../../src/lib/authentication";
import { lookupIsbn } from "../../../../src/services/isbn-service";

export const runtime = "nodejs";

const isbnParamSchema = z
  .string()
  .regex(/^(?:\d{10}|\d{13})$/);

type RouteContext = {
  params: Promise<{ isbn: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    await authenticateRequest(_request);
    const { isbn } = await context.params;
    const parsed = isbnParamSchema.safeParse(isbn);
    if (!parsed.success) {
      throw new ApiError(400, "Solicitud inválida", [
        { campo: "isbn", mensaje: "Debe tener 10 o 13 dígitos" },
      ]);
    }

    const result = await lookupIsbn(parsed.data);
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
