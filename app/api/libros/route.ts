import { apiErrorResponse, ApiError } from "../../../src/lib/api-errors";
import { authenticateRequest } from "../../../src/lib/authentication";
import { listUserBooks } from "../../../src/services/book-service";
import { bookListQuerySchema } from "../../../src/schemas/book";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(request);
    const url = new URL(request.url);
    const sinceValues = url.searchParams.getAll("since");
    const cursorValues = url.searchParams.getAll("cursor");

    if (sinceValues.length > 1 || cursorValues.length > 1) {
      throw new ApiError(400, "Solicitud inválida", [
        { campo: "query", mensaje: "Valor inválido" },
      ]);
    }

    const parsedQuery = bookListQuerySchema.safeParse({
      since: sinceValues[0],
      cursor: cursorValues[0],
    });

    if (!parsedQuery.success) {
      throw new ApiError(400, "Solicitud inválida", [
        ...new Set(parsedQuery.error.issues.map((issue) => String(issue.path[0]))),
      ].map((field) => ({
        campo: field === "" ? "query" : field,
        mensaje: "Valor inválido",
      })));
    }

    const result = await listUserBooks(user.uid, parsedQuery.data);

    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
