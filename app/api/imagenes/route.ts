import { del, put } from "@vercel/blob";
import { apiErrorResponse, ApiError } from "../../../src/lib/api-errors";
import { authenticateRequest } from "../../../src/lib/authentication";

export const runtime = "nodejs";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const maxImageBytes = 4 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(request);
    const contentType = request.headers.get("content-type") ?? "";
    const extension = contentType ? allowedTypes.get(contentType) : undefined;

    if (!extension) {
      throw new ApiError(415, "Tipo de imagen no permitido");
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await request.arrayBuffer();
    } catch {
      throw new ApiError(400, "Solicitud inválida");
    }

    if (bytes.byteLength > maxImageBytes) {
      throw new ApiError(413, "Imagen demasiado grande");
    }

    const id = crypto.randomUUID();
    const pathname = `usuarios/${user.uid}/${id}.${extension}`;
    const uploaded = await put(pathname, bytes, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });

    return Response.json(
      { url: uploaded.url, pathname: uploaded.pathname },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(request);
    const url = new URL(request.url).searchParams.get("url");

    if (!url) {
      throw new ApiError(400, "Solicitud inválida", [
        { campo: "url", mensaje: "Valor requerido" },
      ]);
    }

    let imageUrl: URL;
    try {
      imageUrl = new URL(url);
    } catch {
      throw new ApiError(400, "Solicitud inválida", [
        { campo: "url", mensaje: "URL inválida" },
      ]);
    }

    const pathname = imageUrl.pathname.replace(/^\/+/, "");
    if (!pathname.startsWith(`usuarios/${user.uid}/`)) {
      throw new ApiError(403, "Permisos insuficientes");
    }

    await del(url);
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
