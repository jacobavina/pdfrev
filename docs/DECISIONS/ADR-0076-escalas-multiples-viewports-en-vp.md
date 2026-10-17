# ADR-0076: Escalas múltiples por hoja (Viewports en /VP)

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** Fase B — Hito B.2 (Medición y Takeoff / Escenario S2)

## Contexto

En planos de ingeniería y arquitectura es común tener una hoja con una escala general (p. ej. 1:100) y varias zonas o detalles ampliados con escalas distintas (p. ej. 1:20 o 1:50) en la misma página.
En Bluebeam Revu, estas regiones se denominan *Viewports* y se almacenan en el array estándar `/VP` del diccionario de página del PDF (ISO 32000-1 §14.4).

Para alcanzar paridad con Revu:
1. Cualquier medición ubicada total o mayoritariamente dentro de una región de viewport debe calcular su dimensión real según la escala propia de dicho viewport en lugar de la escala general de la página.
2. Si existen viewports anidados o superpuestos, debe prevalecer el viewport de menor área (detalle más específico).
3. Modificar o recalibrar la escala de un viewport debe recalcular en cascada todas las marcas dependientes.
4. Mover una marca entre regiones con escalas distintas debe adaptar automáticamente su valor medido y texto.
5. El almacenamiento en el archivo PDF debe seguir el estándar ISO 32000-1 §14.4 (`/Type /Viewport`, `/BBox`, `/Measure` con subtipo `/RL`) y enriquecerse con metadatos de sincronización (`/REACal`, `/REAId`, `/REABounds`) para garantizar interoperabilidad completa con Revu, Acrobat y apertura en REA.

## Decisión

1. **Modelo de datos (`src/types/markup.ts`):**
   - Se crea la interfaz `MeasurementViewport` con `{ id, name, pageIndex, bounds: { x, y, width, height }, calibration: PageCalibration }`.
   - `bounds` define el rectángulo de la región en coordenadas normalizadas `[0, 1]` relativas a la página.

2. **Cálculo y resolución de viewports (`src/core/measurements/viewports.ts`):**
   - Se implementan funciones puras `isPointInViewport`, `findMatchingViewport` y `getEffectiveCalibrationForPoints`.
   - Si una marca contiene múltiples puntos, se calcula su centro envolvente. En caso de solapamiento de regiones, se selecciona el viewport con menor área de superficie.

3. **Store de calibración (`src/store/useCalibrationStore.ts`):**
   - Se añaden `viewports: Record<number, MeasurementViewport[]>`, `importedViewports`, `loadDocumentViewports`, `changedViewports`, `getViewports`, `addViewport`, `updateViewport`, `removeViewport` y `getEffectiveCalibration(pageIndex, points?)`.

4. **Suscripción y recálculo dinámico en el visor (`src/components/PdfViewer.tsx`):**
   - El visor se suscribe a los cambios de `viewports` en `useCalibrationStore`: cualquier alteración en los viewports recalcula automáticamente las marcas de medición de la página afectada mediante `remeasureMarkup`.
   - Las herramientas de dibujo de medidas (`length`, `area`, `perimeter`, `volume`, `dimension`, etc.) y sus vistas previas determinan su calibración activa llamando a `getEffectiveCalibration(currentPageIndex, points)`.
   - Al finalizar el desplazamiento de marcas (`handleWindowMouseUp` y `handleMouseUp`), si una marca de medición cambia de región y por ende de calibración efectiva, se recalcula y enriquece `MoveMarkupItem` con `newMeasurement` y `newText`, permitiendo deshacer/rehacer de forma atómica.
   - Se dibuja un overlay interactivo SVG para cada viewport de la página activa, mostrando su marco discontinuo y una etiqueta con su nombre y relación de escala.

5. **Panel lateral de mediciones (`src/components/shell/MeasurementsPanel.tsx`):**
   - Se incorpora la sección plegable `Viewports` (`measure-viewports-section`) para listar los viewports de la página actual, renombrarlos, eliminarlos o agregar nuevos viewports (`add-viewport-btn`).

6. **Interoperabilidad y persistencia PDF (`src/core/pdf/pdfScale.ts` e `incrementalWriter.ts`):**
   - `normalizedBoundsToPdfBBox` y `pdfBBoxToNormalizedBounds` convierten entre coordenadas normalizadas y el espacio PDF teniendo en cuenta la rotación de página y el MediaBox.
   - `viewportArrayFor` serializa el viewport global y la lista de viewports regionales en el array `/VP` de la página con sus diccionarios `/Measure` estándar y claves `/REAId`, `/REABounds` y `/REACal`.
   - `readPageViewports` e `importPdfViewports` extraen los viewports regionales al abrir el documento PDF.
   - `saveIncrementalMarkups` en `incrementalWriter.ts` y `pdfPersistenceService.ts` escriben los viewports actualizados incrementalmente sin alterar el prefijo del documento.

## Consecuencias

- Se garantiza compatibilidad bidireccional con planos que contienen múltiples escalas en una misma lámina.
- El chunk principal de la aplicación no sufre impacto de peso estático, pues `pdfScale` se carga dinámicamente y `MeasurementsPanel` ya se importa vía `React.lazy`.
- Todo cambio en viewports se propaga de forma reactiva a las cotas, mediciones de longitud, áreas y volúmenes.
