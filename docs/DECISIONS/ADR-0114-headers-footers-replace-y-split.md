# ADR-0114: Headers & Footers, Replace Pages y Split Document

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Tres funciones más del menú Document de Revu (`docs/plan-v2/10-brecha-menus-revu.md`). Las dos primeras cambian los bytes
del PDF abierto como Crop y Number Pages (ADR-0113); la tercera escribe archivos nuevos.

## 2. Decisión

1. **Headers & Footers…**: seis ranuras de texto (izquierda, centro y derecha, arriba y abajo) con campos `{n}`,
   `{total}`, `{page}`, `{pages}`, `{date}`, `{time}`, `{file}` y `{title}`, que se rellenan por página; cuerpo, margen,
   color, fuente estándar, primer número y páginas (todas, la actual o una lista). Reutiliza el estampado de Number Pages
   (`drawStampedText`), de modo que el texto sale derecho en páginas rotadas. La fecha y la hora son las del momento de
   aplicar. Es contenido permanente, sin deshacer; el diálogo lo avisa y muestra cómo quedará la primera página.
2. **Replace Pages…**: se elige un PDF (selector de archivo) y se escribe qué páginas del documento se sustituyen y qué
   páginas del otro las reemplazan; la cantidad puede ser distinta. Las nuevas ocupan el sitio de la primera sustituida.
   - Con la misma cantidad se puede **conservar las marcas** de las páginas sustituidas (por defecto) o quitarlas; nada
     se desplaza.
   - Con cantidad distinta se quitan las marcas de las páginas sustituidas y se corren marcas, escalas, viewports de
     medición y página actual de lo posterior; las etiquetas de página se reinician. El diálogo lo dice antes.
   - Las anotaciones propias del otro PDF viajan con sus páginas, como anotaciones del archivo (no como marcas de REA).
3. **Split Document…**: cada N páginas o con partes escritas (`1-3; 4-6; 8, 10`, hasta 200 archivos). Los archivos se
   nombran `<archivo>_p1-3.pdf` (`_p5` para una página, `_partN` si no son contiguas) sin repetirse y sin caracteres
   que Windows no admite. El documento no cambia. **Los archivos llevan las marcas**: se serializa el documento como
   lo dejaría Guardar (`serializeOpenDocument`, sin tocar el archivo) y las páginas se copian con sus anotaciones.
   En la aplicación de escritorio se elige la carpeta y se escribe con `save_export_file`; si ya existe un archivo con
   ese nombre se reemplaza (el diálogo lo avisa). En el navegador se descargan uno a uno.

## 3. Alcance y límites

- Split no conserva marcadores ni destinos de enlaces entre páginas; no hay partir por marcadores.
- Replace con páginas de otro tamaño: las marcas conservadas pueden no coincidir con el nuevo dibujo.
- Ninguna de las tres operaciones se deshace con Undo; el diálogo recomienda guardar una copia antes.

## 4. Pruebas

- `src/core/pages/headersFooters.test.ts` (7), `pageSplit.test.ts` (6), `replacePages.test.ts` (6): campos, ranuras,
  estampado con página rotada, partes y nombres, y sustituciones con distinta cantidad y páginas no contiguas.
- `src/services/pageToolsService.test.ts` (8): estado conservado, remapeo de marcas, escalas y viewports, y que cada
  archivo del Split lleve las anotaciones de sus páginas.
- `src/components/modals/PageToolDialogs2.test.tsx` (7) y tres E2E con la aplicación real (texto estampado en la capa
  de texto, página sustituida por otro PDF y descargas del Split).
