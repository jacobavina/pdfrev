# ADR-0107: Offset y Multiply

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

El menú Edit de Revu tiene `Offset` y `Multiply`; REA solo tenía un `Multiply…` desactivado en el menú contextual. Son
dos de las funciones que más se usan para replicar elementos con medida exacta (ejes, muros paralelos, filas de
luminarias).

## 2. Decisión

1. **Offset** (`O`, `Edit ▸ Offset…`, menú contextual): copia paralela de cada marca elegida a una distancia dada en las
   unidades de la escala de la página.
   - Líneas, polilíneas y sus mediciones (`line`, `polyLine`, `length`, `polylineMeasure`): la copia queda a la
     izquierda o a la derecha del sentido de dibujo; las esquinas se resuelven con inglete (punta limitada a 4×).
   - Formas cerradas (`polygon`, `area`, `perimeter`, `cloud`): *Left / Outside* crece y *Right / Inside* encoge,
     sea cual sea el sentido en que se dibujaron.
   - Cajas de dos esquinas (`rectangle`, `circle`, nube rectangular): crecen o se encogen por los cuatro lados; si
     al encoger se invertirían, se omiten.
   - Las mediciones se recalculan con la escala efectiva (viewports regionales incluidos).
   - El resto de tipos no se desplazan y el diálogo lo dice.
2. **Multiply** (`Ctrl+M`, `Edit ▸ Multiply…`, menú contextual): repite la selección, tomada como un bloque, en
   *Rows × Columns* celdas con un hueco de borde a borde (*Gap across / Gap down*, en unidades de la escala; puede ser
   negativo para solapar). La original queda en la celda de arriba a la izquierda; las celdas que caerían fuera de la
   hoja se omiten y se avisa; el tope es de 400 celdas. Los grupos se copian como grupos nuevos, uno por celda.
3. Las copias se añaden con un solo comando de historial (un Undo las quita todas) y quedan seleccionadas.
4. Las marcas bloqueadas no se copian. Las teclas `O` y `Ctrl+M` solo actúan con una selección y `O` se ignora si el
   foco está en un campo de texto.

## 3. Alcance y límites

- Offset no genera varias copias a la vez ni desplaza arcos, curvas, texto, sellos ni mediciones de volumen o cota.
- Multiply no copia a otras páginas.

## 4. Pruebas

- `src/core/markup/copyTools.test.ts` (11): geometría de Multiply y de Offset, sentido de las formas cerradas,
  recálculo de medidas, omisiones.
- `src/components/modals/CopyToolsDialog.test.tsx` (7): diálogos, deshacer de una vez, menú Edit.
- E2E `Offset y Multiply (ADR-0107)`: Ctrl+M, cuadrícula, O y deshacer en la aplicación real.
