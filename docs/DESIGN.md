# Sistema visual de REA

Fuente única del aspecto de la interfaz (ADR-0044, ADR-0062, ADR-0064, ADR-0065, ADR-0066 y ADR-0068). Los valores viven en
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
| `--cad-canvas` | Mantel bajo la hoja: siempre más oscuro que los paneles. En tema claro es un gris NEUTRO: `165 168 171` (ADR-0068, Δcanal ≤ 10; candidatos probados `185 188 191` y `165 168 171`, elegido el segundo por 2.39:1 de contraste hoja-mantel sin teñir la pantalla) |
| `--cad-strong` | Texto e iconos fuertes; fondo del botón principal |
| `--gray-200` … `--gray-600` | Texto: 200 normal, 300/400 secundario, 500 atenuado (≥ 4.5:1 sobre todos los fondos) |
| `--cad-accent` | **Acento**: solo selección, foco, pestaña activa y marca (≥ 4.5:1 como texto) |
| `--cad-accent-fill` | Acento sólido bajo texto blanco (≥ 4.5:1): selección resaltada (la marca ya no usa pastilla, ADR-0068) |
| `--cad-sheet-shadow` | Sombra de la hoja |
| `--icon-highlight`, `--icon-measure`, `--icon-pen` | Acentos semánticos de los iconos (ADR-0066): barra del resaltador, punteado de las mediciones y snap, punta del lápiz. No son estado y no cambian con el tema |
| `--ov-*` | Overlay de edición sobre la hoja: tiradores (`ov-handle`, `ov-count`), avisos (`ov-warn`), vistas previas (`ov-preview`), búsqueda (`ov-find*`), snap (`ov-snap`), rejilla (`ov-grid`), halo blanco (`ov-halo`) |

**Reglas del acento:**
- **Sí:** fila, página, sello u opción seleccionados; la marca ✓ de lo elegido; el rectángulo y los tiradores de
  selección; el anillo de foco; la pestaña activa (subrayado o barra lateral del riel); la R de la marca, como texto en el acento y sin pastilla rellena (ADR-0068).
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

- Lucide y los propios (`customIcons.tsx`): trazo base de **1.75** sobre la rejilla de 24 (`svg.lucide`,
  `svg.rea-icon`). Los propios llevan detalles interiores más finos o más gruesos solo en su acento de color.
- Tamaños fijos: **16** (controles, listas, barra de estado), **18** (herramientas de la cinta), **20** (acciones
  grandes).
- Color: el del texto. Inactivo `gray-400`; hover y activo `cad-strong`.
- Iconos de acción (ADR-0111): una acción, un dibujo. Lo que se copia, repite o desplaza va en trazo discontinuo y el
  original en pleno; los pares copiar/aplicar usan verbos distintos (pipeta / brocha); toda medición lleva el marco de
  regla violeta.
- Acentos (ADR-0066): el resaltador lleva su barra amarilla (`icon-highlight`), las mediciones su punteado violeta
  (`icon-measure`) y el lápiz su punta azul (`icon-pen`), siempre con `tok()`. Los iconos por tipo de la lista de
  marcas conservan su color por tipo. Nunca se usa `cad-accent` en un icono que no esté seleccionado o activo.

## 4.1 Desplegables

Los desplegables (`IconPicker`, `ColorPicker`) se montan en `<body>` con posición fija y quedan siempre enteros dentro
de la ventana: si no caben a la derecha se desplazan a la izquierda y si no caben debajo se abren hacia arriba
(margen de 8 px).

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

Las miniaturas de página van a **nivel 2**: borde de 1 px con `--cad-border`, sin sombra (ADR-0068). El guard de
`src/designScale.test.ts` rechaza cualquier utilidad `shadow-*` fuera de la lista blanca documentada de flotantes
(menús, popovers, avisos, diálogos, editor en línea y barras sobre el lienzo).

## 7. Foco

Anillo de 2 px con `--cad-accent`, separado 1 px. Siempre visible: con teclado (`:focus-visible`) y en los campos de
texto, y ninguna utilidad `outline-none` lo apaga.

## 8. Mayúsculas y jerarquía en la cinta (ADR-0068)

Una sola convención, en dos niveles:

| Nivel | Elemento | Convención |
|---|---|---|
| Herramientas | Etiquetas bajo el icono (Select, Pan, Text, Cloud+…) | **Mayúscula Inicial**, escrita así en los datos (`toolDefinitions.tsx`); ningún `text-transform` la altera |
| Grupos | Rótulos de grupo (SELECT, TEXT & REVIEW, DRAW) | **MAYÚSCULAS por CSS** (`text-transform: uppercase`) con tracking deliberado de 0.08 em, altura fija de 12 px y una sola línea (`white-space: nowrap`) |
| Pestañas | Markup, Measure, Insert | Mayúscula Inicial, como las herramientas |

La grafía canónica de la herramienta combinada es **Cloud+** (en la cinta, el menú Tools y la lista de tipos de
marca), nunca "Cloud Plus" ni "CloudPlus". Lo vigila `src/designScale.test.ts`.
