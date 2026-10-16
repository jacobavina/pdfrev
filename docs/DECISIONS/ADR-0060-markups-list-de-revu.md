# ADR-0060: Markups List como la de Revu (abre cerrada, columnas y grupos por Subject)

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0017 (lista de marcas), ADR-0044 (rediseño) y ADR-0052 (Alt+L)

## 1. Contexto

El usuario mostró la lista de marcas de Revu:
- **Grupos por Subject:** "Cloud+ (1)", "Count Measurement (1)", "Dimension (1)".
- **Columnas de Revu:** Subject, Page Label, Comments, Author, Date, Status, Color, Layer…
- **Menú "Markups List ▾":** contiene Columns, Markups y Capture. Columns lista unas 35 columnas que se marcan o desmarcan,
  más Select All y Manage Columns….
- **Al arrancar:** la lista abre cerrada. Cerrada, solo queda su icono en la barra inferior.

REA mostraba la lista siempre abierta, con columnas fijas (Type, Comment, Author, Date, Page, Status, Measurement, Unit) y
sin grupos.

## 2. Decisión

1. **Abierta o cerrada (`useUiStore.markupsListOpen`):**
   - Abre cerrada. Cerrada no ocupa sitio: el panel lleva `hidden` y la clase `hidden`, porque Tailwind `flex` anularía
     el atributo.
   - Se abre y se cierra con el botón `markups-list-toggle` de la barra de estado, Alt+L, View ▸ Markups List, o
     "Hide Markups List" del menú y el botón `markups-list-hide`.
   - View ▸ Open Markups List at Start (`rea-markups-list-at-start`) la abre al arrancar.
   - Una vez abierta, queda montada (oculta al cerrarla) para conservar filtros y orden.
2. **Columnas (`src/core/markup/markupColumns.ts`, puro):**
   - Solo las columnas de Revu para las que REA tiene el dato, en el orden de Revu: Subject, Page Label, Comments, Page
     Index, Lock, Author, Date (modificación), Creation Date, Length, Area, Volume, Count, Measurement, Label, Depth,
     Status, Color, Layer y Unit.
   - Visibles por defecto: las de Revu (Subject, Page Label, Comments, Author, Date, Status, Color, Layer), más
     Measurement y Unit para el takeoff.
   - Las elegidas se recuerdan (`rea-markups-columns`).
   - La tabla dibuja cabeceras y celdas a partir de esa lista. Comments y Status siguen siendo editables; Color muestra
     una muestra del color de la línea.
3. **Menú "Markups List ▾"** (el primer botón del panel):
   - **Columns ▸**, con su marca de visibilidad, Select All y Manage Columns…. Este último abre el diálogo de columnas
     personalizadas.
   - **Group by Subject.**
   - **Hide Markups List.**
   - Se abre hacia arriba, porque la lista está al pie de la ventana; el submenú tiene altura máxima con desplazamiento.
   - Se monta en `<body>` con posición fija, como los desplegables de la cinta. Corrección del 2026-10-16: dentro del
     panel, las reglas lo tapaban junto con sus marcas de visibilidad.
4. **Grupos por Subject:**
   - Activos por defecto (`rea-markups-group`).
   - Una fila de cabecera por tipo, "Subject (n)", en orden alfabético (al revés si se ordena por Subject descendente),
     plegable con un clic.
   - Dentro de cada grupo se mantiene el orden elegido.
5. **Pruebas E2E:** el script inicial abre la lista y apaga los grupos, porque las pruebas buscan filas por texto y la
   cabecera "Area (1)" contaría doble. Es el mismo criterio que con `rea-auto-panels`. Una prueba propia cubre la lista
   de Revu: cerrada, grupos, columnas y Alt+L.

**Fuera de alcance:**
- las columnas sin dato en REA: X/Y, Document Width/Height, Wall Area, Sequence, Capture, Legend, Rise/Drop, Slope,
  Space, 3D View, GoCanvas;
- los submenús Markups y Capture de Revu.

## 3. Verificación

- `src/core/markup/markupColumns.test.ts`:
  - `ofrece las columnas de Revu, con las de Revu visibles por defecto, y recuerda las elegidas en su orden`
  - `agrupa por Subject en orden alfabético y el texto de cada columna sale de la marca`
- `src/components/MarkupsList.test.tsx`: `el menú Markups List muestra y oculta columnas de Revu y la lista agrupa por Subject con grupos plegables (ADR-0060)`
- `tests/e2e/pdf-viewer.spec.ts`: `Markups List de Revu: abre cerrada, agrupa por Subject, elige columnas y Alt+L la cierra (ADR-0060)`
- Revisado en la vista previa del navegador:
  - arranca cerrada;
  - el botón de la barra la abre con el grupo "Rectangle (1)";
  - el submenú Columns ya no queda bajo la cinta.
