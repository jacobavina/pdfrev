# ADR-0079: Hipervínculos del Resumen PDF a la Página de Cada Marca (Reporte Anexo e Independiente)

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** Fase B — Hito B.5 (Medición y Takeoff / Escenario S2)

## Contexto

En Bluebeam Revu, la función de **Resumen de Marcas en PDF (Markup Summary)** es un pilar fundamental para la entrega de presupuestos, revisiones técnicas y Quantity Takeoff:
1. Permite consolidar todas las marcas, mediciones, partidas presupuestarias (`Subject`), autores, estados y costes en un informe estructurado.
2. Para que el informe sea plenamente interactivo y auditable, cada fila del reporte debe incluir un **hipervínculo navegable** (`/Subtype /Link`) que transporte al revisor directamente a la página exacta de la marca en el plano.
3. En la práctica profesional se requieren dos modalidades operativas:
   - **Reporte Anexo (Append to Current PDF & Hyperlink):** El informe se estampa como hojas adicionales al final del plano arquitectónico/estructural. Cada enlace en la tabla del informe utiliza destinos y acciones internas (`/Dest [pageRef /Fit]` y `/A << /S /GoTo /D [pageRef /Fit] >>`), permitiendo saltar con un clic entre la partida presupuestaria del informe y la geometría dibujada en el plano.
   - **Reporte Independiente (Export Standalone Summary):** Genera un archivo `.pdf` autónomo con la cabecera ejecutiva y la tabla de marcas, dotando a la columna de página de enlaces remotos (`/A << /S /GoToR /F (docTitle) /D [pageIndex /Fit] >>`) conforme a ISO 32000-1 §12.6.4.3.
4. Las celdas enlazadas deben contar con la semántica visual estándar de la industria (azul técnico `#0969da` con subrayado fino) y una caja de activación (`/Rect`) holgada que facilite el clic.
5. El informe debe incorporar las capacidades de Takeoff consolidadas en B.3 y B.4: partidas por `Subject`, cantidades con su unidad dimensional, precio unitario y coste exacto en céntimos, totalizando el presupuesto en la sección ejecutiva.

## Decisión

1. **Opciones y Firma de Generación (`src/services/exportService.ts`):**
   - Se formaliza la interfaz `PdfReportOptions`:
     - `sourcePdfBytes?: Uint8Array`: bytes del PDF original para anexar o enlazar.
     - `appendSummary?: boolean`: activa el modo anexo sobre el plano original.
     - `includeHyperlinks?: boolean`: permite activar/desactivar la inyección de anotaciones `/Link` (por defecto `true`).
     - `customColumns?: BbxCustomColumn[]` y `evaluatedFields?: EvaluatedMatrixInput`.
   - Se implementa la función de alto nivel `appendPdfSummaryReport(sourcePdfBytes, docTitle, markups, options)` para el flujo integrado de un solo paso.

2. **Creación de Anotaciones `/Link` conforme a ISO 32000-1:**
   - En **Modo Anexo**:
     - Se carga el documento original con `PDFDocument.load(sourcePdfBytes)` y se conservan sus páginas.
     - Las páginas de resumen se añaden tras la última página del plano.
     - Para cada marca con `pageIndex`, se resuelve `targetPage = pdfDoc.getPage(pageIndex)` y se crea un objeto de anotación con `/Subtype /Link`, `/Dest [targetPage.ref /Fit]` y `/A << /S /GoTo /D [targetPage.ref /Fit] >>`.
   - En **Modo Independiente**:
     - Se crea un nuevo documento con `PDFDocument.create()`.
     - Cada fila genera una anotación `/Subtype /Link` con acción `/GoToR` referenciando el nombre del plano y su índice de página, además del destino `/Dest`.
   - Ambas modalidades registran la anotación en el diccionario `/Annots` de la página del reporte mediante `pdfDoc.context.register()`.

3. **Presentación Visual y Columnas de Takeoff:**
   - La celda de página dibuja el texto del número de hoja en color `rgb(0.04, 0.41, 0.85)` y traza una línea de subrayado horizontal inferior.
   - El rectángulo de la anotación `/Rect` abarca tanto el índice `#` como la columna `Page`, optimizando la ergonomía de pulsación (Fitts's Law).
   - La tabla incluye columnas dedicadas para `Subject`, `Type`, `Measurement`, `Cost`, `Status` y `Comment`.
   - En la cabecera ejecutiva se computa y muestra el desglose por `Subject` y el coste total acumulado (`Total Takeoff Cost: $X.XX`).

4. **Integración en la Interfaz de Usuario:**
   - `src/store/useUiStore.ts`: se extiende `exportRequest` para aceptar `kind: 'csv' | 'report' | 'append-report'`.
   - `src/components/shell/MenuBar.tsx`: se añade la opción `Append Summary to PDF…` en el submenú `Export`.
   - `src/components/MarkupsList.tsx`: se añade el botón `data-testid="append-pdf-report-button"` junto a `PDF Report`, permitiendo guardar el informe integrado o el resumen independiente con un clic.

## Consecuencias

- Paridad completa con el flujo de generación e hipervinculación de resúmenes de Bluebeam Revu (`P3-E.3` / `P4-D.3`).
- Compatibilidad universal con visores PDF estándar (Adobe Acrobat, Bluebeam Revu, PDF.js, Foxit y visores de navegador), donde al hacer clic en la página del reporte se salta directamente a la marca en el plano.
- Cero sobrecoste en el chunk principal de la aplicación: el módulo `exportService.ts` se carga exclusivamente de forma diferida con `import()` dinámico al solicitar la exportación.
