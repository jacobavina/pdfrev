# ADR-0016: Búsqueda Textual con Resaltado y Operaciones de Página en Documentos PDF

- **Estado:** Aceptado
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA
- **Relacionado con:** [ADR-0002](./ADR-0002-normalized-coordinates-and-viewport-rotation.md), [ADR-0003](./ADR-0003-bbx-persistence-format-versioning.md), [ADR-0011](./ADR-0011-motor-pdf.md), [ADR-0013](./ADR-0013-pdf-interoperability-and-incremental-update.md), [ADR-0015](./ADR-0015-takeoff-measurements-and-calibration.md), [08-plan-orquestador.md](#)

---

## 1. Contexto

En el flujo de trabajo de planos de arquitectura, ingeniería y construcción (AEC) con Bluebeam Revu, dos capacidades complementarias son críticas para la navegación e integridad documental (Paquete 5 del Plan Maestro):

1. **Búsqueda Textual en Planos:**
   - Capacidad de localizar de forma ágil rótulos, especificaciones de materiales, nombres de ejes, cotas y notas técnicas.
   - Requisitos indispensables:
     - Motor puro de coincidencia sobre los `TextItem` extraídos por el worker de PDF.js sin degradar la tasa de cuadros del hilo principal.
     - Soporte para distinción de mayúsculas/minúsculas (`caseSensitive`) y palabras completas (`matchWholeWord`).
     - Indexación global multidocumento con coordenadas rectangulares normalizadas $[0, 1]$ proyectadas sobre el espacio de página.
     - Navegación cíclica (coincidencia siguiente/anterior) con salto automático de página en el visor y foco visual accesible.
     - Resaltado vectorial sobre el visor PDF mediante capa SVG no destructiva, diferenciando visualmente la coincidencia activa del resto de coincidencias.
     - Atajo de teclado estándar `Ctrl+F` / `Meta+F` y botón accesible en la barra de herramientas principal (`TopBar`).

2. **Operaciones de Gestión de Páginas PDF:**
   - Manipulación estructural de páginas dentro del documento abierto:
     - **Rotación de página (`rotatePdfPage`):** Girar páginas individuales o todas en incrementos de 90° o 180° en sentido horario, manteniendo sincronizado el visor y la orientación nativa PDF.
     - **Eliminación de página (`deletePdfPage`):** Borrar páginas obsoletas o páginas en blanco con guarda dura contra la eliminación de la última página (un documento debe mantener al menos 1 página).
     - **Inserción de página en blanco (`insertBlankPdfPage`):** Insertar páginas en blanco con dimensiones coincidentes con la página actual o formato estándar (612 × 792 pt).
     - **Extracción de página (`extractPdfPage`):** Extraer una página seleccionada a un archivo PDF independiente guardado en disco a través del servicio de exportación.
   - **Remapeo Determinista e Inmutable de Marcas y Calibraciones:**
     - Al borrar una página $P$, todas las marcas situadas en la página $P$ deben descartarse, mientras que las marcas de páginas posteriores $Q > P$ deben reindexarse a $Q - 1$.
     - Al insertar una página en $P$, las marcas en páginas $Q \ge P$ deben reindexarse a $Q + 1$.
     - El mapa de calibraciones por página (`PageCalibration`) debe sufrir idéntica transformación sin mutación de objetos.

3. **Restricción de Rendimiento y Presupuesto de Bundle (< 800 kB):**
   - La inclusión de librerías de manipulación PDF de bajo nivel (`pdf-lib`, ~450 kB) en el árbol de importaciones estáticas de componentes de UI comunes (como `ThumbnailsSidebar` o `TopBar`) provoca que el chunk principal `index-*.js` supere con creces el límite de 800 kB estipulado en las reglas del proyecto (`AGENTS.md` y `scripts/verify.mjs`), alcanzando más de 1,170 kB.
   - Es necesario diseñar una arquitectura de división de código (*code-splitting*) con importaciones dinámicas (`await import(...)`) para garantizar que `pdf-lib` resida exclusivamente en su propio chunk asíncrono.

---

## 2. Decisiones de Diseño

### 2.1 Motor Puro de Búsqueda Textual (`src/core/search/textSearch.ts`)
- Se implementan funciones puras desacopladas de componentes React:
  - `findMatchesInPageItems(items, query, options, pageIndex, pageDimsPt)`:
    - Normalización de cadenas y evaluación por expresiones regulares o `indexOf`.
    - Cálculo de cajas delimitadoras en coordenadas normalizadas $[0, 1]$ a partir de las matrices de transformación `transform` de PDF.js (`[scaleX, skewY, skewX, scaleY, tx, ty]`) y ancho reportado del `TextItem`.
    - Soporte estricto de opciones `{ caseSensitive, matchWholeWord }`.
  - `calculateTextItemRect(item, pageDimsPt)`: Proyección de coordenadas cartesianas PDF (origen inferior izquierdo) a espacio de visualización normalizado (origen superior izquierdo).
  - `indexGlobalMatches(matchesByPage)`: Indexación plana determinista con identificadores únicos `match-${pageIndex}-${index}`.

### 2.2 Store de Búsqueda Zustand (`src/store/useSearchStore.ts`)
- Estado global reactivo para la barra de búsqueda:
  ```ts
  interface SearchState {
    query: string;
    isOpen: boolean;
    caseSensitive: boolean;
    matchWholeWord: boolean;
    matches: SearchMatch[];
    activeMatchIndex: number;
    isSearching: boolean;
    setQuery: (query: string) => void;
    setIsOpen: (isOpen: boolean) => void;
    setCaseSensitive: (value: boolean) => void;
    setMatchWholeWord: (value: boolean) => void;
    setMatches: (matches: SearchMatch[]) => void;
    nextMatch: () => void;
    prevMatch: () => void;
    clearSearch: () => void;
  }
  ```
- Navegación circular (`(active + 1) % total` y `(active - 1 + total) % total`).
- Limpieza automática al cerrar la barra o cambiar de documento.

### 2.3 Componente Barra de Búsqueda (`src/components/SearchBar.tsx`) y Resaltado SVG
- Componente flotante accesible con atributos `role="search"`, `data-testid="search-bar"`, input `search-input`, contador `search-count`, botones de navegación `search-prev-btn`, `search-next-btn`, y toggles accesibles `search-case-sensitive-toggle`, `search-whole-word-toggle`.
- Sincronización automática de página: al cambiar de coincidencia activa, si la coincidencia pertenece a otra página, se invoca `setCurrentPageIndex` en `useDocumentStore` para saltar de inmediato a dicha página.
- En `PdfViewer.tsx`, se renderiza una capa SVG `<g className="search-highlights-layer">`:
  - Coincidencias inactivas: `<rect data-testid="search-match-highlight" fill="#ffff00" opacity="0.35" />`.
  - Coincidencia activa: `<rect data-testid="search-active-highlight" fill="#ff9900" opacity="0.65" stroke="#cc5500" strokeWidth="1.5" />`.

### 2.4 Motor Puro de Operaciones de Página (`src/core/pages/pageOperations.ts`)
- Operaciones sobre el buffer binario del PDF mediante carga diferida de `pdf-lib`:
  - `rotatePdfPage(pdfBytes, pageIndex, degrees)`: Ajuste modular de rotación `(currentRotation + degrees) % 360` sobre la página objetivo.
  - `deletePdfPage(pdfBytes, pageIndex)`: Verificación de guarda `pageCount > 1` (lanza error informativo si se intenta borrar la única página) y remoción atómica.
  - `insertBlankPdfPage(pdfBytes, atIndex, dimensions)`: Inserción de página en blanco tomando las dimensiones de la página previa o tamaño estándar (612 × 792 pt).
  - `extractPdfPage(pdfBytes, pageIndex)`: Creación de un nuevo documento PDF que copia y contiene exclusivamente la página extraída.
- Remapeo determinista e inmutable:
  - `remapMarkupsOnPageDeletion(markups, deletedPageIndex)`: descarta marcas con `pageIndex === deletedPageIndex` y decrementa en 1 las marcas con `pageIndex > deletedPageIndex`.
  - `remapMarkupsOnPageInsertion(markups, insertedAtIndex)`: incrementa en 1 las marcas con `pageIndex >= insertedAtIndex`.
  - `remapCalibrationsOnPageDeletion(calibrations, deletedPageIndex)` y `remapCalibrationsOnPageInsertion(calibrations, insertedAtIndex)`: reconstruyen el diccionario `{ [pageIndex]: PageCalibration }` reindexando las claves numéricas.

### 2.5 Servicio de Gestión de Páginas (`src/services/pageService.ts`)
- Orquesta las transformaciones de bajo nivel con la recarga en los almacenes Zustand:
  - Invoca las operaciones de `pageOperations.ts`.
  - Actualiza el documento binario cargado en `useDocumentStore` (`loadDocument`).
  - Aplica el remapeo de marcas en `useMarkupStore` y calibraciones en `useCalibrationStore`.
  - Notifica al usuario vía `toastService.info` o `toastService.success`.
  - Ofrece manejo controlado de errores con `toastService.error`.

### 2.6 Optimización de Empaquetado y Presupuesto de Bundle
- Para impedir la inflada del bundle principal por encima de 800 kB:
  - Se utiliza `const { PDFDocument } = await import('pdf-lib');` dentro de las funciones de `pageOperations.ts`.
  - En `pageService.ts`, el servicio de exportación (`exportService`) se importa dinámicamente durante `executeExtractPage`.
  - En `ThumbnailsSidebar.tsx`, las acciones de rotar, insertar, extraer y eliminar cargan dinámicamente `pageService` (`const { pageService } = await import('../services/pageService');`).
- **Resultado:**
  - Tamaño del chunk principal `dist/assets/index-*.js`: **709.83 kB**, holgadamente por debajo del límite estricto de 800 kB.

---

## 3. Consecuencias y Verificación

1. **Robustez y Fidelidad:**
   - Toda manipulación de páginas produce un PDF binario válido que se recarga limpiamente en PDF.js y en los visores estándar.
   - Las marcas preexistentes y calibraciones de escala conservan su asociación exacta con las páginas que les corresponden.
2. **Cobertura de Pruebas:**
   - 8 tests unitarios de búsqueda en `src/core/search/textSearch.test.ts`.
   - 5 tests unitarios del store de búsqueda en `src/store/useSearchStore.test.ts`.
   - 5 tests de integración en `src/components/SearchBar.test.tsx`.
   - 2 tests de integración en `src/components/PdfViewerSearch.test.tsx`.
   - 11 tests unitarios de operaciones de página y remapeo en `src/core/pages/pageOperations.test.ts`.
   - 5 tests del servicio en `src/services/pageService.test.ts`.
   - 2 tests de integración en `src/components/ThumbnailsSidebar.test.tsx`.
   - **Total de pruebas del proyecto:** 476 tests en 42 suites pasando al 100%.
3. **Verificación de Calidad:**
   - `node scripts/verify.mjs` supera los 5 pasos sin errores (Vitest, Paridad, TSC, Bundle y Rust).
