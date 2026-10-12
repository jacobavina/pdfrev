# ADR-0024: Capas del PDF (contenido opcional /OCG)

- **Estado:** Aceptado (pregunta del usuario, 2026-10-11: "si abro el pdf, ¿me cargan todas las capas como en Revu?")
- **Fecha:** 2026-10-11

## 1. Contexto

Los planos exportados desde CAD traen sus capas como grupos de contenido opcional (/OCProperties, /OCG). Revu las
lista en su panel Layers y permite mostrarlas u ocultarlas. El panel Layers de REA solo listaba las capas de las
marcas: las capas del PDF no se cargaban.

## 2. Decisión

1. Al abrir un PDF se lee su configuración de contenido opcional (`PDFDocumentProxy.getOptionalContentConfig`) con la
   visibilidad inicial del documento (/D /ON /OFF).
2. Panel **Layers**: sección "PDF Layers" (tabla Layer | Visible, con la anidación de /Order y botones Show all /
   Hide all) y debajo "Markup Layers". `core/pdf/pdfLayers.ts` aplana /Order e incluye los grupos que no aparecen en él.
3. Ocultar o mostrar una capa vuelve a renderizar las páginas con esa configuración (`optionalContentConfigPromise`).
   No modifica el PDF.

## 3. Pendiente

Columnas Lock/Print/Export de Revu y guardar la visibilidad en el PDF.

## 4. Evidencia

`src/core/pdf/pdfLayers.test.ts` (incluye un PDF real con /OCProperties leído con PDF.js) y `Shell.test.tsx`.
