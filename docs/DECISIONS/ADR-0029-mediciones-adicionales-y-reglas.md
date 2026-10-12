# ADR-0029: Perimeter, Volume, Angle, Radius, Diameter y reglas

- **Estado:** Aceptado (pedido del usuario, 2026-10-12: "tengo más opciones de medidas" + "Continue")
- **Fecha:** 2026-10-12

## 1. Contexto

REA medía longitud, polilongitud, área y conteo. Revu ofrece además perímetro, volumen, ángulo, radio y diámetro,
y reglas en los bordes del visor (View ▸ Rulers). Sin ellas, un takeoff de construcción (contornos de losa,
volúmenes de excavación, radios de curvas) se hacía a mano.

## 2. Decisión

1. **Perimeter (Shift+Alt+P)**: contorno cerrado por vértices (Enter, doble clic o clic en el primer vértice).
   Suma como longitud en los totales.
2. **Volume (Shift+Alt+V)**: área del contorno × profundidad. La profundidad por defecto se fija en el panel
   Measure (Volume Properties ▸ Depth); con un volumen seleccionado, el mismo campo cambia la suya y escala el
   valor (el volumen es lineal en la profundidad), en un paso deshacible. Se guarda en la marca (`volumeDepth`).
   Relleno violeta translúcido por defecto; totales propios con ³.
3. **Angle (Shift+Alt+G)**: tres clics; el segundo es el vértice. Mide sobre la geometría real (respeta la escala Y
   separada). Arco en el vértice. No se suma.
4. **Radius (Shift+Alt+R)** del centro al borde y **Diameter (Shift+Alt+D)** de borde a borde: círculo, línea y
   punto central; la etiqueta lleva "R " o "Ø ". No se suman.
5. Las cinco tienen puntos de control (arrastrar un vértice recalcula el valor), snap, ícono propio en la cinta,
   en el menú de herramientas y en la lista de marcas.
6. **PDF**: subtipos estándar (perímetro y volumen `/Polygon` con `/Vertices`, ángulo `/PolyLine`, radio y
   diámetro `/Circle` con su `/Rect` igual a la caja del círculo) con `/AP` propio, para que Revu, Acrobat y
   PDF.js los dibujen; la geometría exacta, la medida y la profundidad viajan en `/REA` (ida y vuelta sin
   pérdidas). El aplanado los dibuja con su valor.
7. **Reglas (View ▸ Rulers, Ctrl+R, o la casilla Rulers del panel Measure)**: superior e izquierda, en la unidad
   de la escala de la página activa (milímetros de papel sin escala), con el cero en la esquina superior izquierda
   de la hoja; siguen el zoom, el desplazamiento y la rotación, y marcan la posición del cursor. Se recuerdan entre
   sesiones. Ctrl+R ya no recarga la ventana. El componente se carga bajo demanda (presupuesto del bundle).

## 3. Consecuencias

- Revu guarda estas mediciones con `/Measure` e `/IT` propios (p. ej. `/PolygonDimension`); REA escribe la
  apariencia y su `/REA`, así que en Revu se ven y se editan como formas, no como mediciones vivas. Pendiente si el
  usuario lo pide.
- Ángulo, radio y diámetro guardan `unit` de la escala por el tipo de `MarkupMeasurement`; la lista muestra °.

## 4. Evidencia

`src/core/measurements/measureExtra.test.ts`, `src/core/pdf/measureInterop.test.ts` (incluye PDF.js como lector
externo), `src/components/PdfViewerMeasureTools.test.tsx` y el E2E "Mediciones Angle, Radius y Volume con reglas
(ADR-0029)".
