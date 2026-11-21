import { z } from "zod";

const isoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
  });

const isbnSchema = z
  .string()
  .regex(/^(?:\d{10}|\d{13})$/)
  .nullable();

const bookWriteFields = {
  titulo: z
    .string()
    .min(2)
    .refine((value) => value.trim().length >= 2),
  autor: z
    .string()
    .min(2)
    .refine((value) => value.trim().length >= 2),
  isbn: isbnSchema.default(null),
  estado: z.enum(["pendiente", "leyendo", "leido"]).default("pendiente"),
  portada_url: z.string().url().nullable().default(null),
};

const borrowerSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

const loanDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed) &&
      new Date(parsed).toISOString().slice(0, 10) === value
    );
  });

export const bookWriteSchema = z.object(bookWriteFields);

export const bookIdSchema = z.uuid();

export const loanWriteSchema = z.object({
  prestado_a: borrowerSchema,
  fecha_prestamo: loanDateSchema,
});

export const bookListQuerySchema = z.object({
  since: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value).toISOString())
    .optional(),
  cursor: z.string().min(1).max(4096).optional(),
});

export const bookDocumentSchema = z
  .object({
    id: bookIdSchema,
    ...bookWriteFields,
    prestado_a: borrowerSchema.nullable(),
    fecha_prestamo: loanDateSchema.nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
    deleted_at: isoTimestampSchema.nullable(),
  })
  .superRefine((book, context) => {
    if ((book.prestado_a === null) !== (book.fecha_prestamo === null)) {
      context.addIssue({
        code: "custom",
        path: ["prestado_a"],
        message: "Los campos del préstamo deben estar ambos completos o nulos",
      });
    }
  });

export type BookWriteInput = z.output<typeof bookWriteSchema>;
export type LoanWriteInput = z.infer<typeof loanWriteSchema>;
export type BookDocument = z.output<typeof bookDocumentSchema>;
export type BookListQuery = z.output<typeof bookListQuerySchema>;
