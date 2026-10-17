# ADR-0074: Cuadro de texto (`/FreeText`) con borde, relleno y alineación (`/Q`) y cierre del escenario S1

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** Fase A — Hito A.4 (Cierre de Revisión de Ingeniería / Escenario S1)

## Contexto

La matriz de paridad con Bluebeam Revu (`docs/plan-v2/06-matriz-capacidades-revu.md`) señalaba dos huecos finales para cerrar la **Fase A (Revisión de Ingeniería)**:
1. El cuadro de texto (`type: 'text'`, `/Subtype /FreeText`) dibujaba el borde con grosor fijo `1` en pantalla y en el `/AP /N`, no permitía quitar el borde (`strokeWidth = 0`), no tenía controles de alineación horizontal (`left`, `center`, `right`) ni persistía la clave estándar `/Q` (`0`, `1`, `2` según ISO 32000-1 §12.5.6.6) junto con `fontFamily`, `textColor`, `noFill`, `bold`, `italic` y `textAlign` en ida y vuelta PDF.
2. El cierre de la Fase A exige el test E2E integral del **Escenario S1** (revisión de plano con cuadro de texto con borde/alineación, respuesta en hilo en `MarkupsList`, cambios de estado de revisión, alineación geométrica de marcas y verificación del PDF guardado).

## Decisión

1. **Borde, relleno y alineación en pantalla, `/AP /N` y exportación aplanada:**
   - `getMarkupSvgDescriptor` (`src/core/markup/render.ts`), `emitMarkupOperators` (`src/core/pdf/operators.ts`) y `exportAnnotatedPdf` (`src/services/pdfExportService.ts`) respetan `style.strokeWidth` (incluido `0` para cuadros sin borde), `style.dashArray`, `style.fillColor` (incluido `'transparent'`) y `textFormat.align` (`'left' | 'center' | 'right'`).
   - En SVG se posiciona el `<text>` y sus `<tspan>` en `rect.x + pad` (`textAnchor: 'start'`), `rect.x + rect.width / 2` (`textAnchor: 'middle'`) o `rect.x + rect.width - pad` (`textAnchor: 'end'`). En `/AP /N` y en el exportador vectorial se calcula el ancho de cada línea con `captionTextWidth` para desplazar el origen horizontal de cada renglón.

2. **Persistencia e interoperabilidad ISO 32000-1 (`/Q`, `/BS`, `/IC`, `/C` y `/REA`):**
   - `saveIncrementalMarkups` (`src/core/pdf/incrementalWriter.ts`) emite `/Q 0` (izquierda), `/Q 1` (centro) o `/Q 2` (derecha) en toda anotación `/Subtype /FreeText`, permite `/BS << /W 0.00 ... >>` cuando `strokeWidth === 0` y persiste `/fontFamily`, `/textColor`, `/noFill`, `/textAlign`, `/bold` e `/italic` en `/REA`.
   - `importPdfAnnotations` (`src/core/pdf/annotationReader.ts`) lee `/Q` del diccionario `/FreeText` con prioridad sobre `/REA` (de modo que si Revu o Acrobat cambian la alineación de la nota, REA la respeta al reabrir) y restaura `fontFamily`, `textColor`, `fillColor: 'transparent'` (`noFill`), `strokeWidth: 0` y `textFormat`.

3. **Controles en `StyleSection.tsx`:**
   - Se añade `0 pt` a `STROKE_WIDTHS` y los tres botones `ribbon-text-align-left`, `ribbon-text-align-center` y `ribbon-text-align-right` en `ribbon-group-font` con iconos SVG propios de 16×16 px y tokens del sistema visual (sin añadir imports de `lucide-react` al bundle principal).

4. **Cierre del Escenario S1:**
   - Se incorpora el test E2E `Escenario S1 (ADR-0074): responde a una marca en MarkupsList, cambia estados, alinea marcas y verifica persistencia` en `tests/e2e/pdf-viewer.spec.ts`.

## Consecuencias

- Los cuadros de texto y llamadas mantienen fidelidad visual y documental entre el lienzo SVG, el flujo de apariencia `/AP /N`, el PDF incremental y el PDF aplanado.
- Queda completada la Fase A del Plan Maestro (`docs/plan-v2/09-masterplan-completitud-revu.md`) con todos sus entregables (`A.0` a `A.4`) y el escenario `S1` automatizado.
