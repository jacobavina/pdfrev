# ADR-0057: Hatch en formas cerradas y Cloud+ sin flecha, como en Revu

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0041 (nube de Revu y tipos de línea con patrón) y ADR-0042 (callout de Revu)

## 1. Contexto

El usuario comparó con Revu (captura del menú *Hatch* de la barra de propiedades) y señaló dos diferencias:

1. En Revu, la directriz de la nota de **Cloud+** sale de la nube **sin flecha**; REA la creaba con un callout normal, que por
   defecto lleva flecha abierta (ADR-0042). Además, la nota quedaba casi pegada a la esquina de la nube.
2. Revu permite poner **hatch** a las formas: (None), Brick, Diagonal Brick, Horizontal, Vertical, Diagonal Down, Diagonal Up,
   Grid, Weave, 10% Dots, 20% Dots y 30% Dots. REA no tenía hatch.

## 2. Decisión

1. **Cloud+:** el callout del grupo se crea con `lineEndingStart: 'none'`. La caja de la nota se coloca más lejos
   (unos 56 pt a la derecha y 50 pt por encima de la esquina), así que la directriz sale en diagonal, como en Revu. El callout
   suelto conserva su flecha abierta.
2. **Hatch (`MarkupStyle.hatch`):** módulo puro `src/core/markup/hatch.ts`:
   - Contiene los 11 patrones de Revu, en su orden.
   - Admiten hatch el rectángulo, la elipse, el polígono, la nube, Cloud+, el área y el volumen.
   - El patrón usa el color de la línea. Las líneas miden 0.75 pt y van cada 8 pt. Los puntos se dibujan sobre una
     retícula de 4 pt y cubren el 10, 20 o 30 % de la superficie.
   - Todo está en pt de página y anclado al origen de la página, así que el patrón no "resbala" al mover la forma.
   - Los puntos se dibujan como filas discontinuas, un segmento por fila. Así el `/AP` queda pequeño incluso en formas grandes.
   - Los patrones girados (diagonales, ladrillo diagonal y tejido) se generan en un marco girado 45° que cubre la caja.
3. **Misma geometría en los tres destinos:**
   - **Pantalla:** `render.ts` dibuja la forma tal cual y, encima, el patrón recortado con un `<clipPath>` al contorno.
     Para la nube se usa el festón real. En pantalla las líneas nunca bajan de 1 px.
   - **`/AP` y aplanado:** `operators.ts` emite `q <contorno> W n … S Q` después de la forma. El patrón no amplía la caja
     envolvente: `svgQuadPathToPdf` acepta `track = false` para eso.
   - Revu y Acrobat ven el hatch porque está en el `/AP`. No existe una clave pública de Revu para su hatch, así que no se
     inventa ninguna.
4. **Persistencia:** `/hatch` en el diccionario `/REA` (ida y vuelta).
5. **Interfaz:** selector `ribbon-hatch` en la sección *Fill* de la barra de propiedades, con "(None)" y una muestra dibujada
   de cada patrón (`HatchPreview.tsx`, con los mismos trazos que la marca). Con selección edita las marcas; sin selección,
   fija el estilo de las marcas nuevas.

## 3. Verificación

- `src/core/markup/hatch.test.ts`:
  - `ofrece los patrones de Revu y cada uno cubre la caja de la forma con trazos anclados a la página`
  - `solo las formas cerradas llevan hatch y su contorno sirve de recorte`
  - `la pantalla y el /AP dibujan el hatch recortado al contorno sin agrandar la caja, y el PDF lo conserva al reabrir`
- `src/components/RevuEditing.test.tsx`:
  - `Cloud+ como en Revu: la directriz sale de la nube sin flecha (ADR-0057)`
  - `el menú Hatch de la barra lista los patrones de Revu y aplica el elegido a la forma seleccionada (ADR-0057)`
- Revisado en la vista previa del navegador: Cloud+ con Grid recortado a los festones y nota con directriz diagonal sin flecha.
  La ventana nativa y Revu/Acrobat quedan pendientes de verificación por el usuario.
