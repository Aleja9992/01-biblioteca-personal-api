import "server-only";
import { z } from "zod";
import { ApiError } from "../lib/api-errors";

const googleBooksResponseSchema = z.object({
  items: z
    .array(
      z.object({
        volumeInfo: z.object({
          title: z.string().optional(),
          authors: z.array(z.string()).optional(),
          imageLinks: z
            .object({
              thumbnail: z.string().optional(),
            })
            .optional(),
        }),
      }),
    )
    .optional(),
});

export type IsbnBookResult = {
  titulo: string;
  autor: string;
  portada: string | null;
};

export async function lookupIsbn(isbn: string): Promise<IsbnBookResult> {
  let response: Response;

  try {
    response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`,
      { cache: "no-store" },
    );
  } catch {
    throw new ApiError(503, "Servicio ISBN no disponible");
  }

  if (!response.ok) {
    throw new ApiError(503, "Servicio ISBN no disponible");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(503, "Servicio ISBN no disponible");
  }

  const parsed = googleBooksResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(503, "Servicio ISBN no disponible");
  }

  const volume = parsed.data.items?.[0]?.volumeInfo;
  if (!volume?.title) {
    throw new ApiError(404, "ISBN no encontrado");
  }

  return {
    titulo: volume.title,
    autor: volume.authors?.join(", ") ?? "",
    portada: volume.imageLinks?.thumbnail ?? null,
  };
}
