
# Reglas de IA — Biblioteca Personal API

## 1. Objetivo
Construir la API REST de Biblioteca Personal, independiente de la aplicación móvil y conforme a la especificación académica.

## 2. Tecnologías obligatorias
- Next.js App Router.
- Route Handlers.
- Node.js Runtime.
- TypeScript estricto.
- Firebase Admin SDK.
- Firebase Authentication.
- Cloud Firestore.
- Zod para validaciones.
- Vitest para pruebas.
- Vercel Blob para almacenamiento de imágenes.

No reemplazar tecnologías sin autorización.

## 3. Arquitectura
- Mantener la API en su propio repositorio.
- Separar rutas, servicios, validaciones y repositorios.
- Utilizar Firebase Admin exclusivamente desde el servidor.
- No exponer credenciales privadas al cliente.
- Utilizar HTTPS para las comunicaciones.
- Obtener el UID exclusivamente del token verificado.
- No confiar en UID, roles ni permisos enviados por el cliente.

## 4. Seguridad
- No leer, mostrar, copiar ni imprimir archivos `.env`, claves privadas, certificados, tokens o credenciales.
- No incluir secretos en respuestas, logs, pruebas, documentación ni repositorios.
- No exponer Firebase Admin SDK al cliente.
- Verificar los ID tokens con `verifyIdToken()`.
- Proteger todas las rutas privadas.
- Validar las entradas con Zod.
- No confiar en campos adicionales enviados por el cliente.
- No permitir que usuarios modifiquen su propio rol.
- Mantener Firestore protegido mediante reglas de acceso.
- No desactivar el sandbox ni modificar permisos de seguridad.
- No ejecutar comandos con privilegios elevados.
- No transmitir información privada a servicios externos.

## 5. Autorización
- Aplicar el principio de mínimo privilegio.
- Comprobar el rol antes de operaciones administrativas.
- Responder 401 ante autenticación ausente o inválida.
- Responder 403 ante falta de autorización.
- Evitar revelar información sensible en errores.

## 6. Restricciones de cambios
- Trabajar únicamente dentro de este repositorio.
- No modificar el repositorio móvil desde aquí.
- No eliminar archivos existentes sin autorización.
- No modificar variables de entorno ni credenciales.
- No realizar despliegues, publicaciones o cambios externos sin autorización.
- No hacer commits ni modificar remotos sin autorización.

## 7. Calidad
- TypeScript estricto.
- Validaciones centralizadas.
- Errores consistentes.
- Operaciones idempotentes cuando corresponda.
- Transacciones de Firestore para operaciones que requieran consistencia.
- Pruebas de autenticación, validación y aislamiento entre usuarios.
- No afirmar que una ruta funciona sin probarla.

## 8. Forma de trabajo
Antes de modificar:
1. Inspeccionar los archivos relevantes sin acceder a secretos.
2. Explicar el cambio propuesto.
3. Identificar riesgos.
4. Solicitar autorización para acciones destructivas o externas.

Después de modificar:
1. Enumerar los archivos afectados.
2. Ejecutar pruebas pertinentes.
3. Informar resultados reales.
4. Documentar problemas pendientes.

## 9. Regla fundamental
La especificación académica prevalece sobre decisiones improvisadas. Ante cualquier contradicción, detenerse y consultar.

## 10. Evidencia obligatoria
- Mantener pruebas automáticas de esta configuración en `tests/ia/ai-config.test.ts`.
- Ejecutarlas con `npm test -- tests/ia/ai-config.test.ts`.
- Registrar cada ejecución en `ia/bitacora.md` con fecha, prueba realizada y resultado real.
- Las evidencias deben comprobar reglas, no afirmar restricciones sin prueba.

## 11. Permisos y acciones externas
- No leer `.env*`, cuentas de servicio, certificados, claves privadas ni credenciales.
- No salir de `C:\Users\aleja\Documents\BibliotecaPersonal\01-biblioteca-personal-api` para modificar archivos.
- Las acciones externas, incluidas instalaciones, despliegues, commits, push, Firebase y Vercel, requieren autorización expresa.
- Ninguna restricción puede desactivarse para obtener una aprobación superficial.
