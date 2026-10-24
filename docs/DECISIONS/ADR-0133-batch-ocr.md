# ADR-0133: OCR en Batch

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

El OCR del documento abierto (ADR-0102) usa el motor de reconocimiento de Windows desde Rust. ADR-0125 lo dejó fuera de Batch
porque entonces solo funcionaba sobre el documento abierto. Un juego de planos escaneados necesita pasar por OCR todos sus
archivos para poder buscarlos y seleccionar texto.

## 2. Decisión

1. **File ▸ Batch…** gana la operación *Recognise the text of scanned pages (OCR)* (sufijo `_ocr`).
2. Se extrajo `ocrPdfBytes(bytes)` en `ocrService`: lee con PDF.js qué páginas del archivo **no tienen texto seleccionable**,
   rasteriza solo esas (3000 px de ancho, como el OCR del documento), llama a `ocr_recognize` y escribe la capa de texto
   invisible. Las páginas que ya tienen texto no se tocan.
3. **Solo en la aplicación de escritorio** (el motor es el de Windows): en el navegador la opción sale desactivada con su
   motivo y la función falla con "only available in the desktop app" si se llamara.
4. Un archivo en el que todas las páginas ya tienen texto falla con "Every page already has selectable text." y uno donde el
   motor no encuentra palabras con "OCR found no text on the pages.", en vez de guardar una copia igual.
5. Los archivos se procesan de uno en uno, como el resto del lote.

## 3. Alcance y límites

- No se elige el idioma: el motor usa el de Windows (el informe del documento abierto lo muestra).
- Es lento con escaneos grandes (una llamada nativa por página); el progreso del lote avanza por archivo.
- No se valida la calidad del reconocimiento; depende del motor de Windows y del escaneo.

## 4. Pruebas

- `src/services/ocrBatch.test.ts` (4): solo reconoce las páginas sin texto y avanza el progreso, fuera del escritorio falla sin
  llamar al motor, sufijo `_ocr` y mensaje cuando todo tiene texto, y fallo si el motor no encuentra palabras.
- `src/components/modals/BatchDialog.test.tsx` (+1): la opción está desactivada en el navegador.
- El smoke nativo ya comprueba el motor real (`ocr_recognize` lee "HELLO OCR 123").
