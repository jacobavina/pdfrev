# ADR-0006: Canal de Renderizado Compartido y Descriptores SVG Puros

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Autores:** Equipo REA

---

## 1. Contexto
En REA existen dos destinos críticos para la representación visual de las marcas técnicas:
1. El visor interactivo en pantalla (renderizado reactivo en el DOM vía elementos SVG).
2. El exportador de documentos PDF (emisión de operadores gráficos vectoriales en el content stream del PDF vía `pdf-lib`).

Si la lógica de trazado geométrico (por ejemplo, arcos de nubes de revisión, saetas, flechas directrices o polígonos) se implementa por separado en el componente React y en el exportador PDF, ambas representaciones divergen irremediablemente: las nubes tienen diferente número de lóbulos, las saetas no coinciden o los grosores difieren entre la pantalla y el plano impreso. Además, pasar atributos SVG crudos con guiones (como `stroke-width`) a `React.createElement` disparaba warnings continuos en la consola del WebView.

---

## 2. Alternativas Consideradas
1. **Renderizar en un canvas oculto y exportar como imagen rasterizada al PDF:** Descartado. Destruye la fidelidad vectorial requerida en CAD/AEC y pixela los planos al ampliar en obra.
2. **Duplicar los algoritmos matemáticos en React y en el exportador:** Descartado. Violación directa del principio de fuente única de verdad; imposible mantener sincronización.
3. **Módulo de cálculo geométrico puro `src/core/markup/render.ts` que emite descriptores agnósticos:** Una sola función pura calcula los caminos vectoriales (`generateCloudPath`, `getMarkupSvgDescriptor`). El componente UI los proyecta al DOM usando normalización a camelCase (`normalizeSvgAttrs`), mientras el exportador interpreta los mismos comandos hacia el content stream del PDF.

---

## 3. Decisión
Centralizar toda la geometría de anotaciones en el módulo puro `src/core/markup/render.ts`, compartiendo constantes globales e inmutables, normalizando atributos DOM con `SVG_ATTR_CAMEL_MAP` y consumiendo la misma fuente de verdad en pantalla y en exportación.

Anclas de implementación verificadas:
- En `src/core/markup/render.ts` (líneas 89-91, constantes `DEFAULT_ARC_STEP`, `MIN_SAGITTA`, `DEFAULT_SAGITTA_RATIO`).
- En `src/core/markup/render.ts` (línea 97, función pura `calculateSignedArea`).
- En `src/core/markup/render.ts` (línea 116, función pura `generateCloudPath`).
- En `src/core/markup/render.ts` (línea 264, función `getMarkupSvgDescriptor`).
- En `src/core/markup/render.ts` (línea 529, mapa constante `SVG_ATTR_CAMEL_MAP`).
- En `src/core/markup/render.ts` (línea 558, función `normalizeSvgAttrs`).
- En `src/core/markup/render.ts` (línea 582, función `renderSvgDescriptor`).
- Consumidores en `src/services/pdfExportService.ts` (línea 12, importación de `DEFAULT_ARC_STEP` y `generateCloudPath`; líneas 459 y 487, llamadas para trazado vectorial).
- Consumidores en `src/components/PdfViewer.tsx` (líneas 24-28, importación de utilidades; líneas 709 y 717, renderizado de descriptores; líneas 861 y 868, generación de previsualización en vivo).

---

## 4. Consecuencias
- **Positivas:** Identidad matemática absoluta entre lo que el revisor ve en pantalla y el PDF vectorial exportado; cero warnings en la consola del WebView (`Invalid DOM property`); pruebas unitarias sobre renderizado puramente matemático sin necesidad de levantar jsdom o navegadores.
- **Negativas / Mitigaciones:** Cualquier cambio en la firma de una función geométrica obliga a actualizar simultáneamente tanto `PdfViewer.tsx` como `pdfExportService.ts` en el mismo commit.

---

## 5. Evidencia
- En `src/core/markup/render.test.ts`, 17 pruebas unitarias validan que las nubes horarias y antihorarias generan curvatura idéntica y que los atributos con guión se transforman correctamente a camelCase.
- En `src/services/pdfExportService.test.ts`, el "test de oro" verifica que el content stream exportado contiene las coordenadas y operadores esperados (`cm`, `re`, `l`).
