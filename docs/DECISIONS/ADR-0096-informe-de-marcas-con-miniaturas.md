# ADR-0096: Informe de marcas con miniaturas de las hojas

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase E, Hito E.3

## 1. Contexto

El informe en PDF de la lista de marcas (resumen por estado, autor, tipo y subject, y tabla con enlaces a cada hoja,
ADR-0079) no enseña dónde están las marcas. Un lector del informe tiene que abrir el plano para ubicarlas.

## 2. Decisión

1. `buildPdfReportContent` acepta `thumbnails` y, entre el resumen y la tabla, añade **Sheets with Markups**:
   - una rejilla de miniaturas de 160 pt de ancho;
   - sobre cada una, el contorno rojo de todas las marcas de esa hoja;
   - al pie, "Page N - k markups";
   - desborda a páginas nuevas del informe.
2. `src/services/reportThumbnails.ts` rasteriza las hojas con marcas a 480 px de ancho (3 veces el del informe, para
   verse nítido al ampliar), como máximo 12 hojas, y las codifica en PNG. Si una falla, el informe sale igual con las
   demás.
3. Los dos botones del informe de la lista de marcas (el informe suelto y anexarlo al PDF) lo usan.
4. Los enlaces de la tabla a cada hoja (ADR-0079) no cambian.

## 3. Alcance y límites

- Las marcas se dibujan como el rectángulo que las rodea, no con su forma.
- Las tablas de metrados por Subject ya estaban en el informe y en el `.xlsx`; no se cambian.
- Sin documento abierto (informe de una sesión sin PDF) el informe no lleva miniaturas.

## 4. Pruebas

- `src/services/reportThumbnails.test.ts` (3).
- E2E `Informe de marcas con miniaturas (ADR-0096)`: el PDF descargado contiene la imagen de la hoja.
