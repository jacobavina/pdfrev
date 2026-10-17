# ADR-0080: Exportación a Excel (.xlsx) con Partidas por Subject, Cantidades Numéricas, Precios Unitarios y Fórmulas Vivas SUM y Producto

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** Fase B — Hito B.7 (Medición y Takeoff / Escenario S2)

## Contexto

En los flujos de trabajo de estimación de costes, mediciones y Quantity Takeoff con Bluebeam Revu:
1. Los presupuestistas y jefes de obra exportan los cómputos métricos a libros de cálculo Excel (`.xlsx`) para consolidar ofertas, licitaciones y cuadros de precios.
2. Una simple exportación en texto plano o valores numéricos estáticos es insuficiente para los estándares profesionales de estimación:
   - Si el usuario modifica una cantidad medida o ajusta un precio unitario directamente en Excel, los importes y los totales deben recalcularse en tiempo real de forma automática.
   - Para ello, las celdas de coste por partida deben contener **fórmulas vivas de producto** (`=G{row}*I{row}` correspondiente a `Quantity * Unit Price`).
   - Las celdas de subtotal por `Subject` deben contener **fórmulas vivas de suma** (`=SUM(J{start}:J{end})`).
   - El gran total del proyecto debe sumar los subtotales con fórmulas de agregación (`=SUM(J{sub1},J{sub2},...)`).
3. **Regla de oro de tipado de celdas:** Las cantidades y los precios unitarios deben ser valores numéricos puros (tipo `number`, no cadenas de texto), dotados de máscaras de formato contable (`$#,##0.00` y `#,##0.00`) para permitir operaciones matemáticas inmediatas sin conversiones manuales.
4. **Restricción estricta de bundle (≤ 800.00 kB):** La biblioteca de generación de hojas de cálculo de formato Office OpenXML (`exceljs`, licencia MIT) tiene un peso minificado considerable (~940 kB). Conforme a la regla dura del Masterplan, **bajo ningún concepto** puede importarse de forma estática en el bundle principal de la aplicación.
5. **Seguridad e integridad en Tauri (IPC Rust):** La escritura del archivo `.xlsx` debe realizarse mediante el mecanismo de persistencia atómica con reemplazo seguro en Rust (`save_export_file`), validando estrictamente la extensión dentro de la lista blanca permitida (`.csv`, `.pdf`, `.xlsx`).

## Decisión

1. **Aislamiento en Chunk Dinámico (`src/services/xlsxExportService.ts`):**
   - Se crea el servicio especializado `xlsxExportService.ts`, el cual carga `exceljs` bajo demanda exclusivamente mediante `await import('exceljs')`.
   - Ni `exceljs` ni `xlsxExportService` forman parte del chunk principal `index-*.js`, alojándose en sus propios fragmentos asíncronos (`exceljs.min-*.js` y `xlsxExportService-*.js`).
   - El tamaño del chunk principal permanece en **798.80 kB**, respetando holgadamente el techo innegociable de **800.00 kB**.

2. **Estructura del Libro Excel:**
   - **Hoja 1: "Takeoff Schedule" (Partidas agrupadas por Subject):**
     - Filas 1–2: Título ejecutivo del proyecto y fecha de exportación.
     - Fila 4: Cabecera con fondo pizarra (`#1E293B`), tipografía blanca en negrita y alineación contextual (números centrados o a la derecha).
     - Columnas: `Item` (A), `Page` (B), `Subject` (C), `Layer` (D), `Type` (E), `Description` (F), `Quantity` (G), `Unit` (H), `Unit Price` (I), `Total Cost` (J).
     - Partidas: Para cada marca, la celda de coste en la columna J se genera con la fórmula viva `=G{row}*I{row}` y resultado precalculado exacto en céntimos enteros.
     - Filas de Subtotal por Subject: Fórmulas vivas `=SUM(J{start}:J{end})` para el coste acumulado y `=SUM(G{start}:G{end})` para la cantidad cuando las unidades son homogéneas. Fondo diferenciado (`#F8FAFC`) con bordes contables.
     - Fila de Total General: `TOTAL TAKEOFF` con fórmula viva de agregación de subtotales `=SUM(J{sub1},J{sub2},...)` y formato con doble borde inferior contable.
   - **Hoja 2: "All Markups" (Detalle tabular completo):**
     - Contiene todas las marcas del documento con sus metadatos (Autor, Fecha, Estado, Tipo, Capa, Comentarios) y soporte completo para columnas personalizadas (`customColumns`).

3. **Tipado Numérico y Precisión Aritmética:**
   - Todas las cantidades (`Quantity`) y precios (`Unit Price`) se insertan como tipo `number` en el modelo OpenXML, nunca como `string`.
   - Los precios y costes se calculan internamente con aritmética entera en céntimos (`toCents`, `computeItemCostCents`, `fromCents`) de `takeoffCosts.ts` antes de emitir los valores de resultado de fórmula, eliminando imprecisiones de coma flotante.
   - Formatos numéricos aplicados:
     - Cantidades: `#,##0.00` (o `0` para marcas de tipo `count`).
     - Precios y Costes: `"$#,##0.00"` (o `#,##0.00 "€"` en configuración europea).

4. **Extensión de la Lista Blanca en Rust (`src-tauri/src/lib.rs`):**
   - Se amplía el comando `save_export_file` para aceptar la extensión `.xlsx`:
     `if ext != "csv" && ext != "pdf" && ext != "xlsx"`.
   - Se mantiene la escritura atómica mediante fichero temporal `<path>.tmp`, `sync_all` y renombrado atómico (`fs::rename`), garantizando que si se produce un corte de energía o fallo durante la exportación, nunca quede un archivo corrupto.
   - Se añade la prueba unitaria en Rust: `test_save_export_file_atomic_success_xlsx`.

5. **Integración en la Experiencia de Usuario:**
   - `src/store/useUiStore.ts`: `requestExport` acepta el valor `'xlsx'`.
   - `src/components/shell/MenuBar.tsx`: opción `Takeoff Schedule (Excel .xlsx)…` en el submenú `Export`.
   - `src/components/MarkupsList.tsx`: botón `data-testid="export-xlsx-button"` en la barra de herramientas de la lista de marcas.
   - `src/components/shell/MeasurementsPanel.tsx`: botón `data-testid="measurements-export-xlsx-button"` en la sección `Export` del panel lateral de mediciones.

## Consecuencias

- **Paridad Plena con Revu y Flujos de Estimación:** Los archivos `.xlsx` generados se abren nativamente en Microsoft Excel, LibreOffice Calc y Google Sheets, ofreciendo un desglose por `Subject` con fórmulas vivas de producto y suma verificadas tanto en la API de ExcelJS como directamente en el XML de la hoja (`xl/worksheets/sheet1.xml`).
- **Seguridad y Robustez:** Escritura atómica respaldada por Rust y fallback de descarga vía Blob en navegadores.
- **Eficiencia y Rendimiento:** Cero impacto en el tiempo de carga inicial y en el chunk principal, cumpliendo rigurosamente la regla dura de bundle de 800 kB (798.80 kB medidos).
