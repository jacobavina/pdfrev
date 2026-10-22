# Plan de diseño de REA

Plan de diseño de la interfaz, redactado con el criterio de **Impeccable** (la herramienta que el usuario tiene en
`.impeccable/`: detector de anti-patrones y comandos de diseño). Se usó su detector y la revisión visual de capturas; el
resto de sus comandos (`/audit`, `/critique`, `/polish`, `/layout`…) son habilidades que no están instaladas en este
proyecto, y `impeccable install` descarga de la red, así que no se ejecutó sin tu visto bueno.

## 1. Punto de partida

- **Detector** (`impeccable detect src`): sin hallazgos en el código fuente. Las excepciones de `.impeccable/config.json`
  son falsos positivos documentados de la capa de texto invisible de PDF.js; `src/designScale.test.ts` vigila que la
  interfaz no baje de 11 px ni salga de la escala 11/12/13/14/16.
- **Sistema vigente:** `docs/DESIGN.md` (tokens `--cad-*`, `--ov-*`, `--icon-*`, escala tipográfica, trazo de iconos de 1.75).
- **Revisión visual** de los menús Edit, View, Document y Tools y de la cinta (Markup, Measure, Insert) en 1440×900.

## 2. Principios

1. **Herramienta de trabajo, no de exhibición.** Densidad alta, sin adornos; el plano es el protagonista y la interfaz
   baja el tono (gris neutro, un solo acento).
2. **Una acción, un dibujo; un color, un significado.** Acento `cad-accent` solo para lo activo o seleccionado; violeta
   solo para mediciones; amarillo solo para el resaltador; azul solo para la pluma.
3. **Nada se corta.** Todo menú, submenú y diálogo cabe en la ventana y se desplaza si no (ADR-0104, ADR-0108).
4. **Lo desconocido se explica donde ocurre.** Cada orden nueva dice qué hizo (aviso) y cómo deshacerlo; la guía de
   funciones (Help ▸ Feature Guide) recoge todas.
5. **Teclado primero.** Cada orden frecuente tiene atajo visible en su menú y en el título del botón.

## 3. Hallazgos de la revisión

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | Offset, Multiply y Duplicate compartían icono; Offset no se entendía | Alta | **Hecho** (ADR-0111) |
| 2 | Hide y tres entradas de redacción compartían `EyeOff`; Export, Flatten y Unflatten `FileDown` | Alta | **Hecho** |
| 3 | Copy Format y Paste Format con el mismo pincel | Media | **Hecho** (pipeta / brocha) |
| 4 | Fill sin el marco de regla de las mediciones | Media | **Hecho** |
| 5 | Snap to Grid con un imán que a 16 px parece un gancho | Baja | **Hecho** |
| 6 | Menús largos (View con 25 entradas) mezclan vista, paneles y perfiles | Media | **Propuesto**: submenú *Panels* con Thumbnails, Bookmarks, Layers, Properties, Measurements y Markups List |
| 7 | Etiquetas "Page 1" de las miniaturas se parten en dos líneas con el panel estrecho | Baja | **Propuesto**: una línea con elipsis |
| 8 | `Rulers` (regla) y `Measurements Panel` (regla diagonal) parecidos | Baja | **Propuesto**: Rulers con reglas en L, como Revu |
| 9 | Cinta Markup: 40 herramientas en un solo carril que se corta en ventanas estrechas | Media | **Propuesto**: colapsar grupos a un botón con desplegable por debajo de 1100 px |
| 10 | Estado de herramienta activa poco visible en grupos que se desplazan | Baja | **Propuesto**: indicador fijo de la herramienta activa en la barra de estado |

## 4. Orden de trabajo propuesto

1. **Ya hecho:** hallazgos 1–5.
2. **Siguiente (una sesión, sin riesgo):** 6, 7 y 8. Son cambios de menú y de un icono, con pruebas de `data-testid`.
3. **Después (requiere tu decisión):** 9 y 10, que cambian cómo se ve la cinta.
4. **Cada cambio:** captura antes/después a 2×, `impeccable detect`, `designScale.test.ts`, verify ×3.

## 5. Criterios de aceptación

- Ningún icono repetido para acciones distintas dentro de un mismo menú.
- Todo menú abierto en una ventana de 900×480 se puede recorrer entero.
- `impeccable detect src` sin hallazgos nuevos y `designScale.test.ts` en verde.
- Contraste de texto y de iconos activos ≥ 4.5:1 en claro y oscuro (comprobar con `scripts/contrast` al tocar tokens).
