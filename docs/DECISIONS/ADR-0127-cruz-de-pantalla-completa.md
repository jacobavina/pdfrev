# ADR-0127: Cruz de pantalla completa (Full-Screen Crosshair)

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Oleada 1 de `docs/plan-v2/10-brecha-menus-revu.md`: en un plano grande, alinear a ojo dos elementos lejanos es difícil. Revu
ofrece una cruz que cruza toda la ventana por el cursor.

## 2. Decisión

1. **View ▸ Full-Screen Crosshair** (Shift+F8; Ctrl+Shift+F8 sigue siendo Snap to Content) alterna una línea horizontal y
   otra vertical de 1 px que cruzan toda la ventana por el cursor, con el color de acento.
2. Es una capa fija con `pointer-events: none`: no captura el ratón, no se imprime ni se guarda y no toca las marcas.
3. Se oculta cuando el cursor sale de la ventana y se recuerda entre sesiones (`rea-crosshair`).
4. Componente propio (`FullScreenCrosshair`) cargado perezosamente; la posición se lee de `mousemove` en la ventana.

## 3. Alcance y límites

- Sigue al cursor, no a la herramienta activa; no hay opción de grosor ni de color.
- No va dentro de la exportación a PDF ni de la impresión (es una ayuda de pantalla).

## 4. Pruebas

- `src/components/shell/FullScreenCrosshair.test.tsx` (2): apagada, encendida y siguiendo al cursor; menú y recuerdo.
- E2E `Full-Screen Crosshair (ADR-0127)`: Shift+F8 coloca las líneas en la posición del ratón y otra pulsación las quita.
