import { apiErrorResponse, readJsonBody } from "../../../../../src/lib/api-errors";
import { authenticateRequest } from "../../../../../src/lib/authentication";
import {
  lendUserBook,
  returnUserBook,
} from "../../../../../src/services/book-service";
import { loanWriteSchema } from "../../../../../src/schemas/book";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const user = await authenticateRequest(request);
    const { id } = await context.params;
    const input = await readJsonBody(request, loanWriteSchema);
    const book = await lendUserBook(user.uid, id, input);

    return Response.json(book);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const user = await authenticateRequest(request);
    const { id } = await context.params;
    const book = await returnUserBook(user.uid, id);

    return Response.json(book);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
