# ADR-0019: Vista continua, ajustar a página/ancho y zoom anclado al cursor

- **Estado:** Aceptado (pedido del usuario, 2026-10-11: "continúa con la vista continua y ajustar a página")
- **Fecha:** 2026-10-11

## 1. Contexto

El visor mostraba una sola página; cambiar de hoja era solo con la barra de estado o las miniaturas. No había
"Ajustar a página" ni "Ajustar al ancho", el documento abría siempre al 100 % y el zoom era solo por botones.

## 2. Decisión

1. **Modo de vista** (`useUiStore.viewMode`, recordado en `localStorage`): `continuous` (por defecto) apila todas las
   páginas con scroll; `single` conserva el comportamiento anterior. Botones en la barra de estado y en Ver.
2. **Lienzo por página** (`components/viewer/PageCanvas.tsx`): cada hoja tiene su lienzo en una posición estable del
   árbol, así activar otra página no lo vuelve a montar (sin parpadeo, con el doble búfer de `pdfService`). Las hojas
   alejadas (fuera de la vista ±600 px, `IntersectionObserver`) liberan su mapa de bits.
3. **Página activa**: la que está bajo el cursor o, si no, en el centro de la vista; es la única interactiva (capa de
   texto, overlay de edición, mismos `data-testid` de siempre). Nunca cambia a mitad de un trazo, arrastre o edición.
   Las demás muestran sus marcas en solo lectura. La navegación externa (miniaturas, barra de estado) lleva la hoja a
   la vista. Los desplazamientos hechos por código se reconocen por su posición resultante, no por tiempo.
4. **Tamaños de página** leídos una vez (`getPage().getViewport`) para maquetar sin saltos antes de renderizar.
   Si el documento no los ofrece, se usa la vista de una página (nunca un visor en blanco).
5. **Ajustes de zoom**: Ajustar a página (Ctrl+0), Tamaño real (Ctrl+1), Ajustar al ancho (Ctrl+2). Al abrir un
   archivo se ajusta a la página. **Ctrl+rueda** acerca/aleja manteniendo fijo el punto bajo el cursor. Zoom mínimo
   10 % (planos grandes).
6. Barra de estado: tamaño de la hoja activa en cm (tooltip en pulgadas).

## 3. Consecuencias

- La vista de dos páginas y la continua a dos páginas de Revu quedan pendientes.
- Una página no activa no recibe el primer clic de dibujo si el cursor llega a ella con un clic (en la práctica el
  paso del cursor ya la activa).

## 4. Evidencia

E2E "Vista continua, cota, puntos de control y zoom (ADR-0019/0020/0021): …" y `node scripts/verify.mjs --with-e2e --e2e-loop 3`.
