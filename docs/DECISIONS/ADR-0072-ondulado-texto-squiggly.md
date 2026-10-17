# ADR-0072: Ondulado de texto (`squiggly`, `/Subtype /Squiggly`, atajo `Shift+U`)

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Hito:** `A.2` (Fase A — Revisión de ingeniería, escenario S1)

## Contexto

La matriz de paridad con Bluebeam Revu (`docs/plan-v2/06-matriz-capacidades-revu.md`, §1) identifica el ondulado de texto (`Squiggly`, atajo `Shift+U`) como el tercer miembro del trío de marcado de texto junto con subrayado (`underline`, `U`) y tachado (`strikeOut`, `D`).

Según ISO 32000-1 §12.5.6.10 (*Text Markup Annotations*), las anotaciones de ondulado se persisten con `/Subtype /Squiggly`, caja envolvente `/Rect`, cuadrilátero `/QuadPoints` de 8 números (`[x1 y2 x2 y2 x1 y1 x2 y1]`) y flujo de apariencia `/AP /N` con un trazo sinusoidal/zigzag sobre la línea base del texto.

## Decisión

1. **Modelo y catálogo de herramientas (`src/types/markup.ts`, `src/core/markup/typeLabels.ts`, `src/components/shell/toolDefinitions.tsx`):**
   - Añadir `'squiggly'` a `VALID_MARKUP_TYPES` y su etiqueta `'Squiggly'` en `MARKUP_TYPE_LABELS`.
   - Registrar la herramienta en el grupo `text` de la cinta con título `'Squiggly (Shift+U)'`, atajo `Shift+U` e icono `SquigglyIcon` (`src/components/shell/customIcons.tsx`), e incluir `'squiggly'` en `TEXT_LAYER_TOOLS`.
2. **Atajo y selección sobre capa de texto (`src/components/PdfViewer.tsx`):**
   - `Shift+U` (sin `Alt` ni `Ctrl`, preservando `Shift+Alt+U` para `radius` y `U` para `underline`) activa `'squiggly'` y muestra el aviso accesible si la página activa carece de capa de texto seleccionable.
   - Al seleccionar texto o arrastrar manualmente con `'squiggly'`, se crean las marcas con `groupId` compartido por renglón, igual que `underline` y `strikeOut`.
3. **Renderizado SVG y emisión PDF (`src/core/markup/render.ts`, `src/core/pdf/operators.ts`, `src/services/pdfExportService.ts`):**
   - En pantalla (`getMarkupSvgDescriptor`), `squiggly` genera un `<path>` en zigzag sobre la base `rect.y + rect.height` con paso de 4 px y amplitud de 1.6 px (`fill="none"`, color de trazo por defecto `#e02424`).
   - En el flujo `/AP /N` (`emitMarkupOperators`) y en la exportación vectorial aplanada (`pdfExportService.ts`), emite operadores `m` / `l` / `S` a lo largo de `minY` con paso de 3 pt y amplitud de 1.2 pt, ampliando el `/BBox` en `±1.2 pt`.
4. **Persistencia e importación PDF (`src/core/pdf/incrementalWriter.ts`, `src/core/pdf/annotationReader.ts`):**
   - `mapMarkupTypeToPdfSubtype('squiggly')` devuelve `'Squiggly'` y escribe `/QuadPoints` junto a `Highlight`, `Underline` y `StrikeOut`.
   - `importPdfAnnotations` reconoce `/Subtype /Squiggly` tanto en marcas propias (`/REA`) como en anotaciones ajenas de Revu/Acrobat, reconstruyendo la caja desde `/QuadPoints` cuando está presente.

## Consecuencias

- Completa el trío de marcado de texto de revisión (`Underline`, `Squiggly`, `Strikethrough`) con interoperabilidad PDF ISO 32000-1 §12.5.6.10 de ida y vuelta.
- Cero dependencias nuevas y cero imports estáticos adicionales en el chunk principal.
