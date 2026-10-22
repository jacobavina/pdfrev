# ADR-0110: Lasso y Undo History

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Dos funciones más de la primera oleada de `docs/plan-v2/10-brecha-menus-revu.md`: seleccionar con una forma libre y ver
el historial de cambios para volver a un punto.

## 2. Decisión

1. **Lasso** (`Shift+O`, botón *Lasso* en el grupo Select de la cinta, icono Lucide `LassoSelect`): arrastrar dibuja un
   contorno libre (punteado, cerrado hacia el primer punto) y al soltar elige las marcas que el lazo **toca**: un
   vértice del lazo dentro de su caja, una esquina de su caja dentro del lazo o un lado del lazo que la cruza (la misma
   idea de "tocar" que el marco elástico de Select). Con `Shift` o `Ctrl` al empezar suma a la selección; `Esc` cancela.
   Al terminar vuelve a Select para poder mover o editar lo elegido. Un lazo que no toca nada avisa y conserva la
   selección anterior. No elige marcas ocultas (ADR-0109) ni de capas ocultas.
2. **Undo History** (`Edit ▸ Undo History…`): diálogo con *Document as opened*, cada cambio hecho (hasta los 50 que
   guarda el historial) y los rehacibles en gris; la fila actual lleva *You are here*. Elegir una fila hace los Undo o
   Redo necesarios (`jumpInHistory`). Un cambio nuevo descarta lo rehacible, como siempre.

## 3. Alcance y límites

- El lazo se evalúa sobre cajas envolventes: una marca en diagonal puede quedar elegida aunque el lazo pase por un
  hueco de su caja que su trazo no toca.
- El historial es el de las marcas (50 pasos); no incluye cambios de escala ni de páginas, que no son deshacibles.

## 4. Pruebas

- `src/core/markup/lasso.test.ts` (4): punto en polígono con esquina entrante, tocar vs. no tocar, envolver, lazo inválido.
- `src/components/LassoAndHistory.test.tsx` (9): atajo y cinta, lazo sobre el visor, Esc, Shift, ocultas, y el diálogo.
- E2E `Lasso (ADR-0110)` y `Undo History (ADR-0110)` sobre la aplicación real.
