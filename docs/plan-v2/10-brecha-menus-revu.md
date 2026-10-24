# Brecha de menús frente a Bluebeam Revu 21

> **Fecha:** 2026-10-21
> **Fuente:** capturas de los menús Edit, View, Document, Batch, Window y Tools de Revu 21 que aportó el usuario, y el
> código de `src/components/shell/MenuBar.tsx`.
> **Criterio del usuario:** "lo que sea paja no lo agregues". Solo entra lo que sirve para revisar planos, medir y
> hacer metrados; lo demás está en la sección 4 con su motivo.

## 1. Resumen

| Menú | Entradas útiles que faltan |
|---|---|
| Edit | Offset, Multiply, Paste in Place, Format Painter, Hide, Lasso, Undo History |
| View | Full-Screen Crosshair, Side-by-Side y Split dentro de View con Synchronize, Always Show Reply Indicators |
| Document | Document Properties, Crop Pages, Number Pages, Headers & Footers, Replace Pages, Split Document, Insert desde archivo, Create Page Labels, Security |
| Batch | Los mismos procesos sobre varios archivos: Flatten, Summary, Headers & Footers, OCR, Crop & Page Setup, Rotate Pages |
| Window | Full Screen (F11), Hide Panels (Shift+F4), Always On Top, paneles Spaces, Links, Sets, Flags, Forms y Signatures |
| Tools | Reuse (pendiente de saber qué hace en la instalación del usuario) |
| File | Print |

## 2. Lo que REA ya tiene, aunque con otro nombre o en otro menú

| Revu | REA |
|---|---|
| Compare Documents | Document ▸ Compare Documents… (ADR-0091) |
| Overlay Pages | Document ▸ Overlay Pages |
| Flatten / Unflatten | File ▸ Export ▸ PDF with Flattened Markups… y Unflatten Markups of This PDF (ADR-0093) |
| Offset (O) y Multiply (Ctrl+M) | Edit ▸ Offset… y Multiply… (ADR-0107) |
| Show Grid y Snap to Grid | View ▸ Show Grid y Snap to Grid (ADR-0106) |
| Paste in Place, Format Painter y Hide | Edit ▸ Paste in Place, Copy Format / Paste Format, Hide / Show Hidden Markups (ADR-0109) |
| Lasso (Shift+O) y Undo History | Select ▸ Lasso y Edit ▸ Undo History… (ADR-0110) |
| Document Properties, Crop Pages, Number Pages | Document ▸ Document Properties…, Crop Pages…, Number Pages… (ADR-0113) |
| Headers & Footers, Replace Pages, Split Document | Document ▸ Headers & Footers…, Replace Pages…, Split Document… (ADR-0114) |
| Print (Ctrl+P) | File ▸ Print… (ADR-0115) |
| Panel Links | View ▸ Panels ▸ Links Panel y pestaña del riel izquierdo (ADR-0116) |
| Flags (Ctrl+Alt+F) | Edit ▸ Flag y panel Flags (ADR-0117) |
| Spaces | Edit ▸ Make Space y panel Spaces (ADR-0118) |
| Sets | View ▸ Panels ▸ Sets Panel, solo escritorio (ADR-0119) |
| Full Screen, Hide Panels, Always On Top | View ▸ Full Screen (F11), Hide Panels (Shift+F4), Always On Top (ADR-0120) |
| Forms | View ▸ Panels ▸ Forms Panel (ADR-0121) |
| Signatures | View ▸ Panels ▸ Signatures Panel (ADR-0122) |
| Insert Pages from File | Document ▸ Insert Pages from File… (ADR-0123) |
| Create Page Labels | Document ▸ Page Labels… (ADR-0124) |
| Batch (Flatten, Number, Rotate, Reduce, Headers & Footers, Summary) | File ▸ Batch… (ADR-0125, ADR-0126) |
| Full-Screen Crosshair | View ▸ Full-Screen Crosshair, Shift+F8 (ADR-0127) |
| Atajo del hipervínculo | Ctrl+K (ADR-0131) |
| Sketch to Scale | Edit ▸ Sketch to Scale… (ADR-0128) |
| Slip Sheet | Document ▸ Slip Sheet… (ADR-0129) |
| Reduce File Size | Document ▸ Reduce File Size… (ADR-0126) |
| Snapshot (G) | Edit ▸ Snapshot |
| Rotate Pages, Delete Pages, Extract Pages | Document ▸ Rotate Page 90°, Delete Page, Extract Page… (de una en una) |
| Combine | File ▸ Combine Files… |
| Side-by-Side | Document ▸ Side by Side |
| Select All | Edit ▸ Select All on Page |
| Dark Mode | View ▸ Dark Mode |
| Hyperlink, File Attachment, Form, Signature | Tools ▸ las mismas entradas |
| Panel Tool Chest, Markups, Measurements, Properties, Thumbnails, Bookmarks, Layers, Search | Riel y panel izquierdo |

## 3. Plan por oleadas

### Oleada 1: edición y dibujo (la más usada)
- Full-Screen Crosshair ya está (ADR-0127); Snap to Markup existe con Ctrl+Shift+F7.
- Sketch to Scale ya está (ADR-0128).

### Oleada 2: documento
  Replace Pages, Split Document, Insert desde archivo y Page Labels ya están: ADR-0114, ADR-0123 y ADR-0124.

### Oleada 3: ventana y paneles
- Los seis paneles (Links, Flags, Spaces, Sets, Forms y Signatures) ya están: ADR-0116 a ADR-0122.
- Atajo del hipervínculo ya está como Ctrl+K (ADR-0131): el Shift+H de Revu es aquí el resaltado de texto.

### Oleada 4: proceso por lotes y avanzados
- **Batch:** Flatten, Number pages y Rotate sobre varios archivos con informe ya están (ADR-0125); Reduce y Headers & Footers también son operaciones del lote (ADR-0126, ADR-0130); Summary también (ADR-0132); falta OCR (necesita el motor nativo página a página).
- Slip Sheet ya está (ADR-0129).
- **Security** (ya documentada como pendiente, ver ADR-0099) y **Reuse**.

### Ya en curso por petición del usuario
- OCR con la API nativa de Windows, redacción por contenido, importar y exportar `.btx` (el formato quedó
  descifrado: XML con las anotaciones PDF comprimidas).

## 4. Lo que no se añade, y por qué

| Entrada | Motivo |
|---|---|
| WebTab | Navegador dentro de la aplicación |
| Script, JavaScript Console | Automatización propia de Revu |
| Translate Markups | Servicio de traducción externo |
| Color Processing, Archive as PDF/A | Preimpresión y archivo legal, fuera del uso de revisión y metrados |
| Toolbars (personalizar) | Ya tenemos perfiles de interfaz (ADR-0098) |
| Presentation, Dimmer | Uso ocasional |
| Studio, Task Link, 3D Model Tree | Servicios en la nube y formato 3D que están fuera del alcance (SCOPE.md) |
| Auto-Hide Tabs / Panel Access | Variantes de Hide Panels |
| Disable Line Weights | Solo útil para depurar |
