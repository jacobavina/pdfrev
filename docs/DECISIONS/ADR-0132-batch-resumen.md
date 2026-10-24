# ADR-0132: Batch con resumen de marcas

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Revu ofrece Summary en Batch: la lista de marcas de cada archivo sin abrirlos. Es lo que se manda al coordinador al cerrar la
revisión de un juego de planos. ADR-0125 y ADR-0130 dejaron esa operación fuera.

## 2. Decisión

1. **File ▸ Batch…** gana la operación *List the markups of each file*. Por cada PDF genera `<nombre>_summary.csv` con la
   misma tabla que File ▸ Export ▸ CSV (página, tipo, comentario, autor, fecha, estado, color, medición y unidad), con BOM
   UTF-8 para que Excel lo abra con acentos.
2. Las marcas se leen del propio archivo (`importPdfAnnotations`): las de REA, las de Revu y las de Acrobat.
3. Un archivo sin marcas se marca como fallido con "This file has no markups to summarise.", como Flatten.
4. El nombre de salida lleva ahora la **extensión de la operación** (`opExtension`: `csv` para el resumen, `pdf` para las
   demás) y las descargas del navegador usan el tipo `text/csv` para los CSV.

## 3. Alcance y límites

- Una tabla por archivo; no hay un único CSV combinado de todo el lote (el informe del lote lista los archivos).
- Sin columnas personalizadas ni valores calculados: eso queda para la exportación del documento abierto.
- OCR sigue sin ser operación del lote (necesita el motor nativo página a página).

## 4. Pruebas

- `src/services/batchOps.test.ts` (+1): sufijo y extensión, nombre `A-101_summary.csv`, el CSV de un archivo con dos marcas y el
  fallo sin marcas.
- `src/components/modals/BatchDialog.test.tsx` (+1): un archivo sin marcas se marca como fallido con el motivo.
