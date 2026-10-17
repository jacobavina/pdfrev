# ADR-0085: Herramienta Instantánea (Snapshot, tecla G), Copia al Portapapeles y Pegado de Marcas de Imagen

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Autor:** Jacob Aviña / Antigravity
- **Hito:** Fase C (Documento, Navegación y Páginas — P5-B.7 / P3-H.4 / C.4)
- **Decisión anterior:** ADR-0084 (Combinar múltiples documentos PDF), ADR-0083 (Pestañas multi-documento con sesiones independientes) y ADR-0081 (Mejoras Revu 21).

---

## Contexto y Necesidad de Producto

En Bluebeam Revu 21, la herramienta **Instantánea** (**Snapshot**, atajo de teclado **`G`**) es una de las funciones más utilizadas en el flujo de trabajo de planos y detalles constructivos:
1. Permite al usuario seleccionar un área rectangular del plano renderizado mediante un recuadro de arrastre (marquee).
2. Captura los píxeles a resolución nativa desde el lienzo del PDF renderizado (`#pdf-render-canvas`).
3. Copia inmediatamente el recorte al portapapeles del sistema operativo como imagen PNG (`image/png`), permitiendo pegarlo tanto en aplicaciones externas (Word, Outlook, Teams, Paint, Slack) como dentro del propio visor de planos con **`Ctrl+V`**.
4. Al pegar en el visor, crea una marca interactiva de tipo `'image'` con posición, redimensionamiento, arrastre, alineación, orden Z y persistencia en el estándar ISO 32000-1 (`/Subtype /Stamp` en escritor incremental y flattened raster en exportación aplanada).
5. Tras capturar la instantánea, el visor revierte automáticamente la herramienta activa a `'select'`, imitando el flujo natural y ergonómico de Revu 21.

---

## Decisiones Técnicas

### 1. Servicio Puro de Instantánea (`snapshotService.ts`)
En `src/services/snapshotService.ts`:
- **`captureCanvasSlice(canvas, rect)`:** Recorta la región rectangular del canvas original respetando la relación de aspecto y dimensiones reales, manejando bordes sin desbordamiento. Incorpora fallback seguro para entornos sin canvas nativo (como jsdom).
- **`dataUrlToBlob(dataUrl)`:** Conversión eficiente y tipada de cadenas `data:image/png;base64,...` a objetos `Blob`.
- **`writeImageToClipboard(blob)`:** Intenta escribir en el portapapeles nativo mediante `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])` capturando excepciones de permisos o navegadores sin soporte.
- **Caché en memoria (`setSnapshotCache`, `getSnapshotCache`, `hasSnapshotInCache`, `clearSnapshotCache`):** Almacena la última captura para permitir pegado inmediato vía `Ctrl+V`, menú contextual o barra de menús aun cuando el portapapeles del sistema bloquee lecturas asíncronas.
- **`executeSnapshot(rect, canvas, onPasteFallback)`:** Orquesta la captura, actualización de caché, copia a clipboard, limpieza del portapapeles vectorial para priorizar la imagen y reversión de la herramienta a `'select'`.
- **`pasteSnapshotImage(targetCenter, imagePayload)`:** Crea una nueva marca de tipo `'image'` proporcional en el centro visible del viewport o posición del cursor, con registro atómico en el historial de deshacer/rehacer (`CommandHistory`).

### 2. Tipo de Marca `'image'` y Soporte en el Motor Gráfico
- **Tipado (`src/types/markup.ts`):** Incorporación de `'image'` a `VALID_MARKUP_TYPES` con `customFields: { imageSrc: string, originalWidth?: number, originalHeight?: number }`.
- **Renderizado SVG (`src/core/markup/render.ts`):**
  ```tsx
  <image
    href={imageSrc}
    x={r.x}
    y={r.y}
    width={r.width}
    height={r.height}
    preserveAspectRatio="none"
    opacity={style.opacity ?? 1}
  />
  ```
- **Hit-testing y Transformaciones (`src/utils/coordinates.ts`, `src/core/markup/transformTools.ts`):** Añadido `'image'` a `CANONICAL_BOX_TYPES` para habilitar selección por clic interior o borde, arrastre de posición, redimensionamiento por 8 tiradores de esquina/lado, volteo horizontal/vertical y alineación automática.

### 3. Persistencia PDF ISO 32000-1 e Interoperabilidad
- **Escritor Incremental (`src/core/pdf/incrementalWriter.ts`):** Mapeo de marcas de tipo `'image'` como anotaciones `/Subtype /Stamp` con su diccionario de propiedades y metadatos `/REA`.
- **Flujo de Apariencia (`src/core/pdf/operators.ts`):** Cálculo de bounding box canónico `/BBox [0 0 w h]` para emisión en streams `/AP /N`.
- **Exportación Aplanada (`src/services/pdfExportService.ts`):** Extracción de bytes de imagen e inserción mediante `pdfDoc.embedPng(...)` / `pdfDoc.embedJpg(...)` y `page.drawImage(...)`.

### 4. Integración en `PdfViewer`, Menús y Atajos de Teclado
- **Atajo `G`:** Listener global que conmuta la herramienta activa a `'snapshot'` (`useToolStore.setActiveTool('snapshot')`).
- **Cursor Crosshair:** La capa de marcado SVG activa `cursor-crosshair` mientras `activeTool === 'snapshot'`.
- **Marquee Visual de Selección:** Rectángulo con borde punteado acentuado (`stroke="var(--cad-accent)" stroke-dasharray="4 3" fill="var(--cad-accent)" fill-opacity="0.15"`).
- **Destello de Confirmación:** Animación visual de destello blanco semitransparente sobre el área recortada tras soltar el botón del ratón.
- **Desacoplamiento de Portapapeles:** `useMarkupStore` registra `registerPasteFallback(pasteSnapshotImage)` para que `pasteMarkups()` ejecute el pegado de imagen de forma transparente cuando no hay marcas vectoriales en el portapapeles, unificando `Ctrl+V`, **Edit ▸ Paste** y menú contextual.

---

## Consecuencias y Verificación

1. **Paridad Alcanzada:** REA cuenta con la herramienta Snapshot (`G`) idéntica en comportamiento y atajo a Bluebeam Revu 21.
2. **Preservación del Bundle:** Sin dependencias externas pesadas, uso de APIs de canvas nativas y `Blob`, manteniendo el bundle estrictamente bajo el límite de 800 kB.
3. **Pruebas Automatizadas:**
   - 8 pruebas unitarias en `src/services/snapshotService.test.ts`.
   - 4 pruebas de integración en `src/components/SnapshotFlow.test.tsx`.
   - Pruebas de renderizado SVG, transformaciones y bounding box en `render.test.ts`, `transformTools.test.ts` y `coordinates.test.ts`.
