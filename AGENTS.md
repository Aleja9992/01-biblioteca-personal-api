
# AGENTS.md — Biblioteca Personal API

## Alcance
Este repositorio contiene exclusivamente el backend de Biblioteca Personal.

La aplicación móvil se desarrolla en otro repositorio independiente.

## Arquitectura esperada
- app/api/: Route Handlers de Next.js.
- src/services/: lógica de negocio.
- src/repositories/: acceso a Firestore.
- src/lib/: configuración y utilidades del servidor.
- src/schemas/: esquemas de validación Zod.
- src/types/: tipos compartidos.
- ia/: documentación y evidencias de configuración de IA.

No crear toda esta estructura automáticamente. Primero revisar el proyecto y justificar cada directorio.

## Tecnologías
- Next.js App Router.
- TypeScript estricto.
- Node.js Runtime.
- Firebase Admin SDK.
- Firestore.
- Zod.
- Vitest.
- Vercel Blob.

## Reglas de backend
- Todas las rutas privadas deben autenticar al usuario.
- Verificar los ID tokens en el servidor.
- Obtener el UID del token verificado.
- Validar las entradas antes de procesarlas.
- Separar autenticación de autorización.
- No permitir acceso a recursos de otro usuario.
- Usar transacciones cuando una operación necesite consistencia.
- Mantener respuestas HTTP coherentes.

## Secretos
- Las credenciales privadas solo se configuran en el entorno del servidor.
- No imprimir ni copiar secretos.
- No incluir archivos `.env` ni cuentas de servicio en Git.
- No exponer secretos mediante variables NEXT_PUBLIC_ o EXPO_PUBLIC_.
- No modificar credenciales existentes.

## Comandos
Antes de ejecutar comandos:
- Revisar package.json.
- Utilizar únicamente scripts existentes o previamente aprobados.
- No instalar dependencias globales.
- No ejecutar comandos destructivos sin autorización.

## Calidad y pruebas
- Mantener TypeScript estricto.
- Probar autenticación y autorización.
- Probar validaciones incorrectas.
- Probar aislamiento de datos entre usuarios.
- Probar operaciones idempotentes cuando corresponda.
- No afirmar que las pruebas pasan sin ejecutarlas.

## Restricciones
- No modificar el repositorio móvil.
- No acceder a otros proyectos.
- No desplegar sin autorización.
- No modificar Git ni sus remotos sin autorización.
- No desactivar el sandbox.

