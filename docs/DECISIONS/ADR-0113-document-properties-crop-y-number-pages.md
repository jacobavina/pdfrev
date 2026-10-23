# ADR-0113: Document Properties, Crop Pages y Number Pages

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Tres funciones del menú Document de Revu que REA no tenía (`docs/plan-v2/10-brecha-menus-revu.md`): ver y editar las
propiedades del PDF, recortar márgenes de las páginas y numerarlas.

## 2. Decisión

Las tres viven en `Document` y cambian los bytes del PDF abierto con `replaceOpenDocument`, que conserva página, zoom,
etiquetas de página, columnas personalizadas y anotaciones importadas y marca el documento como modificado.

1. **Document Properties…**: diálogo con archivo, ubicación, tamaño, versión PDF, páginas, tamaño de página ("varían" si
   hay tamaños distintos), cifrado, fechas, creador y productor. Título, autor, asunto y palabras clave se editan y se
   escriben en `/Info` (vacío lo quita); la fecha de modificación se actualiza y el productor no se toca.
2. **Crop Pages…**: márgenes arriba/abajo/izquierda/derecha en mm, pulgadas o puntos para la página actual, todas o una
   lista ("1-3, 5"). Se calcula sobre lo que se **ve**, así que sirve igual con páginas rotadas: un rectángulo visible
   normalizado se convierte en el `CropBox` del PDF y se usa para pasar las marcas, directrices, recortes de área y
   viewports de medición al nuevo origen. El `MediaBox` no se toca: **Restore full page** devuelve la caja completa y
   deja las marcas donde estaban. Se niega, sin cambiar nada, si una marca quedaría fuera del recorte o si un lado
   quedaría por debajo de 18 pt; el diálogo lo avisa antes con el tamaño resultante.
3. **Number Pages…**: plantilla con `{n}` (número), `{total}` (último número), `{page}` y `{pages}` (hoja y total de
   hojas), esquina (6 posiciones), cuerpo, margen, color, primer número, fuente estándar (Helvetica, Times, Courier) y
   páginas. El texto se coloca sobre la página vista y se gira con ella, de modo que se lee derecho. Los caracteres que
   la fuente no dibuja se cambian por `?`. Es contenido permanente del PDF, sin deshacer: el diálogo lo dice.

## 3. Alcance y límites

- Number Pages no es *Create Page Labels* (las etiquetas del visor): estampa texto. Las etiquetas siguen en la lista.
- Crop no recorta contenido a mano alzada ni detecta márgenes en blanco; no hay recorte automático.
- Las propiedades no incluyen metadatos XMP ni fuentes incrustadas, ni cambian la seguridad del documento.
- Cambiar los bytes del documento no se puede deshacer con Undo (igual que rotar o borrar una página).

## 3.1 Incidente: la ventana nativa se quedaba en blanco

La primera versión leía la versión del PDF con una expresión regular que llevaba escrita la marca de cabecera de PDF
dentro de un archivo pequeño. Tauri sirve cada archivo de la aplicación con el tipo MIME que adivina por su contenido, y
uno con esa marca en sus primeros 1024 bytes sale como `application/pdf`: WebView2 se niega a cargarlo como módulo, el
`import()` de los diálogos falla y React no llega a pintar nada. Los E2E de Playwright (servidor de desarrollo) y la
compilación de producción en Chromium no lo ven; solo lo vio el smoke test nativo, que se encontró la ventana vacía.
Ahora la cabecera se busca por sus bytes (`pdfHeaderVersion`) y `src/core/pages/noPdfMagicInBundle.test.ts` prohíbe el
literal en cualquier archivo de `src/` que no sea de pruebas. El smoke test guarda ahora una captura y el texto visible
cuando el canvas no aparece.

## 4. Pruebas

- `src/core/pages/pageBoxes.test.ts` (8), `pageNumbers.test.ts` (8), `documentProperties.test.ts` (6): geometría con
  páginas rotadas, estampado y propiedades sobre PDF reales de pdf-lib.
- `src/services/documentEditService.test.ts` (7): estado conservado, marcas y viewports remapeados, recorte negado,
  restaurar.
- `src/components/modals/PageToolDialogs.test.tsx` (6) y dos E2E con la aplicación real.
- `src/core/pages/noPdfMagicInBundle.test.ts` (1): ningún archivo fuente lleva la marca de cabecera de PDF como texto.
