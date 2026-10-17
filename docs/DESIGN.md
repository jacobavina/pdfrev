# Sistema visual de REA

Fuente única del aspecto de la interfaz (ADR-0044, ADR-0062, ADR-0064 y ADR-0065). Los valores viven en
`src/index.css` (tokens) y `tailwind.config.js` (escala de Tailwind). Los componentes solo usan tokens: lo vigilan
`src/designScale.test.ts` y `src/components/shell/Redesign.test.tsx`. Si algo de este documento cambia, cambia
también su prueba.

Carácter: herramienta técnica de CAD. Sobria, densa y con jerarquía clara. Lo más luminoso es la hoja, y hay un solo
color de acento.

**Nunca:**
- gradientes decorativos;
- tarjetas anidadas;
- easing con rebote;
- sombras decorativas;
- colores literales en componentes.

## 1. Color

Cada token es un triplete RGB (`--name: r g b`). Se usa como `rgb(var(--name))` o `rgb(var(--name) / alfa)`, en CSS
o en Tailwind (`bg-cad-panel`, `text-gray-400`…). Los tokens `cad-*` y `gray-*` cambian con el tema
(`[data-theme='dark']`); los `ov-*` no, porque se dibujan sobre la hoja blanca.

| Token | Rol |
|---|---|
| `--cad-dark` | Fondo de la ventana y banda de documentos (separa la pestaña del documento de la cinta) |
| `--cad-panel`, `--cad-ribbon` | Paneles, cinta, menús y popovers |
| `--cad-subtle` | Cabeceras de panel |
| `--cad-field`, `--cad-field-hover` | Campos de formulario |
| `--cad-hover` | Hover y estado "activo/pulsado" neutro (herramienta activa, interruptores, riel) |
| `--cad-border` | Bordes de 1 px (nivel 2 de elevación) |
| `--cad-canvas` | Mantel bajo la hoja: siempre más oscuro que los paneles |
| `--cad-strong` | Texto e iconos fuertes; fondo del botón principal |
| `--gray-200` … `--gray-600` | Texto: 200 normal, 300/400 secundario, 500 atenuado (≥ 4.5:1 sobre todos los fondos) |
| `--cad-accent` | **Acento**: solo selección, foco, pestaña activa y marca (≥ 4.5:1 como texto) |
| `--cad-accent-fill` | Acento sólido bajo texto blanco (≥ 4.5:1): selección resaltada y logo |
| `--cad-sheet-shadow` | Sombra de la hoja |
| `--ov-*` | Overlay de edición sobre la hoja: tiradores (`ov-handle`, `ov-count`), avisos (`ov-warn`), vistas previas (`ov-preview`), búsqueda (`ov-find*`), snap (`ov-snap`), halo blanco (`ov-halo`) |

**Reglas del acento:**
- **Sí:** fila, página, sello u opción seleccionados; la marca ✓ de lo elegido; el rectángulo y los tiradores de
  selección; el anillo de foco; la pestaña activa (subrayado o barra lateral del riel); el logo.
- **No:** herramienta activa, interruptores pulsados, botón principal, hover de menús, avisos. Todos ellos usan
  `--cad-hover` + `--cad-strong`.

**Colores del documento:** los que se escriben en las marcas y acaban en el PDF (paleta de línea, color por defecto,
adjuntos, enlaces, sellos) no son tema. Viven en `src/core/markup/palette.ts`.

## 2. Tipografía

- **Interfaz:** IBM Plex Sans 400/500/600 (`--font-ui`, Tailwind `font-sans`).
- **Datos:** IBM Plex Mono 400/500 (`--font-data`, clase `ui-data`, con cifras tabulares). Solo para coordenadas,
  medidas, escalas, zoom, IDs y cifras de tabla. Los atajos de teclado y el texto normal van en Plex Sans.
- Las fuentes están vendorizadas en `src/assets/fonts`, con `font-display: swap`, sin red. Su licencia OFL-1.1 y los
  SHA-256 están en `ATTRIBUTION.md`.
- **El PDF no usa estas fuentes:** sigue escribiéndose con Helvetica/WinAnsi (y Times/Courier estándar).
- **Escala única:** 11 / 12 / 13 / 14 / 16 px (`--fs-2xs … --fs-lg`; Tailwind `text-2xs`, `text-xs`, `text-sm`,
  `text-base`, `text-lg`). Nada funcional por debajo de 11 px y ningún `text-[Npx]` suelto.

## 3. Espaciado

Escala 4 / 8 / 12 / 16 px en cabeceras de panel, cinta, secciones de estilo y riel. Valores habituales:
- cabecera de panel: 32 px de alto y padding `0 8px 0 12px`;
- grupo de la cinta: `4px 8px 0`;
- sección de estilo: `8px 12px`, con huecos de 8 px.

## 4. Iconos

- Lucide y los propios (`customIcons.tsx`): un único trazo de **1.75** sobre la rejilla de 24 (`svg.lucide`,
  `svg.rea-icon`). Ningún trazo propio dentro de un icono.
- Tamaños fijos: **16** (controles, listas, barra de estado), **18** (herramientas de la cinta), **20** (acciones
  grandes).
- Color: el del texto. Inactivo `gray-400`; hover y activo `cad-strong`. Los iconos no codifican tipos con colores.

## 5. Radios

| Radio | Uso |
|---|---|
| 0 | Herramientas de la cinta (planas, sin tarjeta) |
| 2 px | Subrayado de pestaña |
| 6 px (`rounded-md`) | Campos, botones, popovers y menús |
| 8 px | Riel de paneles |
| `rounded-xl` | Diálogos |
| 999 px | Swatches |

## 6. Elevación

Tres niveles:

| Nivel | Qué | Cómo |
|---|---|---|
| 1, plano | Paneles, cinta, barras | Sin borde ni sombra |
| 2, borde | Separación de regiones, campos, tabla | 1 px de `--cad-border` |
| 3, flotante | Menús, popovers, diálogos, avisos, editor en línea y la hoja sobre el mantel | `shadow-float` (`--shadow-float`); la hoja, `sheet-shadow` |

## 7. Foco

Anillo de 2 px con `--cad-accent`, separado 1 px. Siempre visible: con teclado (`:focus-visible`) y en los campos de
texto, y ninguna utilidad `outline-none` lo apaga.
