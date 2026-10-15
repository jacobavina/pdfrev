# ADR-0046: Capas de marcas como capas del PDF (/OCG)

- **Estado:** Aceptado (cierra la fila `todo` "Capas lógicas OCG y Sellos dinámicos PDF" de PARITY; los sellos
  dinámicos quedaron en ADR-0045)
- **Fecha:** 2026-10-15

## 1. Contexto

REA organiza las marcas en capas ("Markups", "Calibration"…) y permite ocultarlas en el panel Layers. Al guardar, las
capas solo viajaban en el diccionario privado /REA: Revu y Acrobat no las veían en su panel de capas y no podían
ocultar las marcas por capa. Al revés, las anotaciones de otras aplicaciones con contenido opcional (/OC) llegaban a
REA sin capa.

## 2. Decisión

1. **Al guardar**:
   - Cada capa de marcas se escribe como un /OCG (`/Type /OCG /Name (…)`, marcado con /REA) y cada anotación lleva
     `/OC` a su capa (ISO 32000-1 §8.11 y §12.5.2).
   - En /OCProperties del catálogo:
     - se conservan las capas propias del plano (las de CAD);
     - se retiran las capas de marcas que REA escribió en un guardado anterior;
     - se añaden las actuales a /OCGs y a /Order;
     - las ocultas en REA van a /OFF y las demás a /ON.
2. **Al abrir**, una anotación ajena (o de REA sin capa) toma como capa el /Name de su /OCG.
3. **En el panel Layers**, las capas de marcas no se repiten en "PDF Layers": se gestionan en "Markup Layers".

## 3. Evidencia

`src/core/pdf/markupLayersOcg.test.ts`.
