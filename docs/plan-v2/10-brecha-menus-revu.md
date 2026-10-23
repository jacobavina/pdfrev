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
| Tools | Sketch to Scale, atajo Shift+H del hipervínculo, Reuse |
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
- **Full-Screen Crosshair** (Snap to Markup ya existe con Ctrl+Shift+F7).
- **Sketch to Scale:** dibujar formas con cota o escala fija.

### Oleada 2: documento
  **Replace Pages**, **Split Document**, **Insert desde archivo** y edición de **Page Labels**.

### Oleada 3: ventana y paneles
- Full Screen (F11), Hide Panels (Shift+F4), Always On Top.
- Paneles propios de Forms y Signatures (Links, Flags, Spaces y Sets ya están: ADR-0116 a ADR-0119).
- Atajo **Shift+H** del hipervínculo.

### Oleada 4: proceso por lotes y avanzados
- **Batch:** Flatten, Summary, Headers & Footers, OCR y Rotate sobre varios archivos con informe.
- **Slip Sheet:** reemplazar láminas antiguas por las nuevas conservando las marcas.
- **Reduce File Size**, **Security** (ya documentada como pendiente, ver ADR-0099) y **Reuse**.

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
