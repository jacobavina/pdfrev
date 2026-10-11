# ADR-0018: Flechas, tipos de línea, extremos y estilo al dibujar

- **Estado:** Aceptado (pedido del usuario, 2026-10-11: "¿no hay flechas con tipo de línea, etc.?")
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA (implementado por Claude Opus 5.5)

---

## 1. Contexto

El modelo ya tenía `lineEndingStart/End` y `dashArray`, pero:

- No había herramienta **Flecha**; los extremos solo se cambiaban desde Propiedades después de dibujar.
- La punta **cerrada** salía hueca (se rellenaba con `fillColor`, que por defecto es transparente).
- Las puntas **no se escribían en la apariencia `/AP`**: en Revu/Acrobat la flecha aparecía como una línea sin punta.
- `/LE` perdía cuadrado y rombo; las polilíneas no admitían extremos.
- El patrón discontinuo era fijo en píxeles (no escalaba con el zoom ni con el grosor) y solo había "discontinuo".
- "Exportar PDF" aplanado **omitía** polilíneas, subrayado, tachado y todas las mediciones.
- Los atajos de una letra que anunciaban los tooltips (V, T, R, O, L, P, F, C, K) no estaban implementados.

## 2. Decisión

1. **Geometría única de extremos** (`src/core/markup/lineEndings.ts`): flecha abierta/cerrada, círculo, cuadrado,
   rombo; tamaño proporcional al grosor (`lineEndingSize`). La consumen la pantalla (`render.ts`), la apariencia
   `/AP` (`core/pdf/operators.ts`) y el aplanado (`pdfExportService.ts`). Formas cerradas rellenas con el color de
   trazo; se dibujan sólidas aunque la línea sea discontinua.
2. **Tipos de línea** (`src/core/markup/lineStyles.ts`): continua, discontinua, punteada, trazo y punto; patrones en
   pt proporcionales al grosor; la pantalla los escala con el zoom. `/BS << /S /D /D [...] >>` en el PDF y lectura
   de vuelta en el importador.
3. **Herramienta Flecha** (`ToolType 'arrow'`, atajo A): crea una marca `line` con extremo final de la cinta o, si
   es "Ninguno", flecha cerrada. Vista previa idéntica al resultado.
4. **Cinta → Estilo (marcas nuevas)**: color de trazo, relleno translúcido o ninguno, grosor (0.5–8 pt), tipo de
   línea, extremo inicial y final, opacidad. **Propiedades**: los cuatro tipos de línea y extremos para líneas y
   polilíneas; el patrón se recalcula al cambiar el grosor.
5. **Aplanado completo**: los tipos sin dibujo propio se pintan con el mismo emisor del `/AP` como Form XObject, más
   la etiqueta de valor de las mediciones.
6. **Atajos de una letra** implementados para todas las herramientas que los anuncian.

## 3. Consecuencias

- La flecha que se ve en REA es la que se ve en Revu/Acrobat (misma geometría en `/AP`). Pendiente: verificación del
  usuario en Revu y Acrobat.
- Las etiquetas de medición todavía no se escriben en el `/AP` de las anotaciones (sí en el aplanado).
- La línea no se acorta bajo la punta: con grosores grandes el extremo de la línea puede asomar en la punta.

## 4. Evidencia

`src/core/markup/lineStyles.test.ts`, `src/core/pdf/lineStylesInterop.test.ts` (AP, `/LE`, `/BS`, ida y vuelta,
aplanado), `src/components/PdfViewerArrow.test.tsx` y E2E "Flechas y tipos de línea (ADR-0018): …", con
`node scripts/verify.mjs --with-e2e --e2e-loop 3` en verde.
