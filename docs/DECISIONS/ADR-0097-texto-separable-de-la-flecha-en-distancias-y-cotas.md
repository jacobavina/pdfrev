# ADR-0097: Texto separable de la flecha en Length y Dimension

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Amplía:** ADR-0032 (texto de las mediciones), ADR-0063 (flechas por fuera)

## 1. Contexto

En distancias y cotas cortas el valor ("17.1 ft", "16.86 ft") queda encima de las flechas, que van por fuera
(ADR-0063), y no se podía mover: solo había "dentro de la línea" o "encima de la línea".

## 2. Decisión

1. **Desplazamiento del texto** (`customFields.captionOffsetX` a lo largo de la línea, positivo a la derecha, y
   `captionOffsetY` perpendicular, positivo hacia arriba, en pt de página). Con desplazamiento, el texto sale de su sitio
   normal y la línea deja de interrumpirse.
2. **Pantalla, /AP y aplanado** usan la misma geometría (`measureCaption.ts`: `shiftCaption`, `captionOffsetOf`,
   `lineCaptionLayout` con `offset`; `render.ts` y `operators.ts`).
3. **PDF:** `/CO [along up]` en la anotación `/Line`, que es la entrada estándar del PDF para el desplazamiento del
   texto; se lee también de las distancias y cotas de Revu o Acrobat.
4. **Interfaz:**
   - un tirador en forma de rombo sobre el texto de la distancia o cota seleccionada: arrastrarlo lo separa de la
     línea (se pega a su sitio normal a menos de 2 pt) y un solo deshacer lo devuelve;
   - en el panel de Propiedades, "Text offset" con los dos valores en pt y "Reset".

## 3. Alcance y límites

- Solo Length y Dimension; Radius, Diameter y Polylength quedan como estaban.
- El texto desplazado no lleva línea guía hacia la flecha (Acrobat tampoco la dibuja).
- El desplazamiento se mide en el sistema del propio texto (el que lo deja legible de izquierda a derecha).

## 4. Pruebas

- `src/core/pdf/captionOffsetInterop.test.ts` (6): geometría, pantalla, /AP, `/CO` de ida y vuelta y ausencia sin
  desplazamiento.
- `src/components/CaptionOffsetFlow.test.tsx` (2): arrastre del tirador con deshacer y campos del panel.
- E2E `Texto separable de la flecha (ADR-0097)`.
