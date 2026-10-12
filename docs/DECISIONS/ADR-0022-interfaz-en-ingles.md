# ADR-0022: Interfaz en inglés

- **Estado:** Aceptado (pedido del usuario, 2026-10-11: "lo quiero en inglés igual, no español")
- **Fecha:** 2026-10-11

## 1. Contexto

REA es una reimplementación funcional de Bluebeam Revu, cuya interfaz de referencia está en inglés. La interfaz de
REA estaba en español.

## 2. Decisión

1. Todos los textos visibles pasan a inglés con la terminología de Revu: menús (File, Edit, View, Document, Markup,
   Measure, Help), herramientas (Pen, Highlight, Line, Arrow, Dimension, Polyline, Rectangle, Ellipse, Polygon, Cloud,
   Cloud+, Length, Polylength, Area, Count), estados (Pending, Accepted, Rejected, Completed, Cancelled), Properties,
   Markups List, Measurements, avisos, mensajes de error que llegan al usuario, CSV y reporte PDF, títulos de ventana
   (`index.html` con `lang="en"` y `tauri.conf.json`), fechas en `en-US`.
2. Textos por defecto de las marcas nuevas: "Note", "Cloud+ note", autor "Reviewer".
3. Se mantienen en español los comentarios del código, la documentación del proyecto y los mensajes de consola para
   desarrolladores. Los identificadores (`data-testid`, ids de menú) no cambian.
4. No se añade un sistema de traducción: un solo idioma, sin capa de i18n que mantener.

## 3. Consecuencias

- Las marcas creadas antes conservan sus textos en español (son datos del usuario).
- Si más adelante se quiere elegir idioma, habrá que extraer los textos a un catálogo.

## 4. Evidencia

Tests unitarios y E2E actualizados a los textos en inglés; `node scripts/verify.mjs --with-e2e --e2e-loop 3`.
