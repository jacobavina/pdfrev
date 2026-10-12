# ADR-0027: Hipervínculos, adjuntos y campos de formulario (Tools ▸ Form / Signature / Hyperlink / File Attachment)

- **Estado:** Aceptado (pedido del usuario, 2026-10-11, con captura del menú Tools de Revu)
- **Fecha:** 2026-10-12

## 1. Decisión

1. **Hyperlink**: recuadro + diálogo (abrir dirección web o ir a una página). En el PDF: /Link con /A /URI o /Dest
   (invisible, como los de Revu/Acrobat). En REA se ve con recuadro discontinuo; Ctrl+clic o doble clic lo sigue.
   Los **enlaces propios del PDF** (índices de láminas) se siguen con un clic con Seleccionar.
2. **Abrir URLs**: comando nativo `open_url` que solo acepta http, https y mailto, rechaza espacios, comillas y
   caracteres de intérprete, e invoca el programa del sistema con la URL como único argumento (sin shell).
3. **File Attachment**: clic → elegir archivo (≤ 25 MB) → marca con clip. Los bytes viven en un almacén aparte
   (`useAttachmentStore`, clave en la marca) y se embeben como /FileAttachment con /EmbeddedFile; al abrir se
   recuperan. Doble clic o Propiedades → "Save attachment…".
4. **Form**: Text Box, Check Box, Radio Button (los seguidos forman un grupo), List Box, Dropdown, Button y Digital
   Signature (campo sin firmar). Se escriben como campos **AcroForm reales** (widget + /FT, /Ff, /V, /Opt, /MK, /DA,
   casillas y opciones con apariencias /Yes·valor y /Off, grupo de radio como campo padre) y se registran en
   /AcroForm /Fields conservando los campos ajenos y sin duplicar los de REA al volver a guardar. Doble clic rellena
   (casilla, opción, texto); listas, desplegables, botón y nombres en Propiedades. Al abrir, los valores rellenados en
   Revu/Acrobat (/V, /AS) mandan.
5. Enlaces, campos y ventanas emergentes ajenos ya no se cuentan como "anotaciones no editables": se conservan.
6. **Menú Tools**: Form ▸, Signature ▸, Hyperlink, File Attachment. **Cinta**: grupo Link & Form.
7. Propiedades, búsqueda y diálogos se cargan de forma diferida para mantener el bundle principal bajo 800 kB.

## 2. Pendiente

Firmar con certificado digital (PKCS#7) — el campo queda listo para firmarse en Revu/Acrobat —; rellenar en REA
formularios ajenos; acciones JavaScript de botones; atajos Shift+H (hipervínculo) y F (adjunto) de Revu, que en REA
están ocupados por resaltado de texto y pluma.

## 3. Evidencia

`src/core/pdf/formsInterop.test.ts` (PDF.js reconoce campos, valores, enlace y contenido del adjunto),
`src/components/PdfViewerForms.test.tsx`, pruebas de Rust de `validate_link_url` y el E2E "Hyperlink, File
Attachment y Form (ADR-0027): …".
