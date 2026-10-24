# ADR-0135: Modo Reuse Tools para creación consecutiva o única de marcas

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

En Bluebeam Revu existe el modo **Reuse** (configurable en barra de estado y menú Tools):
- Cuando **Reuse** está activo (`true`), al terminar de colocar o trazar un markup (rectángulo, nube, cota, polígono, texto, etc.), la herramienta permanece activa para seguir colocando marcas consecutivas de forma ágil sin tener que pulsar nuevamente el botón de la cinta.
- Cuando **Reuse** está inactivo (`false`), al terminar de colocar un markup, la herramienta activa revierte automáticamente a `select` (puntero de selección), permitiendo inspeccionar o mover la marca recién dibujada de inmediato.

En REA, el comportamiento previo mantenía siempre la herramienta activa indefinidamente, lo cual obligaba a presionar Escape o seleccionar la flecha manualmente tras colocar una sola anotación.

## 2. Decisión

1. **Estado en `useUiStore`:**
   - Se añade `reuseTools: boolean`, persistido en `localStorage` bajo la clave `'rea-reuse-tools'`.
   - Valor por defecto: `true` (mantiene compatibilidad total con el flujo de trabajo existente de REA y los 1 422 tests anteriores).
   - Acciones: `setReuseTools(v: boolean)` y `toggleReuseTools()`.

2. **Puntos de acceso en la UI:**
   - **StatusBar:** Se agrega botón `Reuse` (`data-testid="reuse-tools-toggle"`) junto al indicador de herramienta activa (`StatusBarActiveTool`), con estado visual accesible (`aria-pressed`, token `--cad-accent` / `--cad-accent-contrast` al estar activo).
   - **MenuBar:** En el menú `Tools` (`Herramientas`), se incluye la opción `Reuse` (`data-testid="menu-tools-reuse"`) con checkmark (`✓`) cuando está activo.

3. **Comportamiento en `PdfViewer`:**
   - Al finalizar una marca (manos alzada, interactivos, sellos, redacciones, llamadas, figuras de 2 puntos o polígonos multipunto), la función `checkAutoRevertTool(tool)` evalúa si `reuseTools` es falso.
   - Si `!reuseTools`, revierte a `setActiveTool('select')`.
   - Quedan exentas de revertir herramientas de navegación o selección continua (`'select'`, `'pan'`, `'lasso'`, `'selectText'`, `'count'`, `'sequence'`).

## 3. Pruebas y Verificación

- `src/components/ReuseTools.test.tsx` (9 pruebas):
  - Persistencia en localStorage (`rea-reuse-tools`).
  - Toggle en StatusBar (`data-testid="reuse-tools-toggle"`).
  - Toggle en MenuBar Tools (`data-testid="menu-tools-reuse"`).
  - Reversión automática a `select` tras colocar marca cuando `reuseTools: false`.
  - Permanencia de la herramienta cuando `reuseTools: true`.
  - Exención de auto-reversión para herramientas de navegación/conteo.
- `src/designScale.test.ts`: 100% de cumplimiento con tokens de diseño CAD.
