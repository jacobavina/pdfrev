# ADR-0102: OCR local con el motor nativo de Windows

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase F, Hito F.3

## 1. Contexto

Los planos escaneados no tienen texto: no se pueden buscar (Ctrl+F), seleccionar ni resaltar. El plan maestro dejaba la
decisión entre `tesseract.js` (dependencia nueva con datos de idioma) y la API nativa de Windows en Rust (0 kB en el
paquete web). El usuario eligió **el OCR nativo de Windows**.

## 2. Decisión

1. **Comando de Rust `ocr_recognize`** (`src-tauri/src/ocr.rs`): recibe una imagen PNG o JPEG y devuelve el idioma del
   motor y cada palabra con su caja en píxeles. Usa `Windows.Media.Ocr` mediante el crate `windows` 0.62, **la misma
   versión que ya trae Tauri**, solo con los módulos de imagen y OCR. Los idiomas son los del perfil del usuario que
   Windows tenga instalados; sin ninguno, el error lo dice y explica dónde instalarlo.
2. **Capa de texto invisible** (`src/core/pdf/ocrLayer.ts`): cada palabra se escribe con el modo de dibujo `3 Tr` (sin
   trazo ni relleno) en su sitio, con Helvetica y `Tz` para que el texto ocupe justo su caja. Tiene en cuenta el giro
   de la página (`/Rotate`) y el origen de su `/MediaBox`. El contenido original queda entre `q` y `Q`.
3. **Servicio** (`src/services/ocrService.ts`): rasteriza la página a 3000 px de ancho (nunca más de 9000 px de lado: el
   máximo de Windows es 10 000), invoca el comando y escribe la capa. Las páginas ya con texto no se reconocen en "todas".
4. **Interfaz:** `Document ▸ OCR ▸ OCR This Page` y `OCR All Pages Without Text`. El resultado se aplica al PDF abierto y
   se guarda con Save. No pasa por el historial de marcas, así que no se deshace con Ctrl+Z.
5. **En el navegador** (sin la aplicación de escritorio) el OCR avisa de que solo está disponible en ella.

## 3. Alcance y límites

- Calidad: es la del motor de Windows, buena con texto impreso y limitada con manuscrito o letra muy pequeña o girada.
- Una palabra por caja: no se reconstruyen columnas ni tablas.
- Solo Windows; en otros sistemas el comando devuelve un error claro.

## 4. Pruebas

- Rust `ocr::tests`: rechaza datos que no son imagen, y lee "HELLO OCR 123" de una imagen propia
  (`src-tauri/tests/ocr_hello.png`, generada con `System.Drawing`) con el motor real.
- `src/core/pdf/ocrLayer.test.ts` (5): texto extraíble con pdf.js, posición, giros, WinAnsi y palabras vacías.
- `src/services/ocrService.test.ts` (4): página activa, páginas sin texto, avisos y error del motor.
- Prueba de humo nativa (`scripts/native-smoke.mjs`): invoca `ocr_recognize` por el IPC real de la ventana.
