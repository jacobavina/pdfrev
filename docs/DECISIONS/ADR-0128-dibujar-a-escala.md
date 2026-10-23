# ADR-0128: Dibujar a escala (Sketch to Scale)

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Oleada 1 de `docs/plan-v2/10-brecha-menus-revu.md`: para dibujar un cuarto de 4 × 3 m, una columna o una huella hay que
arrastrar con el ratón y medir después. Revu permite dar las medidas reales y dibuja la forma.

## 2. Decisión

1. **Edit ▸ Sketch to Scale…** abre un diálogo con la forma y sus medidas, en las unidades de la escala de la hoja actual:
   - **Rectangle** y **Circle / Ellipse:** ancho y alto.
   - **Line:** largo y ángulo en grados (0 a la derecha, positivo en sentido contrario a las agujas).
   - **Regular polygon:** largo del lado y número de lados (3 a 24), con un lado horizontal abajo.
2. **Draw** crea una marca normal (`rectangle`, `circle`, `line` o `polygon`) centrada en la hoja, con el estilo y la capa
   activos y el autor actual, la deja seleccionada y se deshace de una vez con Undo. Se arrastra después a su sitio.
3. Las medidas se pasan a puntos PDF con la escala efectiva del centro de la hoja (viewports incluidos) y con la escala
   vertical propia si la hoja tiene "Separate Y Scale".
4. Si alguna medida no es válida, o la forma no cabe en la hoja a esa escala, no se crea nada y se explica el motivo. En una
   página sin escala se avisa de que las medidas son milímetros de papel.

## 3. Alcance y límites

- Es una marca de dibujo, no una medición: no lleva valor de longitud o área (Measure ▸ Area sigue siendo la herramienta de
  takeoff). Su tamaño real se puede comprobar con las herramientas de medida.
- No hay colocación con un clic en la hoja: la forma nace centrada y se mueve después.
- Los pies-pulgadas o fracciones se escriben como decimales de la unidad de la escala.

## 4. Pruebas

- `src/core/markup/sketchToScale.test.ts` (7): rectángulo, círculo con escala por eje, línea con ángulo, polígono regular de
  lados iguales, estilo y autor, medidas no válidas y forma que no cabe.
- `src/components/modals/SketchToScaleDialog.test.tsx` (6): menú sin documento, dibujar y deshacer, campos por forma y
  avisos, forma que no cabe, página sin escala y Escape.
- E2E `Sketch to Scale (ADR-0128)`: desde el menú Edit se dibuja un rectángulo y aparece como una marca más.
