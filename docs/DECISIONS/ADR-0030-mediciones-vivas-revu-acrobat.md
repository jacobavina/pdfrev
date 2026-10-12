# ADR-0030: Mediciones vivas en Revu y Acrobat

- **Estado:** Aceptado (continuación pedida por el usuario, 2026-10-12: "continua")
- **Fecha:** 2026-10-12

## 1. Contexto

Hasta ADR-0029 las mediciones de REA llegaban a otros lectores solo como formas con apariencia: la escala viajaba
en la página (`/VP`), pero cada anotación no decía que era una medición. Acrobat y Revu marcan sus mediciones con
una intención estándar (`/IT`, ISO 32000-1 §12.5.6.7 y §12.5.6.9) y un diccionario `/Measure /RL` propio. Al revés,
un PDF medido en Acrobat o Revu se abría en REA con líneas y polígonos sin valor.

## 2. Decisión

1. **Escritura.** Cada medición con equivalente estándar lleva `/IT` y `/Measure` con la escala vigente de su
   página: la definida en REA, si no la que ya trae el PDF, y si no milímetros de papel (lo mismo que muestra el
   visor). El diccionario se genera con el mismo código que el `/VP` de la página (`measureDictFor`).
   - Length → `/Line /IT /LineDimension`.
   - Polylength → `/PolyLine /IT /PolyLineDimension`.
   - Perimeter → `/PolyLine /IT /PolyLineDimension` cerrada (el último vértice repite el primero), como el
     perímetro de Acrobat. Sustituye el `/Polygon` de ADR-0029 para esta medición.
   - Area → `/Polygon /IT /PolygonDimension`, también la rectangular (antes `/Square`), con sus cuatro vértices.
   - Volume, Angle, Radius, Diameter y Count no tienen intención estándar: siguen como formas con `/AP` y `/REA`.
2. **Lectura.** Una anotación ajena con esas intenciones se importa como medición:
   - `/LineDimension` con `/Measure` y sin `/LL` → Length (con `/LL` sigue siendo cota).
   - `/PolyLineDimension` abierta → Polylength; cerrada → Perimeter (sin el vértice repetido).
   - `/PolygonDimension` → Area.
   El valor se calcula de su geometría con su propio `/Measure`, o con la escala de la página si no lo trae.
   `/Contents` (el texto que puso el otro programa) se conserva como texto de la marca.
3. **Edición fuera de REA.** Si una medición de REA se movió en otro programa (su `/Rect` ya no es el escrito), su
   valor se recalcula con la geometría nueva en lugar de usar el guardado en `/REA`.

## 3. Consecuencias

- Revu y Acrobat deberían mostrar estas marcas en su lista de mediciones con la escala correcta; lo verifica el
  usuario, porque REA no puede ejecutar Revu ni Acrobat.
- Revu tiene intenciones propias para volumen, ángulo, radio y conteo que no están en la norma; no se imitan.

## 4. Evidencia

`src/core/pdf/liveMeasureInterop.test.ts` y `src/core/pdf/measureInterop.test.ts`.
