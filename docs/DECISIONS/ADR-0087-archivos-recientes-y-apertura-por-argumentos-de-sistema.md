# ADR-0087: Archivos Recientes en Menú y Pantalla Inicial, Apertura por Argumentos de Sistema ("Abrir con") y Cierre de Fase C

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Autor:** Jacob Aviña / Antigravity
- **Hito:** Fase C (Documento, Navegación y Páginas — P5-C.6 / ADR-0087)
- **Decisión anterior:** ADR-0086 (Zoom a Ventana, Rotación de Vista 90° y Etiquetas de Página /PageLabels).

---

## Contexto y Necesidad de Producto

En Bluebeam Revu 21, el flujo de trabajo de apertura de documentos y gestión diaria de proyectos de construcción comprende dos pilares fundamentales de integración con el sistema operativo y ergonomía de usuario:

1. **Historial de Archivos Recientes (Recent Files):**
   - Acceso rápido desde la barra superior de menús (**File ▸ Open Recent**) con listado de los últimos archivos abiertos, indicación de páginas y tooltip con ruta absoluta.
   - Opción para vaciar el historial ("Clear Recent Files") y placeholder deshabilitado cuando no hay elementos ("No Recent Files").
2. **Pantalla Inicial de Bienvenida (Welcome Canvas / Empty State):**
   - Cuando no hay ningún plano abierto (`pdfBytes === null`), se ofrece una superficie CAD con zona interactiva de arrastrar y soltar (Drag & Drop) de archivos PDF, botón primario destacado ("Open PDF…") y acceso directo con 1 clic al historial de planos recientes.
3. **Apertura Nativa por Argumentos de Sistema ("Abrir con" y Línea de Comandos):**
   - Integración nativa a través de Tauri para que cuando el usuario haga doble clic en un PDF en el Explorador de Windows o elija "Abrir con REA", el archivo se cargue inmediatamente en el visor en lugar de la plantilla fixture de prueba.

---

## Decisiones Técnicas

### 1. Servicio Puro de Archivos Recientes (`src/services/recentFilesService.ts`)
- **Estructura de Datos (`RecentFile`):**
  - `path`: Ruta absoluta del archivo PDF.
  - `name`: Nombre base del archivo para visualización limpia.
  - `lastOpened`: Marca temporal ISO 8601.
  - `pageCount`: Número de páginas detectado al abrir el documento.
- **Políticas de Gestión:**
  - Límite estricto de 10 elementos ordenados por apertura más reciente.
  - Deduplicación automática por `path`: abrir un archivo ya existente lo promueve a la primera posición y actualiza `lastOpened` y `pageCount`.
  - Persistencia en `localStorage` bajo la clave `'rea:recent-files'`.
  - Tolerancia total a fallos: ante JSON corrupto o excepciones de cuota/modo incógnito (`QuotaExceededError`), el servicio degrada a caché en memoria sin interrumpir el funcionamiento de la aplicación ni lanzar excepciones no capturadas.
  - Patrón Pub/Sub con `subscribeRecentFiles` para sincronización reactiva en tiempo real entre múltiples componentes (menú, barra de bienvenida, pestañas).

### 2. Menú de Archivos Recientes (`src/components/shell/MenuBar.tsx`)
- Submenú interactivo en **File ▸ Open Recent** identificado con el icono `Clock` (16 px).
- Si no hay archivos recientes: muestra el elemento deshabilitado con `testId="menu-recent-empty"` y texto *"No Recent Files"*.
- Si hay archivos recientes: genera dinámicamente las entradas con `testId="menu-recent-item-{idx}"`, indicando el nombre del plano y su número de páginas (`(N pgs)`), con la ruta absoluta en el atributo `title` para previsualización tooltip al posar el cursor.
- Separador y botón de acción con icono `Trash2` (16 px) para *"Clear Recent Files"* (`testId="menu-clear-recent"`).

### 3. Pantalla Inicial y Zona de Dropzone (`src/components/viewer/WelcomeCanvas.tsx`)
- Componente estético con diseño CAD moderno que sustituye el placeholder estático anterior cuando no hay documento abierto.
- Zona de arrastre y suelta (`welcome-dropzone`) con indicador visual al sobrevolar (`isDragOver`), lectura de `ArrayBuffer` del archivo `.pdf` y carga directa mediante `loadPdfData`.
- Botón primario *"Open PDF…"* (`welcome-open-btn`) que invoca el diálogo nativo del sistema.
- Lista rápida de documentos recientes con iconos `FileText` y botón *"Clear"* para mantenimiento rápido.
- Cumplimiento estricto del sistema de diseño (tokens `bg-cad-panel`, `border-cad-border`, `cad-accent`, `text-cad-strong`, sin colores literales `#hex` ni `rgb`).
- Carga bajo demanda mediante `React.lazy` en `src/components/PdfViewer.tsx` para preservar el presupuesto de bundle $\le 800$ kB.

### 4. Integración Nativa con Tauri (`src-tauri/src/lib.rs` y `src/App.tsx`)
- Comando Tauri expuesto: `get_startup_file_arg() -> Option<String>`.
- Inspecciona los argumentos pasados al ejecutable (`std::env::args()`), filtrando por aquellos con extensión `.pdf` que existan físicamente en el disco.
- En el arranque (`src/App.tsx`), si se detecta un archivo de inicio en entorno Tauri, se invoca `openPdfFromPath(startupFile)` abriendo el documento directamente; de lo contrario, se mantiene el fixture estándar para desarrollo.

---

## Verificación y Calidad

- **Pruebas Unitarias de Servicio (`src/services/recentFilesService.test.ts`):** 5 pruebas que verifican persistencia, límite de 10 elementos, deduplicación, eliminación, limpieza, pub/sub, tolerancia a almacenamiento corrupto y degradación elegante a memoria ante cuota excedida.
- **Pruebas de Integración (`src/components/RecentFilesFlow.test.tsx`):** 9 pruebas que verifican:
  - Apertura del submenú Open Recent y visualización de "No Recent Files" cuando está vacío.
  - Listado de archivos recientes con páginas y tooltip de ruta.
  - Clic en archivo reciente dispara `openPdfFromPath`.
  - Clic en "Clear Recent Files" vacía el historial.
  - Renderizado de `WelcomeCanvas` en lienzo vacío.
  - Botón "Open PDF…" en WelcomeCanvas.
  - Apertura en 1 clic de recientes en WelcomeCanvas.
  - Botón de vaciar recientes en WelcomeCanvas.
  - Drag & drop de archivos PDF en la zona de bienvenida.
- **Pruebas en Rust (`src-tauri`):** 15 pruebas unitarias en Cargo que verifican la seguridad del manejador `get_startup_file_arg` junto a la persistencia atómica.
- **Presupuesto de Bundle:** El bundle principal `index-*.js` se mantiene en 665 kB, muy inferior al umbral estricto de 800 kB.
