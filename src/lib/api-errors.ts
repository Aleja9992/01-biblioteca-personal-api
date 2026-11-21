import { z } from "zod";

type ApiErrorDetail = {
  campo: string;
  mensaje: string;
};

type ApiErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 413
  | 415
  | 429
  | 500
  | 503;

export class ApiError extends Error {
  constructor(
    readonly status: ApiErrorStatus,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function readJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Solicitud inválida");
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      campo: issue.path.length > 0 ? issue.path.map(String).join(".") : "body",
      mensaje: "Valor inválido",
    }));

    throw new ApiError(400, "Solicitud inválida", details);
  }

  return parsed.data;
}

export function apiErrorResponse(error: unknown): Response {
  if (!(error instanceof ApiError)) {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }

  const body = error.details
    ? { error: error.message, detalles: error.details }
    : { error: error.message };

  return Response.json(body, { status: error.status });
}
