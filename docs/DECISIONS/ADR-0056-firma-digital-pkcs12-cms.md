# ADR-0056: Firma con certificado digital PKCS#12 (.pfx / .p12) y creación de certificado autofirmado

- **Estado**: Aceptado
- **Fecha**: 2026-10-15
- **Relacionado con**: ADR-0027 (`formField` de tipo `signature`), `src/core/pdf/digitalSignature.ts`, `src/components/modals/SignDocumentModal.tsx`, `src/components/markup/InteractiveProperties.tsx`

## Contexto

Con `ADR-0027`, REA permitía colocar campos de firma digital (`/FT /Sig`) sin firmar para que se firmasen después en Revu o Acrobat. El usuario solicitó completar la firma digital directamente desde REA, decidiendo primero de dónde se toman los certificados y aprobando la opción recomendada:
1. Importar un archivo de identidad digital estándar **PKCS#12 (`.pfx` / `.p12`)** protegido con contraseña.
2. Permitir **crear y exportar un certificado autofirmado nuevo (`.pfx`)** directamente desde REA (nombre común, organización, correo y contraseña), igual que el asistente *New Digital ID* de Bluebeam Revu y Adobe Acrobat.
3. No añadir dependencias pesadas al bundle inicial (`<= 800.00 kB`).

## Decisión

1. **Módulo criptográfico puro sobre WebCrypto (`src/core/pdf/digitalSignature.ts`, cargado bajo demanda)**:
   - Codificador y lector ASN.1 DER propio sin dependencias externas.
   - `createSelfSignedPfx`: genera un par RSA-2048 (`RSASSA-PKCS1-v1_5`, `SHA-256`) con `crypto.subtle`, construye un certificado X.509 v3 autofirmado (`BasicConstraints`, `KeyUsage: digitalSignature | nonRepudiation`) y lo empaqueta junto con la clave privada cifrada mediante PBES2 (`PBKDF2-HMAC-SHA256` + `AES-256-CBC`) en un contenedor PKCS#12 (`PFX` v3, RFC 7292).
   - `parsePfxCertificate`: abre archivos `.pfx` / `.p12`, descifra `EncryptedPrivateKeyInfo` con la contraseña proporcionada y extrae el certificado X.509 y la clave privada WebCrypto.
   - `signPdfWithCertificate`: guarda las marcas y la apariencia visual `/AP /N` del sello de firma (`Digitally signed by …`, `Date: …`, `Reason: …`, `Location: …`) y añade una revisión incremental con el diccionario `/Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached`, `/ByteRange` exacto sobre todo el documento salvo el hex de `/Contents`, contenedor CMS `SignedData` detached real (`contentType`, `signingTime`, `messageDigest` SHA-256 y firma RSA-2048), `/V` en el widget `/FT /Sig` y `/SigFlags 3` en `/AcroForm`.
   - `verifyPdfSignature`: verifica criptográficamente el `/ByteRange`, el resumen SHA-256 y la firma RSA del `SignerInfo` contra el certificado X.509 embebido en el CMS.
2. **Interfaz de usuario (`SignDocumentModal.tsx` e `InteractiveProperties.tsx`)**:
   - Al seleccionar un campo `signature` no firmado, el inspector muestra el botón `"Sign Document…"`, que abre `SignDocumentModal` (cargado con `React.lazy`) con las dos pestañas (`Digital ID File (.pfx / .p12)` y `Create Self-Signed ID`) además de `Reason` y `Location`.
   - Una vez firmado (o al abrir un PDF con un campo `/FT /Sig` ya firmado), el campo queda bloqueado (`locked = true`), muestra el sello visual en el lienzo y en `/AP /N`, y expone los metadatos del firmante en `InteractiveProperties`.

## Verificación

- `src/core/pdf/digitalSignature.test.ts`:
  - `crea un certificado autofirmado .pfx/.p12, lo reabre con su contraseña y rechaza contraseñas incorrectas`
  - `firma un campo /FT /Sig con /Type /Sig, /ByteRange, /Contents CMS válido, /SigFlags 3 y apariencia /AP /N`
- `tests/e2e/pdf-viewer.spec.ts`: paso 4 de `Hyperlink, File Attachment y Form (ADR-0027)`.
