# ADR-0020: Cota (Dimension), selectores con dibujo e interoperabilidad sin pérdidas

- **Estado:** Aceptado (pedido del usuario, 2026-10-11, con capturas de Revu 21.8)
- **Fecha:** 2026-10-11

## 1. Contexto

- El tipo de línea y los extremos se elegían por texto; Revu los muestra con su dibujo.
- Revu tiene la herramienta **Dimension** (Shift+L): línea de cota con texto propio, no una medición.
- La revisión del escritor y del lector PDF encontró pérdidas: las nubes, los cuadros de texto y las llamadas se
  escribían con un /AP **vacío** (invisibles en Revu/Acrobat), Cloud+ como cuadrado sin dibujo; al reabrir, las
  longitudes volvían como líneas, los conteos como círculos, las polilongitudes como polilíneas; se perdían capa,
  grupo, opacidad, tamaño de fuente y las directrices de las llamadas; la opacidad no se aplicaba en el /AP.

## 2. Decisión

1. **Selectores con dibujo** (`shell/IconPicker.tsx`) para grosor, tipo de línea y extremos en la cinta y en
   Propiedades. El nombre queda en `title`/`aria-label`. La lista se monta en `<body>` (la cinta recorta).
2. **Extremos nuevos**: trazo perpendicular (/Butt) y barra arquitectónica (/Slash, 30° de la perpendicular en
   sentido horario; reflejada en pantalla para verse igual).
3. **Cota** (`type: 'dimension'`, Shift+L): p1 y p2 acotados, p3 sobre la línea de cota. Trazada de izquierda a
   derecha la línea queda encima (15 pt); de derecha a izquierda, debajo. Texto inicial = longitud con la escala de la
   página, editable al momento; flechas cerradas por defecto. Geometría única (`core/markup/dimension.ts`) para
   pantalla, /AP y aplanado. En el PDF: /Line con /LL, /LLE, /LLO, /Cap, /CP /Top, /IT /LineDimension y el texto en
   /Contents; una /Line ajena con /LL se importa como cota.
4. **/AP con texto** (Helvetica estándar, WinAnsi, recurso /Font): cota, cuadro de texto y llamada (con directriz y
   punta). Nube: festón real y /Vertices de 4 puntos con /BE nuboso; Cloud+ también. Opacidad con `gs` y /CA.
5. **Ida y vuelta exacta**: /REA guarda los puntos normalizados (`/pts`), las directrices (`/leaders`) y el /Rect con
   que se escribió (`/rect`). Si otra aplicación movió la anotación (/Rect distinto), se usa la geometría estándar.
   El tipo de REA prevalece sobre el subtipo PDF; se leen capa, grupo, /CA y /DA.

## 3. Consecuencias

- Las etiquetas de medición (longitud, área, conteo) aún no se dibujan en su /AP (sí en el aplanado).
- Caracteres fuera de WinAnsi salen como "?" en el /AP; el texto íntegro sigue en /Contents.

## 4. Evidencia

`src/core/pdf/dimensionInterop.test.ts`, `src/core/markup/dimensionCloud.test.ts`,
`src/components/PdfViewerDimension.test.tsx` y el E2E de ADR-0019/0020/0021.
