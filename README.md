# Biblioteca Personal API

Backend de Biblioteca Personal, independiente de la aplicación móvil. La base del proyecto usa Next.js App Router, Route Handlers con runtime Node.js y TypeScript estricto.

## Requisitos

- Node.js `^22.12.0`, `^24.0.0` o `>=26.0.0`
- npm

## Instalación

```bash
npm install
```

## Comandos

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia el servidor de desarrollo |
| `npm run build` | Genera el build de producción |
| `npm run start` | Inicia el servidor de producción (después del build) |
| `npm run lint` | Ejecuta ESLint |
| `npm run typecheck` | Comprueba los tipos TypeScript sin emitir archivos |
| `npm test` | Ejecuta las pruebas con Vitest |

## Ejecución local

```bash
npm run dev
```

La ruta `GET /api/health` responde con `200` y `{ "status": "ok" }`; no requiere variables de entorno.

## Firebase Admin y Firestore

Firebase Admin se utiliza exclusivamente en el servidor. La infraestructura valida `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` al solicitar acceso a Firestore; la clave admite saltos de línea escritos como `\n`.

Para desarrollo local, copia `.env.example` a `.env.local` y completa los valores reales ahí; `.env.local` está ignorado por Git. `FIREBASE_WEB_API_KEY` debe estar disponible en el proceso servidor para registro, login y refresh. En producción, configura todos los valores como variables de entorno del servidor en Vercel. No uses prefijos `NEXT_PUBLIC_`, no copies valores al repositorio y no compartas archivos de cuenta de servicio.

Las reglas de Firestore deniegan el acceso directo de clientes. El SDK Admin opera desde el servidor y omite esas reglas, por lo que cualquier futura ruta que lo use tendrá que autenticar y autorizar la solicitud antes de acceder a datos.

## Autenticación

Las rutas de autenticación son:

| Método y ruta | Respuesta exitosa |
|---|---|
| `POST /api/auth/registro` | `201 { token, refreshToken, expiraEnSeg, usuario: { id, email } }` |
| `POST /api/auth/login` | `200` con el mismo formato de registro |
| `POST /api/auth/refresh` | `200 { token, refreshToken, expiraEnSeg }` |
| `GET /api/auth/yo` | `200 { usuario: { id, email } }` (requiere Bearer ID token) |

Las respuestas exitosas de registro, login y refresh incluyen `Cache-Control: no-store`. `GET /api/auth/yo` obtiene la identidad exclusivamente de los claims del ID token verificado. Las rutas administrativas deben verificar revocación del token y exigir el claim verificado `rol: "admin"`; no existe una ruta pública para asignar roles.

En desarrollo local, configura `FIREBASE_WEB_API_KEY` solo en el `.env.local` del repositorio API. En producción, configúrala exclusivamente en las variables de entorno de Vercel; nunca en el repositorio ni en la app. Sin esta clave, registro, login y refresh responden 503. No registrar contraseñas, ID tokens ni refresh tokens. La limitación real de intentos debe configurarse con Vercel Firewall; un 429 de Firebase por sí solo no limita las solicitudes a la API.

## Despliegue en Firebase y Vercel

El proyecto Firebase predeterminado para Firebase CLI es `biblioteca-personal-82a73`.
En Firebase Console, habilita **Authentication → Email/Password** y crea la base
de datos de Firestore. Despliega las reglas (que bloquean el acceso directo desde
clientes) y los índices declarados en el repositorio:

```bash
npx firebase-tools deploy --only firestore
```

Para ejecutar localmente, copia `.env.example` a `.env.local` y completa:

- `FIREBASE_PROJECT_ID` y `FIREBASE_WEB_API_KEY` con los datos del proyecto.
- `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` desde una cuenta de servicio
  de Firebase con acceso a Firestore. La clave puede usar `\n` literales.
- `API_CURSOR_SECRET` con al menos 32 bytes aleatorios. Por ejemplo:
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- `BLOB_READ_WRITE_TOKEN` solo si vas a habilitar subidas de portadas con Vercel
  Blob; se obtiene creando un store en Vercel.

Inicia y comprueba la API:

```bash
npm install
npm run dev
```

`GET http://localhost:3000/api/health` debe responder `{"status":"ok"}`. Para
producción, importa este repositorio en Vercel con su raíz de proyecto en la
carpeta de la API, configura las mismas variables en **Project Settings →
Environment Variables** (incluida la clave privada solo en Vercel) y despliega:

```bash
npx vercel --prod
```

Al terminar, comprueba `https://<dominio-de-la-api>/api/health`. La app Expo ya
apunta a `https://01-biblioteca-personal-api.vercel.app`; actualiza
`EXPO_PUBLIC_API_URL` y el perfil EAS de producción si el dominio desplegado
cambia. Las variables `VITE_FIREBASE_*` no se usan en esta API ni deben copiarse
a la app móvil: únicamente `VITE_FIREBASE_PROJECT_ID` y `VITE_FIREBASE_API_KEY`
se mapean a `FIREBASE_PROJECT_ID` y `FIREBASE_WEB_API_KEY` del servidor.

## Libros y préstamos

Las rutas privadas de libros y préstamos requieren `Authorization: Bearer <ID token>`. El UID se obtiene exclusivamente del token verificado; los documentos se guardan bajo `usuarios/{uid}/libro/{id}` y usan el UUID enviado en la ruta como ID.

| Método y ruta | Comportamiento |
|---|---|
| `GET /api/libros?since=<ISO 8601>&cursor=<opcional>` | Devuelve hasta 500 documentos, incluidos tombstones, en orden por `updated_at` e ID. `since` es opcional; sin él se inicia el listado completo. La respuesta incluye `items`, `servidor_ahora` y `next_cursor`. |
| `PUT /api/libros/{id}` | Upsert idempotente del libro. Los campos de préstamo se preservan y solo cambian mediante las rutas de préstamo. Los timestamps siempre los controla el servidor. |
| `DELETE /api/libros/{id}` | Borrado lógico; devuelve 409 si existe un préstamo activo. |
| `PUT /api/libros/{id}/prestamo` | Registra un préstamo disponible con `{ "prestado_a", "fecha_prestamo" }`; un segundo préstamo activo devuelve 409. |
| `DELETE /api/libros/{id}/prestamo` | Devuelve el libro sin modificar los demás campos ni el estado de lectura. |

El ISBN es único por usuario entre libros activos. Se mantiene una reserva interna transaccional en `usuarios/{uid}/isbn/{isbn}`; los tombstones liberan su reserva. En esta etapa `portada_url` solo admite `null`.

Configure `API_CURSOR_SECRET` como variable privada del servidor en Vercel con al menos 32 bytes aleatorios. Se usa para firmar los cursores HMAC; si falta, el API falla de forma segura cuando necesite generar o validar un cursor. No agregue su valor a `.env.example`, Git ni variables `NEXT_PUBLIC_*`.

La paginación no es una instantánea entre páginas. El cursor conserva UID, `since`, watermark y última posición; el cliente debe completar las páginas antes de avanzar su watermark confirmado. La sincronización móvil completa sigue pendiente.

## Pruebas

```bash
npm test
```
