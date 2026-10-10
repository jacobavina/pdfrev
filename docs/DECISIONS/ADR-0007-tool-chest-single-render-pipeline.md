# ADR-0007: Canal Único de Renderizado para Miniaturas del Tool Chest (Opción A)

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Autores:** Equipo REA

---

## 1. Contexto
El sub-entregable B.3 del Tool Chest requiere la presentación visual de miniaturas vectoriales (`ToolVectorThumbnail`) para las herramientas persistidas en las paletas y en la sección de herramientas recientes. Cada miniatura debe reflejar fielmente tanto la morfología de la marca (los 14 tipos soportados en `VALID_MARKUP_TYPES`) como sus atributos de estilo específicos (color de trazo, grosor, color de relleno, nivel de opacidad y patrón de guiones `dashArray`).

Una implementación inicial introdujo un bloque `switch` aislado de más de 300 líneas con definiciones de rutas SVG hardcodeadas e independientes. Esto constituía un segundo motor de dibujo desvinculado del canal canónico de renderizado (`src/core/markup/render.ts`), reproduciendo el mismo patrón de acoplamiento y riesgo de regresión latente detectado previamente en `stickyNote`. Si la geometría de una nube, flecha de llamada o nota cambia en `render.ts`, un motor secundario diverge de forma silenciosa sin romper pruebas del pipeline principal.

---

## 2. Alternativas Consideradas

1. **Opción A (Recomendada): Sintetizar marcas de muestra y consumir el pipeline canónico de descriptores.**
   Una función pura `createSampleMarkup(type, style, mode)` genera una entidad `Markup` en espacio normalizado unitario `[0.15 .. 0.85]`. Dicha marca es procesada por `getMarkupSvgDescriptor(sampleMarkup, transform)` y proyectada al DOM mediante `renderSvgDescriptor(descriptor)`.
2. **Opción B: Mantener iconos esquemáticos manuales y documentar la excepción arquitectónica.**
   Conservar los trazados manuales dedicados para la paleta y añadir tests estáticos de estilo por tipo. Se descarta porque perpetúa dos implementaciones paralelas de geometría vectorial para los mismos 14 tipos de marcas técnicas.

---

## 3. Decisión
Se adopta formalmente la **Opción A**.

`ToolVectorThumbnail` delega íntegramente la computación de geometría y elementos SVG a las funciones puras `getMarkupSvgDescriptor` y `renderSvgDescriptor` de `src/core/markup/render.ts`.

Puntos clave de la arquitectura:
- **Espacio de Coordenadas de Muestra:** `createSampleMarkup` genera marcas normalizadas donde los puntos clave se sitúan dentro del rango seguro $[0.15, 0.85]$.
- **Transformación de Muestra:** Se utiliza un `ViewportTransform` de caja unitaria de $100 \times 100$ con escala adaptativa (escala 2 para notas adhesivas centradas en puntos nativos, escala 1 para el resto) y un elemento `<svg viewBox="0 0 100 100">` escalado suavemente a la dimensión solicitada (`size` px).
- **Indicador de Modo:** El distintivo (`badge`) de Modo Propiedad ('P') o Modo Dibujo ('D') se renderiza como una capa superpuesta desacoplada de la geometría de la marca.
- **Eliminación de Código Duplicado:** Se eliminaron más de 260 líneas de SVG duplicado en favor del pipeline canónico compartido.

Anclas de implementación verificadas:
- En `src/components/markup/ToolVectorThumbnail.tsx` (función `createSampleMarkup`).
- En `src/components/markup/ToolVectorThumbnail.tsx` (invocación de `getMarkupSvgDescriptor` y `renderSvgDescriptor`).
- En `src/core/markup/render.ts` (descriptores puros para todos los tipos de marcas).
- En `src/components/markup/ToolVectorThumbnail.test.tsx` (validación de descriptores canónicos para los 14 tipos de `VALID_MARKUP_TYPES`).

---

## 4. Consecuencias

- **Positivas:**
  - Garantía de fuente única de verdad: cualquier mejora o ajuste en `render.ts` (por ejemplo, cálculo de lóbulos de nubes o proporciones de directrices de llamadas) se refleja de inmediato y automáticamente en el Tool Chest.
  - Las pruebas de miniaturas actúan como verificación continua de regresión sobre el pipeline de descriptores.
  - Se eliminan discrepancias visuales entre lo que el usuario ve en la paleta y lo que dibuja en el lienzo.
- **Negativas / Mitigaciones:**
  - Requiere que `createSampleMarkup` suministre geometrías de muestra sintéticas consistentes para cualquier nuevo tipo de marca que se incorpore a `VALID_MARKUP_TYPES`.

---

## 5. Evidencia
- En `src/components/markup/ToolVectorThumbnail.test.tsx`, la prueba `createSampleMarkup genera marcas válidas para los 14 tipos de VALID_MARKUP_TYPES` verifica que los 14 tipos producen descriptores SVG canónicos válidos (`rect`, `ellipse`, `line`, `polygon`, `path`, `g`).
- Las pruebas de estilos y geometrías avanzadas (saetas de llamadas, rutas de nubes y líneas de notas adhesivas) pasan al 100% reutilizando `renderSvgDescriptor`.
