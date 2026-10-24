# ADR-0136: Menús compactos y sellos con miniatura

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## 1. Contexto

El usuario comparó con capturas los menús de Bluebeam Revu (Tools ▸ Stamp y Tools ▸ Measure) con los de REA y pidió una
aplicación más compacta, íconos mejor logrados y que el menú Stamp muestre cada sello como se verá. Medido en REA, una fila
de menú ocupaba unos 34 px (relleno de 6 px más un ícono de 22 px) frente a los 24 px de Revu, y las entradas de Stamp
llevaban solo un cuadrado de color.

## 2. Decisión

1. **Filas de menú compactas** (File, Edit, View, Document, Tools, Help y todos sus submenús): texto de 12 px (`text-xs`),
   relleno vertical de 2 px, hueco para el ícono de 20 px con el ícono dibujado a **16 px** (antes 15 px, que no encajaba en
   la cuadrícula de 24 y dejaba trazos borrosos), separadores y márgenes más finos y ancho mínimo de 210 px (190 px los
   submenús). Una fila queda en unos 24 px.
2. **Tools ▸ Stamp con miniaturas:** cada entrada muestra el dibujo real del sello (la misma geometría del sello colocado y de
   su apariencia en el PDF) en una caja de 76 × 22 px; el nombre va sin el sufijo del grupo y el grupo (Revu, Dynamic,
   Standard…) en gris a la derecha, donde las demás entradas llevan su atajo. `StampThumb` pasa a su propio archivo y acepta
   un ancho máximo; su tamaño va en línea para que la regla de íconos del menú no lo reduzca a 16 px.
3. **Cabecera más baja:** barra de menús de 28 px (antes 32), pestañas de la cinta de 24 px (antes 28), carril de herramientas
   de 52 px (antes 56 tras el arreglo de solapamiento), herramientas de 28 px y 40 px de ancho mínimo (el relleno de los grupos conserva la escala 4/8/12/16 de ADR-0065) y barra de
   estado de 24 px (antes 26).
4. **Cambios en pruebas** (por pinchar medidas exactas): `Redesign.test.tsx` pasa de 56 a 52 px de carril. No se cambia ninguna otra aserción.

## 3. Alcance y límites

- No se copian los íconos de Revu ni sus sellos: las miniaturas son los sellos propios de REA.
- Los íconos siguen siendo de trazo (lucide y propios); mejora su nitidez (tamaño en cuadrícula) pero no se redibujan.
- Quedan como en Revu y fuera de esta decisión: *Create Stamp…*, *Import Stamp…* y *Change Stamp Folder…* del menú Stamp.
- Los paneles, diálogos y barras de propiedades no cambian de densidad en este ADR.

## 4. Pruebas

- `src/components/shell/StampMenuThumbs.test.tsx` (3): la miniatura conserva su tamaño (no 16 px), nombre sin sufijo con el grupo
  a la derecha y elegir activa el sello, y filas compactas.
- `src/components/shell/Redesign.test.tsx` (1 aserción de medida actualizada: carril de 52 px).
