# ADR-0063: Flechas por fuera en distancias cortas, símbolos del conteo individuales y rueda del zoom de doble clic

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0032/0033 (distancia de Acrobat), ADR-0059 (Count de Revu) y ADR-0021/0023 (control de zoom de doble clic)

## 1. Contexto

El usuario midió 16.74 ft en un plano real y señaló tres cosas, con capturas de REA y de Revu:

1. **Distancia corta:** las puntas de flecha se montan una sobre otra. En Revu y en CAD, si no caben, van por fuera.
2. **Count:** el conteo se seleccionaba como un único recuadro que englobaba todos los símbolos. En Revu, cada símbolo
   tiene su propio tirador verde y se ve por separado, aunque el conteo siga siendo uno con su total.
3. **Zoom de doble clic:** la rueda funcionaba al revés de lo que espera el usuario.

## 2. Decisión

1. **`outsideArrowLayout`** (`src/core/markup/lineEndings.ts`, puro):
   - Si la línea mide menos de 2.5 puntas y algún extremo es flecha, devuelve:
     - los ángulos girados media vuelta, para que cada punta quede por fuera apuntando al extremo;
     - un tramo exterior de 1.6 puntas en cada extremo.
   - La distancia lo usa en pantalla (`data-arrows="outside"`) y en el `/AP` y el aplanado (`emitLineEndings` acepta
     ángulos dados).
   - Los círculos, cuadros y barras nunca se dan la vuelta.
2. **Count de Revu:**
   - Cada símbolo es un punto de control propio: verde, como en Revu. Arrastrarlo mueve solo ese símbolo.
   - La selección dibuja un recuadro por símbolo en lugar de la caja que los englobaba.
   - El conteo sigue siendo una marca con su total (`Count = N`).
   - Los conteos numerados anteriores no cambian.
3. **Rueda con el control de zoom abierto:** ahora la rueda hacia uno acerca y hacia delante aleja, en el punto del doble
   clic. Ctrl+rueda conserva su sentido. Se ajustó la prueba `con el control de zoom abierto, la rueda acerca y aleja sin
   Ctrl (ADR-0023)`, que fijaba el sentido anterior; su nombre no cambia. La ayuda de atajos lo explica.

## 3. Verificación

- `src/core/markup/outsideArrows.test.ts`:
  - `en una distancia corta las puntas van por fuera apuntando hacia dentro, con un tramo exterior en cada extremo`
  - `cada símbolo del conteo tiene su tirador y se mueve solo, y el conteo sigue siendo uno`
- `src/components/RevuEditing.test.tsx`: `un conteo seleccionado muestra un recuadro y un tirador verde por símbolo, no una caja que los englobe (ADR-0063)`
- `src/components/PdfViewerDimension.test.tsx`: `con el control de zoom abierto, la rueda acerca y aleja sin Ctrl (ADR-0023)`, con el nuevo sentido.
- Revisado en la vista previa del navegador:
  - una distancia de 5.6 mm muestra las puntas por fuera con su tramo;
  - tres palomitas seleccionadas muestran tres recuadros y tres tiradores verdes, con "Totals: Count = 3".
