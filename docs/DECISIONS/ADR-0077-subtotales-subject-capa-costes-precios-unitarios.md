# ADR-0077: Subtotales por Subject y Capa con Costes y Precios Unitarios Exactos

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** Fase B — Hito B.3 (Medición y Takeoff / Escenario S2)

## Contexto

En el flujo de trabajo de medición y estimación de costes (Quantity Takeoff) de Bluebeam Revu, las marcas se organizan fundamentalmente por su campo **Subject** (asunto/partida, p. ej. "Pavimento Granito", "Puertas RF-60", "Tubería Cobre") y por su **Capa** (Layer).

Para alcanzar paridad rigurosa con Revu:
1. Las mediciones deben poder subtotalizarse por `Subject`, `Layer` y `Page` sumando los valores geométricos brutos antes de redondear, evitando discrepancias de redondeo acumuladas al calcular partidas.
2. Cada marca o partida puede tener asignado un precio unitario (`unitPrice`) y un coste total (`cost`), o bien obtener el precio unitario a partir de un catálogo por `Subject`.
3. El cálculo de costes no puede sufrir los defectos de redondeo inherentes a la aritmética de coma flotante IEEE-754 (como `0.1 + 0.2 !== 0.3`). Los importes deben procesarse con aritmética entera determinista en céntimos (`toCents`, `fromCents`, `computeItemCostCents`).
4. Tanto el panel de mediciones (`MeasurementsPanel`) como la lista de marcas (`MarkupsList`) deben reflejar estos subtotales, agrupaciones y columnas de precios y costes.
5. Los campos `subject`, `unitPrice` y `cost` deben persistirse de forma bidireccional en el estándar PDF ISO 32000-1 (`/Subj` en la anotación y claves `/subject`, `/unitPrice`, `/cost` en el diccionario de aplicación `/REA`).

## Decisión

1. **Modelo de datos (`src/types/markup.ts`):**
   - Se añaden a `Markup` los campos opcionales:
     - `subject?: string;` (asunto/partida de medición, mapeado a `/Subj` estándar ISO).
     - `unitPrice?: number;` (precio unitario en unidades monetarias).
     - `cost?: number;` (coste total en unidades monetarias).

2. **Módulo puro de cálculo y costes (`src/core/measurements/takeoffCosts.ts`):**
   - Se definen funciones aritméticas exactas en céntimos enteros: `toCents`, `fromCents`, `computeItemCostCents` y `formatCurrency`.
   - Se implementa `computeTakeoffSubtotals` con modos de agrupación `'subject' | 'layer' | 'page'`, sumando cantidades completas sin redondear antes de formatear y calculando el coste total del subtotal mediante `computeItemCostCents(acc.rawQuantity, acc.unitPriceCents)`.

3. **Columnas de MarkupsList (`src/core/markup/markupColumns.ts`):**
   - Se añaden las columnas `unitPrice` y `cost` a `MARKUP_COLUMNS`.
   - `columnText` formatea `subject` priorizando `m.subject` sobre la etiqueta por tipo, e imprime importes monetarios formateados `$X.XX`.
   - `groupBySubject` agrupa marcas dinámicamente según `m.subject?.trim() || markupTypeLabel(m.type)`.

4. **Panel de mediciones (`src/components/shell/MeasurementsPanel.tsx`):**
   - Se incorpora el selector `Group by: Category | Subject | Layer` en la sección Totals.
   - En modo `Category` conserva la vista de totales original con sus testids intactos.
   - En modos `Subject` y `Layer`, presenta la tabla de subtotales de takeoff con cantidades acumuladas exactas, conteo de ítems y costes unitarios/totales.

5. **Interoperabilidad y persistencia PDF (`src/core/pdf/incrementalWriter.ts` y `annotationReader.ts`):**
   - `incrementalWriter.ts` serializa `/Subj (subject)` en el diccionario estándar de anotación e incluye `/subject`, `/unitPrice` y `/cost` dentro de `/REA`.
   - `annotationReader.ts` lee `/Subj` estándar y las claves enriquecidas de `/REA`, reconstruyendo completamente los campos en los objetos `Markup`.

## Consecuencias

- Se garantiza cálculo exacto de presupuestos y takeoff sin errores de precisión decimal ni redondeo previo.
- Cero impacto de bundle en el chunk principal, manteniéndose por debajo de la regla dura de 800 kB al ubicarse en módulos cargados dinámicamente (`MeasurementsPanel` y `MarkupsList`).
- Plena interoperabilidad bidireccional con Bluebeam Revu y Adobe Acrobat en el campo `/Subj`.
