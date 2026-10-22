# ADR-0112: Paneles agrupados en View y etiquetas de miniatura en una línea

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Hallazgos 6, 7 y 8 de `docs/plan-v2/11-plan-de-diseno.md`: el menú View tenía 25 entradas que mezclaban vista, paneles y
perfiles; la etiqueta "Page N" de las miniaturas se partía en dos líneas con el panel estrecho; y `Measurements Panel`
usaba una regla diagonal parecida a la de otras entradas.

## 2. Decisión

1. **View ▸ Panels** (submenú) reúne Thumbnails, Bookmarks, Layers, Properties, Measurements y Markups List. Quedan en
   View, sueltos, los dos ajustes de comportamiento (*Open Panel on Selection* y *Open Markups List at Start*), que
   cambian cómo se abren los paneles y no abren uno.
2. La etiqueta de la miniatura va en una línea (`truncate whitespace-nowrap`) con el texto completo en `title`.
3. `Measurements Panel` usa el icono de medición con su marco de regla, como el grupo Measure de la cinta.
4. El hallazgo 8 (Rulers) ya estaba resuelto: el icono es una escuadra con marcas arriba y a la izquierda.

## 3. Pruebas

`src/components/shell/MenuBarPanels.test.tsx` (3): el submenú agrupa los seis paneles y abre Layers, Markups List
conserva su atajo, y la etiqueta de miniatura va en una línea. Los E2E que usan `menu-view-auto-panels` no cambian.
