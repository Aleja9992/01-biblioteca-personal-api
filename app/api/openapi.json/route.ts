export const runtime = "nodejs";

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Biblioteca Personal API",
    version: "1.0.0",
    description: "API privada de Biblioteca Personal.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Estado" },
    { name: "Autenticacion" },
    { name: "Libros" },
    { name: "ISBN" },
    { name: "Imagenes" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ApiError: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          detalles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                campo: { type: "string" },
                mensaje: { type: "string" },
              },
            },
          },
        },
      },
      AuthCredentials: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
        },
      },
      AuthSession: {
        type: "object",
        required: ["token", "refreshToken", "expiraEnSeg", "usuario"],
        properties: {
          token: { type: "string" },
          refreshToken: { type: "string" },
          expiraEnSeg: { type: "integer" },
          usuario: { $ref: "#/components/schemas/Usuario" },
        },
      },
      Usuario: {
        type: "object",
        required: ["id", "email"],
        properties: {
          id: { type: "string" },
          email: { type: ["string", "null"] },
        },
      },
      BookWrite: {
        type: "object",
        required: ["titulo", "autor"],
        properties: {
          titulo: { type: "string", minLength: 2 },
          autor: { type: "string", minLength: 2 },
          isbn: { type: ["string", "null"], pattern: "^([0-9]{10}|[0-9]{13})$" },
          estado: { type: "string", enum: ["pendiente", "leyendo", "leido"], default: "pendiente" },
          portada_url: { type: ["string", "null"], format: "uri" },
        },
      },
      LoanWrite: {
        type: "object",
        required: ["prestado_a", "fecha_prestamo"],
        properties: {
          prestado_a: { type: "string", minLength: 1 },
          fecha_prestamo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Estado"],
        summary: "Comprueba el estado de la API",
        responses: {
          200: {
            description: "API disponible",
            content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", example: "ok" } } } } },
          },
        },
      },
    },
    "/api/auth/registro": {
      post: {
        tags: ["Autenticacion"],
        summary: "Registra un usuario",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AuthCredentials" } } } },
        responses: {
          201: { description: "Usuario registrado", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthSession" } } } },
          400: { description: "Entrada invalida" },
          503: { description: "Firebase no configurado" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Autenticacion"],
        summary: "Inicia sesion",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AuthCredentials" } } } },
        responses: {
          200: { description: "Sesion creada", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthSession" } } } },
          400: { description: "Entrada invalida" },
          503: { description: "Firebase no configurado" },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Autenticacion"],
        summary: "Renueva una sesion",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } } },
        responses: { 200: { description: "Sesion renovada" }, 400: { description: "Entrada invalida" } },
      },
    },
    "/api/auth/yo": {
      get: {
        tags: ["Autenticacion"],
        summary: "Obtiene la identidad del usuario autenticado",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Identidad verificada" }, 401: { description: "Token ausente o invalido" } },
      },
    },
    "/api/libros": {
      get: {
        tags: ["Libros"],
        summary: "Lista los libros del usuario",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "cursor", in: "query", schema: { type: "string", maxLength: 4096 } },
        ],
        responses: { 200: { description: "Listado paginado" }, 400: { description: "Parametros invalidos" }, 401: { description: "Token ausente o invalido" } },
      },
    },
    "/api/libros/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      put: {
        tags: ["Libros"],
        summary: "Crea o actualiza un libro",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/BookWrite" } } } },
        responses: { 200: { description: "Libro guardado" }, 400: { description: "Entrada invalida" }, 401: { description: "Token ausente o invalido" }, 409: { description: "ISBN ocupado" } },
      },
      delete: {
        tags: ["Libros"],
        summary: "Elimina logicamente un libro",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Libro eliminado" }, 401: { description: "Token ausente o invalido" }, 409: { description: "Prestamo activo" } },
      },
    },
    "/api/libros/{id}/prestamo": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      put: {
        tags: ["Libros"],
        summary: "Registra un prestamo",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoanWrite" } } } },
        responses: { 200: { description: "Prestamo registrado" }, 401: { description: "Token ausente o invalido" }, 409: { description: "Ya existe un prestamo activo" } },
      },
      delete: {
        tags: ["Libros"],
        summary: "Devuelve un libro",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Libro devuelto" }, 401: { description: "Token ausente o invalido" } },
      },
    },
    "/api/isbn/{isbn}": {
      get: {
        tags: ["ISBN"],
        summary: "Consulta metadatos por ISBN",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "isbn", in: "path", required: true, schema: { type: "string", pattern: "^([0-9]{10}|[0-9]{13})$" } }],
        responses: { 200: { description: "Metadatos encontrados" }, 400: { description: "ISBN invalido" }, 401: { description: "Token ausente o invalido" }, 404: { description: "ISBN no encontrado" } },
      },
    },
    "/api/imagenes": {
      post: {
        tags: ["Imagenes"],
        summary: "Sube una portada",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "image/jpeg": {}, "image/png": {}, "image/webp": {} } },
        responses: { 201: { description: "Imagen subida" }, 400: { description: "Entrada invalida" }, 401: { description: "Token ausente o invalido" }, 413: { description: "Imagen demasiado grande" }, 415: { description: "Tipo no permitido" } },
      },
      delete: {
        tags: ["Imagenes"],
        summary: "Elimina una portada",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } }],
        responses: { 200: { description: "Imagen eliminada" }, 400: { description: "URL invalida" }, 401: { description: "Token ausente o invalido" }, 403: { description: "Sin permisos" } },
      },
    },
  },
};

export function GET(): Response {
  return Response.json(openApiDocument, {
    headers: { "Cache-Control": "no-store" },
  });
}
