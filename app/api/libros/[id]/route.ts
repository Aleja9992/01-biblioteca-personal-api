import { apiErrorResponse } from "../../../../src/lib/api-errors";
import { authenticateRequest } from "../../../../src/lib/authentication";
import {
  logicallyDeleteUserBook,
  upsertUserBook,
} from "../../../../src/services/book-service";
import { readJsonBody } from "../../../../src/lib/api-errors";
import { bookWriteSchema } from "../../../../src/schemas/book";

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
    const input = await readJsonBody(request, bookWriteSchema);
    const book = await upsertUserBook(user.uid, id, input);

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
    await logicallyDeleteUserBook(user.uid, id);

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
