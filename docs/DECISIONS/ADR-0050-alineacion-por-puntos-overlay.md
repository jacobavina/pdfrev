# ADR-0050: Alineación por puntos en Overlay Pages

- **Estado:** Aceptado (pendiente de la lista de paridad con Revu: "alinear revisiones con 3 puntos en Overlay
  Pages")
- **Fecha:** 2026-10-15
- **Amplía:** ADR-0038 (Overlay Pages con desplazamiento de 1/10 pt)

## 1. Contexto

Dos revisiones de un plano rara vez coinciden exactamente: otro margen de exportación, otra escala de impresión o un
escaneo girado o estirado. Con solo desplazamientos de 1 pt no se pueden superponer bien. Revu las alinea por
puntos.

## 2. Decisión

1. **Align** en la barra de Overlay:
   - Se hace clic en un punto de la página actual y luego en el mismo punto del dibujo comparado, dos o tres veces.
   - Los puntos se marcan numerados con el color de su página.
   - Apply aplica con 2 pares; con 3 pares se aplica sola. Esc o Cancel cancelan.
   - Mientras se alinea, los clics no dibujan ni seleccionan.
2. **Transformación** `T(p) = M·p + t` en pt de página (`solveAlignment`):
   - Con 2 pares, semejanza (desplazamiento, giro y escala uniforme).
   - Con 3 pares, afín completa (también estiramientos y sesgo de escaneo).
   - Los puntos repetidos o colineales se rechazan con un aviso.
   - El punto de la comparada se toma deshaciendo la alineación vigente, así una alineación puede refinarse.
3. El lienzo de Overlay dibuja la página comparada con esa transformación.
   - Las flechas de 1/10 pt siguen moviendo `t`.
   - La barra muestra desplazamiento, escala y giro.
   - Reset vuelve a la identidad.

## 3. Evidencia

`src/core/compare/overlayAlign.test.tsx` y el E2E "Overlay Pages: alinear la página comparada con dos pares de puntos
(ADR-0050)".
