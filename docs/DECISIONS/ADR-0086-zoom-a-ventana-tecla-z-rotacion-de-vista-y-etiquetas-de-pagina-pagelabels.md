# ADR-0086: Zoom a Ventana (tecla Z), Rotación de Vista 90° y Etiquetas de Página (/PageLabels)

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Autor:** Jacob Aviña / Antigravity
- **Hito:** Fase C (Documento, Navegación y Páginas — P5-B.6 / C.5)
- **Decisión anterior:** ADR-0085 (Herramienta Instantánea, tecla G y marcas de imagen) y ADR-0083 (Pestañas multi-documento).

---

## Contexto y Necesidad de Producto

En Bluebeam Revu 21, la navegación ágil sobre planos arquitectónicos y de ingeniería de gran formato (Arch D/E, A0/A1) depende fundamentalmente de tres capacidades clave:
1. **Herramienta Zoom a Ventana (Zoom Window, atajo `Z`):** Permite encuadrar con precisión milimétrica cualquier detalle constructivo dibujando un rectángulo de arrastre (marquee). Tras soltar el ratón, el visor calcula la escala óptima para que el área quepa en la ventana y recentra la vista exactamente en la selección, revirtiendo la herramienta a `'select'` para continuar editando. Un clic simple (< 5 px) sin arrastre realiza un zoom rápido de 1.5x centrado en el cursor.
2. **Rotación de Vista en 90° (`Ctrl+Shift++` y `Ctrl+Shift+-`):** Permite al proyectista girar temporalmente el plano a 90°, 180° o 270° en el visor para leer notas o detalles horizontales o verticales sin alterar el contenido ni las coordenadas reales del archivo PDF en disco (a diferencia de la rotación destructiva de páginas `Ctrl+Shift+R`).
3. **Etiquetas de Página (`/PageLabels` en ISO 32000-1 §12.4.2):** Los planos de edificación y proyectos de ingeniería casi nunca se numeran como "1, 2, 3...", sino con prefijos y códigos de disciplina ("Portada", "i", "ii", "A-101", "A-102", "S-01", "M-01"). Revu 21 lee el diccionario `/PageLabels` del catálogo del PDF y muestra la etiqueta oficial en la barra lateral de miniaturas y en el indicador de navegación.

---

## Decisiones Técnicas

### 1. Herramienta Zoom a Ventana (`'zoom'`, Atajo `Z`)
- **Estado de Herramienta (`src/store/useToolStore.ts`):** Incorporación de `'zoom'` a `ToolType` con atajo `Z` en barra de menús (**View ▸ Zoom Window**) y barra de herramientas Ribbon (grupo `select`).
- **Cursor Ergonómico:** Se activa la clase `cursor-zoom-in` en el overlay SVG interactivo mientras `activeTool === 'zoom'`.
- **Previsualización de Marquee:** Durante el arrastre con `activeTool === 'zoom'`, se dibuja `<rect data-testid="zoom-marquee" ... />` con contorno discontinuo de acento CAD (`tok('cad-accent')`, `strokeDasharray="4 3"`).
- **Cálculo de Escala y Recentrado:**
  - Se calcula el ancho y alto del rectángulo seleccionado en píxeles de pantalla.
  - Se determina el factor de escala `factor = Math.min(availW / boxW, availH / boxH)` acotado entre 0.1x y 5.0x.
  - Se proyecta el centro de la selección sobre la superficie de scroll del contenedor mediante `zoomAnchorRef.current = { rx, ry, px: el.clientWidth / 2, py: el.clientHeight / 2 }`, recentrando la vista de forma suave y exacta.
  - Al hacer clic simple sin arrastre (< 5 px), ejecuta `zoomAtClientPoint(clientX, clientY, 1.5)`.
  - Reversión automática a `'select'` tras completar la acción (o pulsando `Escape`).

### 2. Rotación de Vista 90° (`rotateClockwise`, `rotateCounterClockwise`)
- **Store de Documento (`src/store/useDocumentStore.ts`):**
  - `rotateClockwise()`: incrementa la rotación en 90° módulo 360° (0° -> 90° -> 180° -> 270° -> 0°).
  - `rotateCounterClockwise()`: decrementa la rotación en 90° módulo 360° (0° -> 270° -> 180° -> 90° -> 0°).
  - `resetRotation()`: restablece la rotación a 0°.
- **Atajos de Teclado y Menú (`src/components/shell/MenuBar.tsx`, `src/components/PdfViewer.tsx`):**
  - **View ▸ Rotate View Clockwise** (`Ctrl+Shift++`).
  - **View ▸ Rotate View Counterclockwise** (`Ctrl+Shift+-`).
  - Iconos Lucide `RotateCw` y `RotateCcw` dimensionados estrictamente a 16 px.

### 3. Parseo y Visualización de `/PageLabels` (ISO 32000-1 §12.4.2)
- **Módulo Puro (`src/core/pdf/pageLabels.ts`):**
  - Soporte de estilos de numeración estándar:
    - `/D`: Decimal arábigo (1, 2, 3...)
    - `/R`: Romano mayúscula (I, II, III...)
    - `/r`: Romano minúscula (i, ii, iii...)
    - `/A`: Alfabético mayúscula (A, B, C... AA, AB...)
    - `/a`: Alfabético minúscula (a, b, c... aa, ab...)
  - Prefijos arbitrarios (`/P (A-)` -> "A-101").
  - Extracción directa desde PDF.js (`pdfDoc.getPageLabels()`) con respaldo de parseo binario mediante importación dinámica de `pdf-lib` para entornos sin PDF.js o headless.
- **Integración en Pestañas y Estado:**
  - `pageLabels: Record<number, string> | null` almacenado en `useDocumentStore` y capturado en las sesiones de pestañas (`DocumentTabSession.pageLabels` en `useDocumentTabsStore.ts`).
  - Barra lateral de miniaturas (`src/components/ThumbnailsSidebar.tsx`): muestra `data-testid="page-label-{pageIndex}"` con `"Page N (Label)"`.
  - Barra de estado (`src/components/shell/StatusBar.tsx`): muestra `"N (Label) / Total"`.

---

## Verificación y Calidad

- **Pruebas Unitarias de `/PageLabels` (`src/core/pdf/pageLabels.test.ts`):** 13 pruebas unitarias exhaustivas que verifican números romanos, alfabéticos, prefijos compuestos, rangos numéricos y extracción desde bytes de PDF.
- **Pruebas de Miniaturas (`src/components/ThumbnailsSidebar.test.tsx`):** 5 pruebas de integración que verifican la visualización de etiquetas de plano en las tarjetas de página.
- **Pruebas de Zoom a Ventana y Rotación (`src/components/ZoomWindowAndRotation.test.tsx`):** 6 pruebas de integración que validan atajo Z, cursor de lupa, marquee de encuadre, zoom 1.5x por clic simple, cancelación con Escape y rotación de vista horaria/antihoraria por atajos de teclado.
- **Diseño y Presupuesto de Bundle:** Cumplimiento estricto de tokens de color, iconos de 16 px en menús y 18 px en Ribbon, y presupuesto de bundle de producción por debajo de 800 kB.
