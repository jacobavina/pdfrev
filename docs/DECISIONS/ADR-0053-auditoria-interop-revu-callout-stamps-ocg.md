# ADR-0053: Auditoría de interoperabilidad: diámetro de Revu, callout estándar (/FreeTextCallout), sellos /Stamp ajenos y capas /OCG ocultas

- **Estado:** Aceptado
- **Fecha:** 2026-10-15
- **Amplía:** ADR-0042 (Callout), ADR-0045 (Sellos), ADR-0046 (Capas /OCG) y ADR-0051 (Mediciones de Revu)

## 1. Contexto

Al auditar en profundidad las entregas desde la nube libre (ADR-0039 a ADR-0052) frente a PDFs generados por Bluebeam Revu, Adobe Acrobat y Foxit PDF Editor, se detectaron cuatro asimetrías entre la escritura (`incrementalWriter.ts`) y la lectura (`annotationReader.ts`):

1. **Diámetro de Revu (`diameter`)**: `incrementalWriter.ts` escribía `/Subtype /Circle`, `/IT /PolygonRadius` y `/MeasurementTypes 384`, pero `annotationReader.ts` importaba cualquier círculo con `/PolygonRadius` como `radius` (ignorando `/MeasurementTypes 384` y no incluyendo `'diameter'` en `RECOMPUTED_MEASURES`).
2. **Callout estándar (`/FreeTextCallout`)**: `incrementalWriter.ts` escribía `/Subtype /FreeText`, `/IT /FreeTextCallout`, `/CL` (punta, codo, anclaje), `/RD` (márgenes entre `/Rect` envolvente y la caja de texto) y `/LE` escalar (`/OpenArrow`). Sin embargo, `annotationReader.ts` importaba todo `/FreeText` sin diccionario `/REA` como `textBox` usando `/Rect` completo, ignoraba `/CL` y `/RD`, y solo leía `/LE` cuando era un `PDFArray`.
3. **Sellos `/Stamp` de otras aplicaciones**: `annotationReader.ts` rechazaba `/Subtype /Stamp` cuando la anotación no tenía diccionario `/REA`, incrementando `foreignUnsupportedCount` en lugar de reconstruir un sello editable con el catálogo de REA.
4. **Capas `/OCG` ocultas al abrir (`hiddenLayers`)**: `incrementalWriter.ts` guardaba las capas ocultas en `/OCProperties /D /OFF`, pero `annotationReader.ts` y `fileDialogService.ts` no restauraban `hiddenLayers` en `useMarkupStore` al abrir el PDF.

## 2. Decisión

1. **Diámetro de Revu**:
   - Si una anotación `/Circle` ajena lleva `/MeasurementTypes 384` (o `/IT /PolygonDiameter`), se importa como `diameter`, con sus dos puntos extremos sobre el diámetro horizontal del círculo y valor recalculado con `calculateLength`.
   - Se añade `'diameter'` a `RECOMPUTED_MEASURES`.
2. **Callout estándar (`/FreeTextCallout`)**:
   - Toda anotación `/FreeText` con `/IT /FreeTextCallout` o con vector `/CL` de al menos 4 números se importa como `callout`.
   - Si lleva `/RD [dl, db, dr, dt]`, la caja de texto se obtiene restando esos márgenes al `/Rect` envolvente antes de normalizar las coordenadas.
   - El primer brazo de `leaders` se reconstruye con la punta `(CL[0], CL[1])` y el codo `(CL[2], CL[3])`.
   - `/LE` se lee tanto cuando es `PDFArray` como cuando es `PDFName` escalar (como exige ISO 32000-1 §12.5.6.6 para `/FreeTextCallout`).
3. **Sellos `/Stamp` ajenos**:
   - `/Subtype /Stamp` se acepta para anotaciones sin `/REA`, mapeando `/Name` (p. ej. `/Approved`, `/Draft`, `/RevuApproved`, `/SHSignHere`) al catálogo `STAMPS` y reconstruyendo el subtítulo dinámico con autor (`/T`) y fecha (`/M`).
4. **Capas `/OCG` apagadas en `/OCProperties /D /OFF`**:
   - `importPdfAnnotations` devuelve `hiddenLayers: string[]` con los nombres de las capas de marcas listadas en `/OCProperties /D /OFF`.
   - `fileDialogService.ts` restaura `hiddenLayers` en `useMarkupStore` al abrir el documento.

## 3. Evidencia

- `src/core/pdf/revuMeasureInterop.test.ts`
- `src/core/pdf/markupLayersOcg.test.ts`
