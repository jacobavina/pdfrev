# ADR-0078: Herramientas de Medición en el Tool Chest con Subject, Unidad, Profundidad y Precio Unitario

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** Fase B — Hito B.4 (Medición y Takeoff / Escenario S2)

## Contexto

En Bluebeam Revu, el **Tool Chest** es una pieza central para la eficiencia en mediciones y Quantity Takeoff:
1. Permite guardar marcas de medición frecuentes (como áreas de pavimento con precio unitario, volúmenes de hormigón con su profundidad y coste, o conteos de puertas/luminarias con su símbolo y escala) en paletas personalizadas o en la paleta por defecto ("My Tools").
2. Al reutilizar una herramienta de medición desde el Tool Chest, debe conservar íntegramente:
   - Su **Subject** (asunto/partida presupuestaria).
   - Su **Capa** (Layer) asignada.
   - Su **Precio unitario** (`unitPrice`) y recálculo automático de coste (`cost`).
   - Su configuración de medición y campos personalizados (`customFields`), incluyendo `volumeDepth` (profundidad en herramientas de volumen), `countSymbol` y `countScale` (símbolo y escala en herramientas de conteo).
   - Su unidad de medida y datos de medición previa (`measurement`).
   - Su geometría o puntos de referencia (`points`).
3. La herramienta guardada puede activarse en **Modo Dibujo** (Drawing Mode), donde al hacer clic en el Tool Chest se precargan todas sus propiedades en `useToolStore` para dibujar nuevas mediciones sobre el plano, o bien en **Modo Propiedades** (Properties Mode), donde al pulsar la herramienta se aplican en lote todas sus propiedades y metadatos sobre las marcas seleccionadas en un único comando atómico deshacible con `Ctrl+Z`.
4. Asimismo, el usuario puede arrastrar la herramienta directamente desde el Tool Chest y soltarla sobre el lienzo (Drag & Drop), colocándola en las coordenadas correspondientes con su calibración y escala actualizadas.

## Decisión

1. **Modelo de datos de Tool Chest (`src/types/toolChest.ts`):**
   - Se extienden `ToolChestTool`, `CreateToolInput` y `RecentTool` con:
     - `subject?: string;`
     - `layer?: string;`
     - `unitPrice?: number;`
     - `customFields?: Record<string, string | number>;`
     - `points?: MarkupPoint[];`
     - `measurement?: MarkupMeasurement;`

2. **Servicio y almacenamiento (`src/services/toolChestService.ts`):**
   - `createTool` asigna y persiste en IndexedDB (y en fallback en memoria) todos los metadatos de medición y takeoff.
   - `updateTool` preserva y actualiza selectivamente `customFields`, `points`, `measurement`, `subject`, `layer` y `unitPrice`.
   - `recordRecentTool` captura desacopladamente todos estos campos en las herramientas recientes y ajusta la deduplicación para comparar también `subject`.

3. **Store de Tool Chest (`src/store/useToolChestStore.ts`):**
   - `createToolFromMarkup`: clona y propaga `subject`, `layer`, `unitPrice`, `customFields`, `points` y `measurement` desde la marca original.
   - `applyTool`:
     - En **Modo Propiedades**: invoca `applyPropertiesToMarkups` transmitiendo `style`, `text`, `textFormat`, `subject`, `layer`, `unitPrice` y `customFields`.
     - En **Modo Dibujo**: activa la herramienta en `useToolStore`, fijando `activeTool`, `currentStyle`, `activeLayer`, `volumeDepth`, `countSymbol` y `countScale`, y registra `activeToolId`.

4. **Aplicación en lote y recálculo de costes (`src/store/useMarkupStore.ts`):**
   - `applyPropertiesToMarkups` acepta `subject`, `unitPrice` y `cost`.
   - Si se actualiza `unitPrice`, recalcula el coste con aritmética entera en céntimos sobre la cantidad (`countItems` para conteos o `measurement.value` para mediciones).
   - El historial preserva copias completas de las marcas anteriores, permitiendo revertir con un solo `undo`.

5. **Lienzo y creación interactiva (`src/components/PdfViewer.tsx` y `src/components/viewer/toolDropPlacement.ts`):**
   - Al trazar mediciones (`commitMeasurement`, `onMouseDown` en `count`, o trazos de 2 puntos en `length`), si la herramienta activa procede de una herramienta del Tool Chest, se heredan automáticamente su `subject`, `layer`, `unitPrice` y se computa su `cost` vía el helper unificado `getActiveToolChestMetadata`.
   - Limpieza de estado residual: `useToolStore.setActiveTool` invoca `registerOnSetActiveTool` para limpiar `activeToolId` de `useToolChestStore` al conmutar a herramientas estándar desde Ribbon, menús o atajos, evitando contaminación de metadatos en mediciones genéricas.
   - En `onDrop`: la colocación y recálculo de herramientas soltadas se delega a `placeDroppedTool` en `src/components/viewer/toolDropPlacement.ts` vía `import()` dinámico, y el editor `InlineTextEditor` pasa a lazy con `Suspense`, manteniendo el chunk principal en 798.38 kB (estrictamente `<= 800 kB`).

6. **Interfaz de usuario (`src/components/toolchest/ToolChestPanel.tsx`):**
   - La lista de herramientas muestra visualmente el `subject`, el tipo, la profundidad (`d: X`), el símbolo/escala de conteo, la unidad con superíndice dimensional (m², m³) y el precio unitario formateado, respetando el sistema de diseño y las reglas de Tailwind sin colores literales.

## Consecuencias

- Paridad completa con el flujo de plantillas y reutilización de mediciones de Bluebeam Revu.
- Las herramientas de medición del Tool Chest agilizan enormemente el proceso de Takeoff al no requerir reconfigurar profundidad, símbolos ni precios en cada marca.
- Aislamiento y cumplimiento estricto del presupuesto de bundle (0 imports estáticos nuevos en el chunk principal; chunk principal en 798.38 kB, por debajo de los 800.00 kB).
