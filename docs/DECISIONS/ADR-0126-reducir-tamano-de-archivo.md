# ADR-0126: Reduce File Size

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Oleada 4 de `docs/plan-v2/10-brecha-menus-revu.md`: los planos escaneados o con fotos pesan decenas de MB y no caben en un
correo. Revu los reduce bajando la resolución de las imágenes.

## 2. Decisión

1. **Document ▸ Reduce File Size…** con tres calidades: *High quality* (lado mayor máximo 3000 px, JPEG 0.85), *Balanced*
   (2000 px, 0.72, la predeterminada) y *Smallest file* (1200 px, 0.55).
2. **Qué se toca:** las imágenes RGB y grises de 8 bits (JPEG, o Flate sin filtros de predicción) cuyo lado mayor supera el
   máximo, o las Flate de más de 40 KB aunque quepan (se pasan a JPEG). Se escalan con la misma proporción, se recomprimen
   como JPEG y sustituyen a la original **conservando su máscara de transparencia** (`SMask`, `Mask`), `Intent` e
   `Interpolate`. Lo vectorial no se toca. El PDF se reescribe con flujos de objetos.
3. **Qué no:** máscaras y escaneos de 1 bit (CCITT/JBIG2), codificaciones que no se pueden leer y espacios de color
   indexados o CMYK. Solo se acepta una sustitución que ahorre un 10 % o más de esa imagen.
4. **Códec intercambiable:** `ImageCodec` (decodificar y codificar JPEG). El de producción usa lienzos del navegador; las
   pruebas usan uno simulado. Sin lienzo disponible, las imágenes se dejan y se explica.
5. **Informe:** tamaño antes y después, imágenes reducidas y vistas, y las que se dejaron con su motivo. Si no queda más
   pequeño, el documento no cambia.
6. Sustituye los bytes del documento abierto como las demás herramientas de páginas (no se deshace con Undo; se marca como
   modificado). **Batch** gana la operación *Reduce the file size* (`_reduced`, con la calidad elegida).

## 3. Alcance y límites

- No quita capas, datos de formularios ni metadatos, no elimina fuentes ni subconjuntos de fuentes, y no convierte
  CMYK/Indexed. Las imágenes de 16 bits se dejan.
- Un JPEG ya pequeño no se vuelve a comprimir para no degradarlo sin ganancia clara.

## 4. Pruebas

- `src/core/pdf/reduceSize.test.ts` (10): tamaño de destino, regla del 10 %, reducción con PNG reales, imágenes pequeñas,
  JPEG que saldría mayor, transparencia, 1 bit, JPEG grande, sin códec y PDF válido con progreso.
- `src/components/modals/ReduceSizeDialog.test.tsx` (5): menú, tamaño actual, informe de ahorro, sin ahorro y Escape.
- E2E `Reduce File Size (ADR-0126)`: un PDF real con una imagen grande se reduce en Batch con el lienzo de Chromium, pesa
  menos de la mitad y se vuelve a abrir.
