# ADR-0051: Mediciones de volumen, ángulo, conteo, radio y diámetro reconocibles por Revu

- **Estado:** Aceptado (pendiente de la lista de paridad: "intenciones de medición de Revu")
- **Fecha:** 2026-10-15
- **Amplía:** ADR-0030 (Length, Polylength, Perimeter y Area con /IT estándar)

## 1. Contexto

ISO 32000-1 solo define intenciones para distancia, polilínea y área. Revu guarda sus demás mediciones con nombres
propios, sin documentación pública. Los tomamos de pymkup (código abierto que lee PDFs de Revu,
github.com/psolin/pymkup):
- /IT `PolygonVolume`, `PolyLineAngle`, `PolygonCount` y `PolygonRadius`.
- /MeasurementTypes: Count 128, Length 130, Volume 132, Diameter 384 y Angle 1152.
- /Depth y /DepthUnit para el volumen.

## 2. Decisión

1. **Al guardar**:
   - Volumen, ángulo, conteo y radio llevan su /IT de Revu y su /Measure con la escala de la página.
   - Volumen, ángulo, conteo y diámetro llevan /MeasurementTypes.
   - El volumen lleva además /Depth y /DepthUnit.
2. **Al abrir**, esas anotaciones de Revu se convierten en mediciones de REA:
   - Polígono con /PolygonVolume → volumen (con su /Depth).
   - Polilínea con /PolyLineAngle → ángulo.
   - Círculo o polígono con /PolygonCount → conteo (en el centro).
   - Círculo con /PolygonRadius → radio (del centro al borde).
   - El valor se recalcula de la geometría y la escala, como en ADR-0030.

## 3. Consecuencias

- Los nombres vienen de una fuente de terceros y no de la documentación de Bluebeam: queda PENDIENTE confirmarlos
  abriendo en Revu un PDF guardado por REA y abriendo en REA uno medido en Revu.
- Se actualizó la prueba de ADR-0030 que fijaba "sin intención" para estos tipos.

## 4. Evidencia

`src/core/pdf/revuMeasureInterop.test.ts` y `src/core/pdf/liveMeasureInterop.test.ts`.
