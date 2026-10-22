# ADR-0095: Relleno dinámico de áreas (Dynamic Fill)

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase F, Hito F.7

## 1. Contexto

Medir el área de una habitación obliga a pulsar cada vértice de su contorno. Revu ofrece Dynamic Fill: un clic dentro
de un recinto cerrado detecta su contorno y crea la medición.

## 2. Decisión

1. **Núcleo puro `src/core/measurements/dynamicFill.ts`:** sobre una rasterización de la hoja,
   - toma como tinta los píxeles con luminancia menor que 160 y los engrosa `gap` píxeles (3 por defecto), lo que
     cierra huecos pequeños como un vano mal dibujado o una línea discontinua;
   - inunda por líneas de barrido desde el clic;
   - si la inundación toca el borde de la hoja u ocupa más del 60 % de ella, el recinto está abierto;
   - recupera el recinto hacia los muros, traza su contorno exterior (vecindad de Moore) y lo simplifica
     (Douglas-Peucker, 1.5 px).
2. **Servicio `dynamicFillService.ts`:** rasteriza la página a 1600 px de ancho (una vez por página y documento),
   detecta el recinto y devuelve una marca `area` con la medición calculada con la calibración de la página. Si falla,
   avisa por qué (sobre una línea, recinto abierto, nada encontrado).
3. **Herramienta `Dynamic Fill (J)`** en el grupo Measure de la cinta (icono Lucide `PaintBucket`, atajo `J`). El panel
   de Propiedades, con la herramienta activa, permite ajustar el hueco (0–20 px).
4. **`pageRaster.ts`:** la rasterización de Compare Documents (ADR-0091) pasa a un módulo compartido.

## 3. Alcance y límites

- Trabaja sobre el dibujo rasterizado, no sobre los vectores del PDF: lo que se ve como línea oscura cuenta como muro.
- Solo el contorno exterior: los obstáculos interiores (pilares, mobiliario) no se restan.
- Crear Spaces (ADR-0080) o perímetros con el mismo clic no entra en este hito; el resultado es una medición de área.

## 4. Pruebas

- `src/core/measurements/dynamicFill.test.ts` (5).
- `src/services/dynamicFillService.test.ts` (2).
- E2E `Relleno dinámico (ADR-0095)`: un clic dentro del rectángulo del plano de prueba crea el área.
