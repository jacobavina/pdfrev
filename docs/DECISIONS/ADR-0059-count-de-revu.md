# ADR-0059: Count de Revu (símbolos, escala y total por marca)

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0029 (mediciones adicionales), ADR-0051 (claves de medición de Revu) y ADR-0043 (panel al seleccionar)

## 1. Contexto

El usuario mostró la barra de Count de Revu:
- símbolo (palomita, triángulo, cuadrado, círculo y rombo, más los juegos del Tool Chest);
- color, opacidad y escala en %;
- unidades;
- "Totals: Count = N".

En Revu, una marca de conteo reúne todos los clics. En REA cada clic creaba una marca aparte, un círculo azul numerado.

Además, el paquete principal estaba en 796.93 de 800 kB tras ADR-0057.

## 2. Decisión

1. **Espacio en el paquete:**
   - `useToolChestStore` carga `toolChestService` (IndexedDB y paletas) con `import()` la primera vez que lo usa. El
     estado inicial supone persistencia y `init` la confirma.
   - Al cargar el servicio, el store se suscribe a sus errores.
   - El paquete principal baja unos 9 kB.
2. **Modelo (`src/core/markup/countSymbols.ts`, puro):**
   - Un conteo de Revu es una marca `count` con un punto por clic y `customFields.countSymbol` / `countScale` (%, de 10 a
     1000).
   - Su medición es `Count = N`.
   - `countItems` da N, o 1 en los conteos numerados anteriores, que se siguen dibujando igual.
   - Los totales de takeoff, la lista de marcas y el panel Measure suman los clics.
3. **Creación:**
   - Con la herramienta Count, el primer clic crea la marca con el símbolo y la escala de la barra; cada clic siguiente
     le suma un punto (`reshapeMarkup`, deshacible por clic).
   - El conteo termina al cambiar de herramienta (el Pan temporal no lo corta), al cambiar de página o con Enter o Esc.
   - Mientras Count está activo no se abre el panel automático de ADR-0043: abrirlo movería la hoja bajo el siguiente clic.
4. **Dibujo:**
   - El mismo trazado (`countSymbolsPath`) en pantalla, en el `/AP` y en el aplanado.
   - Símbolo sin relleno, del color de la línea, de 18 pt al 100 %.
   - El aplanado ya no añade el número a los conteos con símbolo.
5. **PDF:**
   - `/Subtype /Polygon /IT /PolygonCount /MeasurementTypes 128` con un vértice por clic. Es la forma en que REA ya leía los
     conteos de Revu.
   - Al abrir, un polígono `/PolygonCount` de otra aplicación conserva todos sus vértices como clics, con el símbolo
     Check. Antes se reducía a su centro.
   - El círculo `/PolygonCount` sigue siendo un conteo de uno.
6. **Barra de propiedades:**
   - Sección Count con el símbolo (`ribbon-count-symbol`), la escala (`ribbon-count-scale`) y
     "Totals: Count = N" (`ribbon-count-total`).
   - Edita los conteos seleccionados o, con la herramienta activa, el conteo en curso.
   - La lista de marcas muestra "ea" como unidad del conteo.

**Fuera de alcance:**
- los juegos de símbolos del Tool Chest de Revu (Contractor Review, General Measurements, Construction Symbols);
- el menú Units del conteo.

## 3. Verificación

- `src/core/markup/countSymbols.test.ts`:
  - `el conteo de Revu suma sus clics, dibuja el mismo símbolo en cada uno y escala su tamaño`
  - `el /AP dibuja un símbolo por clic y el PDF guarda el conteo como polígono /PolygonCount con un vértice por clic`
- `src/components/RevuEditing.test.tsx`:
  - `Count de Revu: los clics se suman a una sola marca hasta Enter y cada clic se deshace por separado (ADR-0059)`
  - `la barra de Count muestra el total del conteo seleccionado y cambia su símbolo y su escala (ADR-0059)`
- Revisado en la vista previa del navegador:
  - tres palomitas en una marca, con "Totals: Count = 3" y "Count = 3" en la lista;
  - triángulo al 200 %;
  - sin salto del panel.

  La ventana nativa y Revu/Acrobat quedan pendientes de verificación por el usuario.
