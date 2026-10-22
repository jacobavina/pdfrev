# ADR-0106: Rejilla de la hoja (Show Grid y Snap to Grid)

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Revu tiene `View ▸ Show Grid` y `Snap to Grid`; REA no. El usuario lo pidió dos veces y no lo encontró en el menú.

## 2. Decisión

1. **Show Grid** (`Shift+F9`) dibuja sobre la hoja líneas cada cierto paso, con una más gruesa cada cinco. El origen es
   la esquina superior izquierda de la página.
2. **Snap to Grid** (`Ctrl+Shift+F9`) lleva el cursor de las herramientas de dibujo y medición (las mismas que ya
   usan Snap to Markup y Snap to Content) a la intersección más cercana. Un ajuste a una marca o al plano tiene
   prioridad sobre la rejilla.
3. **Paso:** en las unidades de la escala de la página (milímetros de papel si no está calibrada). En automático es el
   menor 1, 2 o 5 × 10^k que deja las líneas a no menos de 48 px, así que cambia con el zoom; con un espaciado elegido
   en el panel Measurements ▸ Snap se usa ese, agrupando líneas si a ese zoom quedarían a menos de 6 px. Nunca se
   dibujan más de 600 líneas por eje.
4. Las tres preferencias (mostrar, imantar, espaciado) se guardan en `localStorage` (`rea-grid`).
5. Menú **View** (con marca de activo) y casillas en **Measurements ▸ Snap**; entrada en la guía de funciones.

## 3. Alcance y límites

- La rejilla es una ayuda de pantalla: no se guarda en el PDF ni se imprime ni se aplana.
- Una página con viewports regionales usa la escala de la página, no la de cada viewport.
- El ajuste afecta a las herramientas con snap; mover o editar vértices de marcas ya hechas no se imanta.

## 4. Pruebas

- `src/core/markup/grid.test.ts` (6): paso redondo, adaptación al zoom, espaciado elegido, líneas y tope, ajuste.
- `src/components/PdfViewerGrid.test.tsx` (7): dibujar/ocultar, sin interceptar el ratón, ajuste con y sin Snap to
  Grid, espaciado elegido, persistencia y menú View.
