# ADR-0099: PDF protegidos con contraseña (/Encrypt): estado y alcance

- **Estado:** Aceptado (pendiente, no requerido por el usuario)
- **Fecha:** 2026-10-21
- **Hito:** Fase F, Hito F.1, documentado y no implementado

## 1. Contexto

El plan maestro prevé abrir y guardar PDF cifrados (`/Encrypt`, RC4 y AES R2–R6). El usuario indicó que **no lo
requiere** y pidió dejarlo documentado.

## 2. Estado actual

- **Abrir:** PDF.js admite contraseña, pero REA no la pide: un PDF cifrado produce el error de carga.
- **Aplanar:** `exportMarkupsToPdf` rechaza el PDF con el mensaje "The PDF document is password-protected or encrypted
  and cannot be modified."
- **Firma digital:** el cifrado no se toca; `digitalSignature.ts` solo trabaja con PDF sin `/Encrypt`.

## 3. Por qué no se implementa ahora

- Guardar marcas con el escritor incremental exige cifrar cada objeto nuevo con la clave del documento: RC4 y MD5 en TS
  puro, o AES-CBC con Web Crypto y SHA-256/384/512 para R6.
- No hay forma de comprobarlo contra Acrobat o Revu desde las pruebas: un cifrado que solo se verifica contra sí mismo
  no demuestra nada.

## 4. Si se retoma

1. Diálogo de contraseña al abrir y reintento con `PasswordResponses` de PDF.js (solo lectura y marcado en memoria).
2. Guardar las marcas en el sidecar `.bbx.json` mientras no se pueda escribir el PDF cifrado.
3. Escritor cifrado con pruebas de ida y vuelta contra PDF cifrados por Acrobat o Revu aportados por el usuario.
