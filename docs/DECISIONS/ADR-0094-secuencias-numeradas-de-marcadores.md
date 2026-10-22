# ADR-0094: Secuencias numeradas de marcadores

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase F, Hito F.6 (secuencias)

## 1. Contexto

En una revisión se numeran incidencias, puertas o puntos de inspección (1, 2, 3…, A, B, C…). Hacerlo con cuadros de
texto a mano obliga a escribir cada número y a llevar la cuenta.

## 2. Decisión

1. **Herramienta `Numbered Sequence`** (grupo Text & Review de la cinta, icono Lucide `ListOrdered`): cada clic coloca
   el siguiente número como un cuadro de texto de 30 × 22 pt, centrado en el clic, con borde, fondo blanco, texto
   centrado en negrita, Subject `Sequence` y `customFields.sequenceIndex`.
2. **Núcleo puro `src/core/markup/sequences.ts`:** formatos `1, 2, 3`, `A, B, C` (continúa AA, AB… como una hoja de
   cálculo), `a, b, c`, `I, II, III` y `i, ii, iii` (hasta 3999), con prefijo y sufijo.
3. **Estado en `useToolStore`:** `sequence` (formato, prefijo, sufijo, siguiente) y `takeNextSequence`, que devuelve el
   texto y avanza el contador. El panel de Propiedades (con la herramienta activa) permite elegir formato, prefijo,
   sufijo y el siguiente número, y muestra el siguiente marcador.
4. El marcador es una marca `text` normal, así que se guarda y se lee en el PDF como /FreeText con su /AP, y se edita,
   mueve y cuenta en la lista de marcas como cualquier otra.

## 3. Alcance y límites

- Los perfiles de interfaz (Review, Takeoff, Field, Custom) que el plan maestro agrupa con las secuencias en F.6 no
  entran en este hito.
- El contador no se persiste entre sesiones ni se recalcula al borrar marcadores.

## 4. Pruebas

- `src/core/markup/sequences.test.ts` (3).
- `src/components/SequenceFlow.test.tsx` (2).
- E2E `Secuencias numeradas (ADR-0094)`.
