# ADR-0083: Pestañas Multi-Documento con Sesiones, Marcas e Historial Independientes

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Autor:** Jacob Aviña / Antigravity
- **Hito:** Fase C (Documento, Navegación y Páginas — P5-B.2 / C.1)
- **Decisión anterior:** ADR-0082 (Reordenación de páginas con drag & drop y remapeo de marcas) y ADR-0065 (Banda de documentos superior).

---

## Contexto y Necesidad de Producto

En Bluebeam Revu 21, la navegación multi-documento mediante pestañas superiores en la barra `DocumentBar` es fundamental:
- Un revisor o estimador abre simultáneamente varios planos (p. ej. arquitectura, estructura e instalaciones) y conmuta entre ellos al instante sin tener que cerrar y reabrir archivos.
- Cada pestaña debe mantener su propia sesión aislada:
  1. Sus propios bytes del PDF (`pdfBytes`) y documento de renderizado (`pdfDoc`).
  2. Su propia escala, rotación, página activa y dimensiones de página.
  3. Su propio conjunto de marcas de revisión (`markups`) y estado de selección.
  4. Su propia pila de historial independiente de 50 pasos de deshacer/rehacer (`undoStack` y `redoStack`), de modo que pulsar `Ctrl+Z` en el Plano A nunca revierta una cota dibujada en el Plano B.
  5. Sus propias calibraciones de escala (`calibrations`) y regiones de escala múltiple (`viewports`).
  6. Sus propios archivos adjuntos y capas ocultas.
  7. Su propio estado sucio (`isDirty`) para saber qué documentos tienen cambios pendientes de guardar.

Hasta ahora, REA solo permitía tener un único documento cargado en memoria (`useDocumentStore`), y la pestaña superior en `App.tsx` era un elemento puramente cosmético que mostraba el nombre del único archivo activo.

---

## Decisiones Técnicas

### 1. Modelo de Sesión por Pestaña (`DocumentTabSession`)
Se define en `src/store/useDocumentTabsStore.ts`:
```ts
export interface DocumentTabSession {
  id: string; // Identificador único (tab-xyz)
  filePath: string | null;
  fileName: string;
  pdfBytes: Uint8Array;
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  numPages: number;
  currentPageIndex: number;
  scale: number;
  rotation: number;
  pageDimensions: Record<number, PageDimension>;
  pageHasText: Record<number, boolean>;
  customColumns?: BbxCustomColumn[];
  importedAnnotationIds: string[];
  markups: Markup[];
  selectedMarkupIds: string[];
  isDirty: boolean;
  calibrations: Record<number, PageCalibration>;
  viewports: Record<number, MeasurementViewport[]>;
  attachments: Record<string, AttachmentEntry>;
  hiddenLayers: string[];
  historyStacks: {
    undoStack: Command[];
    redoStack: Command[];
  };
}
```

### 2. Gestor Centralizado de Pestañas (`useDocumentTabsStore`)
Para evitar refactorizaciones masivas en todos los componentes del visor (`PdfViewer`, `MarkupsList`, `MeasurementsPanel`, `StatusBar`, etc.) que dependen de `useDocumentStore`, `useMarkupStore` y `useCalibrationStore`, `useDocumentTabsStore` actúa como un **orquestador de sesiones de nivel superior**:
- **Conmutación atómica (`switchTab(tabId)`):**
  1. Si hay una pestaña activa, captura su estado actual completo desde los stores activos (`captureActiveSession()`) y lo almacena en la entrada correspondiente de `tabs`.
  2. Actualiza `activeTabId = tabId`.
  3. Restaura la sesión de la pestaña destino (`restoreSession(targetTab)`) volcando sus valores a `useDocumentStore`, `useMarkupStore`, `useCalibrationStore`, `useAttachmentStore`, `useUiStore` y a la instancia `markupHistory`.
- **Apertura de documento (`openDocumentInTab`):**
  - Si el documento actual está vacío (sin bytes ni archivo cargado), la primera pestaña adopta la sesión.
  - Si ya existe un documento cargado, captura la sesión previa, añade una nueva pestaña y la activa inmediatamente.
- **Cierre de pestaña (`closeTab(tabId)`):**
  - Si la pestaña cerrada era la activa, conmuta a la pestaña adyacente.
  - Si era la última pestaña abierta, resetea todos los stores al estado inicial en blanco.
- **Reordenación de pestañas (`reorderTabs(fromIndex, toIndex)`):** Permite organizar las pestañas en la barra superior.

### 3. Independencia de la Pila de Deshacer (`HistoryManager`)
Se extienden los métodos de `HistoryManager` en `src/store/history/command.ts`:
- `getStacks()`: extrae las pilas de comandos `undoStack` y `redoStack`.
- `setStacks({ undoStack, redoStack })`: restaura las pilas para la pestaña activa.
- `clear()`: vacía las pilas de historial.
De este modo, cada pestaña conserva intactos sus 50 pasos de historial sin interferencia cruzada.

### 4. Componente de Barra de Documentos (`DocumentBar.tsx`)
Se crea `src/components/shell/DocumentBar.tsx` sustituyendo al componente estático anterior:
- Muestra la lista de pestañas abiertas con el estilo visual de Revu 21:
  - Fondo `bg-cad-panel` con línea inferior de acento `cad-accent` para la pestaña activa.
  - Fondo `bg-cad-dark` con texto atenuado para pestañas inactivas.
  - Indicador `●` de modificaciones sin guardar (`isDirty`).
  - Botón de cierre `X` en cada pestaña (`size={16}`) con `e.stopPropagation()`.
  - Botón `+` al final de la barra para abrir un nuevo plano (`openPdfDialog()`).

---

## Consecuencias y Verificación

1. **Paridad Total con Revu 21:** Permite trabajar con múltiples planos abiertos simultáneamente en un entorno de escritorio profesional.
2. **Prerrequisito Cumplido para Escenario S4:** El escenario S4 (abrir 3 PDFs simultáneamente y trabajar entre ellos) queda habilitado arquitectónicamente.
3. **Cero Regresiones:** Al delegar en la restauración reactiva de los stores existentes, todas las herramientas de medición, marcado, zoom, selección y paneles continúan operando sin modificaciones.
4. **Presupuesto del Bundle:** Utiliza primitivos ligeros de React y Zustand sin librerías externas pesadas, manteniéndose cómodamente bajo el límite de $\le 800.00$ kB.
