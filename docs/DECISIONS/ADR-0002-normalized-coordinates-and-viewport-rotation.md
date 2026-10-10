# ADR-0002: Coordenadas Normalizadas [0..1] y Rotación Unificada de Viewport

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Autores:** Equipo REA

---

## 1. Contexto
Los planos técnicos de arquitectura e ingeniería civil presentan múltiples sistemas de referencia:
1. Puntos PDF estándar (72 pt/pulgada con origen en la esquina inferior izquierda).
2. Píxeles de pantalla del WebView (dependientes del nivel de zoom, tamaño de monitor y escalado DPI).
3. Orientación intrínseca de página (`/Rotate` en el diccionario de la página PDF, típicamente 0°, 90°, 180° o 270°).
4. Rotación interactiva de visualización seleccionada por el usuario.

Si las marcas se guardan en píxeles de pantalla o en puntos absolutos sin considerar la rotación compuesta, al cambiar de resolución, nivel de zoom o al rotar la vista, las marcas se desalinean o desaparecen.

---

## 2. Alternativas Consideradas
1. **Guardar en píxeles de pantalla:** Descartado inmediatamente. Incompatible con zoom, redimensionamiento de ventana y exportación vectorial a escala real.
2. **Guardar en puntos PDF sin normalizar:** Descartado para el modelo en memoria. Dificulta el renderizado SVG reactivo y la portabilidad entre diferentes vistas.
3. **Guardar en coordenadas normalizadas `[0..1]` y unificar rotación en el Viewport:** Cada punto se define como una fracción entre 0 y 1 respecto al ancho y alto de la página visual. La rotación física (`page.rotate`) y la rotación del usuario se suman de manera modular `(((page.rotate + storeRotation) % 360) + 360) % 360` y se suministran a `page.getViewport({ scale, rotation: totalRotation })`.

---

## 3. Decisión
Adoptar coordenadas normalizadas `[0..1]` para el modelo de datos persistido (`MarkupPoint`) y canalizar toda transformación de coordenadas a través de funciones puras parametrizadas por el `ViewportTransform` unificado.

Anclas de implementación verificadas:
- En `src/utils/coordinates.ts` (línea 15, función `pdfToNormalizedWithViewport`).
- En `src/utils/coordinates.ts` (línea 32, función `normalizedToPdfWithViewport`).
- En `src/utils/coordinates.ts` (línea 79, función `normalizedToScreen`).
- En `src/utils/coordinates.ts` (línea 93, función `screenToNormalized`).
- En `src/utils/coordinates.ts` (línea 507, función `clampTranslationDelta`).
- En `src/utils/coordinates.ts` (línea 545, función `clampGroupTranslationDelta`).
- En `src/services/pdfService.ts` (líneas 60-65, cálculo de variable `totalRotation` combinando `page.rotate` con `storeRotation` para alimentar `page.getViewport`).

---

## 4. Consecuencias
- **Positivas:** Las marcas permanecen exactamente fijadas a sus elementos arquitectónicos sin importar zoom ni rotación; los límites de traslación se garantizan matemáticamente con `clampTranslationDelta` para impedir marcas extraviadas fuera del plano.
- **Negativas / Mitigaciones:** Toda conversión requiere consultar las dimensiones del viewport actual, lo cual se centralizó en utilidades puras con pruebas de regresión en las 4 rotaciones.

---

## 5. Evidencia
- En `src/utils/coordinates.test.ts`, la prueba `Sub-entregable 0.5: Rotación Unificada (0°, 90°, 180°, 270°) y Viewport de PDF.js` comprueba que un punto de control rota y proyecta exactamente sobre las 4 rotaciones contrastado contra el viewport real de PDF.js sobre `test-blueprint-rotated.pdf`.
