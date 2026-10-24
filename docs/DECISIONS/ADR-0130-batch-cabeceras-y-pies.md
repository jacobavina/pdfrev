# ADR-0130: Batch con cabeceras y pies

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

ADR-0125 dejó fuera de Batch las operaciones que ya existían para el documento abierto. Headers & Footers (ADR-0114) es la
más pedida para entregar un juego de planos: la misma leyenda con el nombre del archivo y el número de hoja en cada PDF.

## 2. Decisión

1. **File ▸ Batch…** gana la operación *Add headers and footers* (sufijo `_stamped`): las seis ranuras (arriba y abajo,
   izquierda, centro y derecha) con los mismos campos que el diálogo del documento: `{n}`, `{total}`, `{page}`, `{pages}`,
   `{date}`, `{time}`, `{file}` y `{title}`.
2. Valores fijos del lote: Helvetica de 9 pt, margen de 28 pt (unos 10 mm), el color de Number Pages, numeración desde 1 y
   **todas las páginas** de cada archivo. `{file}` es el nombre del archivo de entrada sin extensión y `{title}` el título de
   su metadato (vacío si no tiene). La fecha y la hora son las del momento de procesar.
3. Una ranura rellena por defecto (`Page {n} of {total}` abajo al centro). Si no queda ningún texto el lote no arranca ("Write
   at least one header or footer text.") y, si se llegara a ejecutar, cada archivo falla con ese motivo.
4. Es la misma función de estampado que usa el diálogo del documento (`stampHeadersFooters`), así que el texto sale derecho
   en páginas rotadas.

## 3. Alcance y límites

- Tamaño, margen, fuente y color no se pueden elegir en el lote; para eso está Document ▸ Headers & Footers… sobre el
  documento abierto.
- Siguen sin ser operaciones del lote OCR (necesita el motor nativo página a página) y Summary.

## 4. Pruebas

- `src/services/batchOps.test.ts` (+1): el texto con `{file}` y la numeración aparecen en el contenido de las tres páginas
  y sin ningún texto el archivo falla con su motivo; sufijo `stamped`.
- `src/components/modals/BatchDialog.test.tsx` (+1): pide al menos un texto y guarda cada archivo con `_stamped`.
- E2E `Batch con cabeceras y pies (ADR-0130)`: el PDF descargado pesa más que el original, conserva sus tres páginas y se
  llama `test-blueprint_stamped.pdf`.
