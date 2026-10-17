# ADR-0075: Recortes (cutouts) en mediciones de área y volumen

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** Fase B — Hito B.1 (Medición y Takeoff / Escenario S2)

## Contexto

En mediciones de despiece y takeoff arquitectónico/estructural (Bluebeam Revu), es habitual calcular superficies y volúmenes con huecos interiores (patios de luces, pilares, huecos de ascensor, vanos o zonas excluidas).

Para alcanzar paridad funcional con Revu:
1. La medición neta debe restar la superficie de los huecos ($Área_{neta} = Área_{bruta} - \sum Área_{hueco}$) y sumar el perímetro de cada hueco interior al perímetro total medido.
2. En volumen ($Volumen = Área_{neta} \times Profundidad$), el volumen debe cubicarse a partir de la superficie neta resultante.
3. Visualmente en el visor SVG y en el flujo vectorial de apariencia `/AP` del PDF (ISO 32000-1 §8.5.2), los huecos deben calarse limpiamente sobre el relleno exterior mediante la regla de relleno par-impar (`evenodd` en SVG y operadores `B*` o `f*` en PDF).
4. En interoperabilidad documental, los vértices de los recortes deben persistirse tanto en la clave privada `/REA /cutouts` como en el array estándar `/Cutouts` de la anotación PDF para lectura transparente por Revu y Acrobat.

## Decisión

1. **Modelo de datos de marcas (`src/types/markup.ts`):**
   - Se añade `cutouts?: MarkupPoint[][];` a la interfaz `Markup`. Cada elemento del array representa un hueco poligonal o rectangular en coordenadas normalizadas `[0, 1]`.

2. **Cálculo de mediciones (`src/core/measurements/calculate.ts` y `remeasure.ts`):**
   - `calculateArea` y `calculateVolume` aceptan el parámetro `cutouts?: MarkupPoint[][]`.
   - Se calcula el área de cada hueco por fórmula de Gauss (Shoelace) o rectángulo y se sustrae del área bruta (`areaPt = Math.max(0, areaPt - cArea)`).
   - Se calcula el perímetro de cada contorno interior y se suma al acumulador de perímetro total.
   - `remeasureMarkup` propaga `original.cutouts` al recalcular al cambiar la escala de calibración.

3. **Renderizado en visor (`src/core/markup/render.ts`):**
   - Si una marca de área o volumen contiene `cutouts`, `getMarkupSvgDescriptor` genera un elemento SVG `<path>` compuesto por el trazado exterior (`M...Z`) seguido de los sub-trazados de cada recorte (`M...Z`) con atributo `fillRule: 'evenodd'`.

4. **Operadores de apariencia PDF (`src/core/pdf/operators.ts`):**
   - `emitMarkupOperators` emite los sub-trazados de los recortes con `m...l...h` y sustituye el operador de cierre y relleno estándar `B` o `b` por el operador de regla par-impar `B*` (o `f*`), produciendo apariencia nativa conforme a ISO 32000-1.

5. **Serialización e importación incremental en PDF (`src/core/pdf/incrementalWriter.ts` y `annotationReader.ts`):**
   - `saveIncrementalMarkups` serializa los recortes en `/REA /cutouts [ [x0 y0 ...] ]` y en `/Cutouts [ [x0 y0 ...] ]` en el diccionario de la anotación PDF.
   - `importPdfAnnotations` extrae los recortes de `/REA` o `/Cutouts` foráneo, recalcula la medición neta y restaura `cutouts` en el objeto `Markup`.

6. **Interacciones, transformaciones y menú contextual:**
   - Se añaden las acciones `addCutout` y `clearCutouts` a `useMarkupStore` con historial deshacible (Undo/Redo).
   - Las operaciones de traslación (`translateMarkup`), arrastre interactivo y volteo (`flipMarkups`) transforman simétricamente todos los vértices de los recortes.
   - `useUiStore` gestiona `activeCutoutTargetId`, permitiendo iniciar el modo de recorte desde el menú contextual del lienzo (`Add Cutout`, `Clear Cutouts`), dibujar el recorte con herramienta de área o polígono, y cancelar el modo pulsando la tecla `Escape`.

## Consecuencias

- Las mediciones de área y volumen soportan despiece de superficies con huecos múltiples tanto poligonales como ortogonales.
- El cálculo numérico, la representación gráfica en pantalla, el stream de apariencia `/AP` y el almacenamiento PDF son estrictamente coherentes y reversibles.
- No se agregaron dependencias externas ni se incrementó el chunk principal.
