import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./api-errors";

const canonicalTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
  });

const cursorPayloadSchema = z.object({
  version: z.literal(1),
  uid: z.string().min(1),
  since: canonicalTimestampSchema.nullable(),
  watermark: canonicalTimestampSchema,
  lastUpdatedAt: canonicalTimestampSchema,
  lastId: z.uuid(),
});

export type BookCursorPayload = z.output<typeof cursorPayloadSchema>;

const invalidCursorError = () => new ApiError(400, "Cursor inválido");

function getCursorSecret(): string {
  const secret = process.env.API_CURSOR_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new ApiError(503, "Servicio no disponible");
  }

  return secret;
}

function signatureFor(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createBookCursor(payload: BookCursorPayload): string {
  const secret = getCursorSecret();
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signatureFor(encodedPayload, secret).toString("base64url");

  return `${encodedPayload}.${signature}`;
}

export function parseBookCursor(
  token: string,
  uid: string,
  requestedSince?: string | null,
): BookCursorPayload {
  const secret = getCursorSecret();
  const segments = token.split(".");

  if (
    segments.length !== 2 ||
    segments[0].length === 0 ||
    segments[1].length === 0
  ) {
    throw invalidCursorError();
  }

  const [encodedPayload, encodedSignature] = segments;
  let receivedSignature: Buffer;
  let payloadValue: unknown;

  try {
    receivedSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = signatureFor(encodedPayload, secret);

    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      throw invalidCursorError();
    }

    payloadValue = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    throw invalidCursorError();
  }

  const parsed = cursorPayloadSchema.safeParse(payloadValue);

  if (
    !parsed.success ||
    parsed.data.uid !== uid ||
    (requestedSince !== undefined && parsed.data.since !== requestedSince)
  ) {
    throw invalidCursorError();
  }

  const sinceTime =
    parsed.data.since === null ? undefined : Date.parse(parsed.data.since);
  const watermarkTime = Date.parse(parsed.data.watermark);
  const lastUpdatedAtTime = Date.parse(parsed.data.lastUpdatedAt);

  if (
    (sinceTime !== undefined && sinceTime > watermarkTime) ||
    lastUpdatedAtTime > watermarkTime ||
    (sinceTime !== undefined && lastUpdatedAtTime < sinceTime)
  ) {
    throw invalidCursorError();
  }

  return parsed.data;
}
