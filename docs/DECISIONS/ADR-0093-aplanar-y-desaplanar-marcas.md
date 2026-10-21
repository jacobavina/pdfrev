# ADR-0093: Aplanar y desaplanar marcas

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase E, Hito E.4

## 1. Contexto

`File ▸ Export ▸ PDF with Flattened Markups…` dibuja las marcas en el contenido de las páginas, y el resultado ya no
tiene marcas editables. Revu permite revertirlo (Unflatten) cuando el aplanado lo hizo la propia herramienta.

## 2. Decisión

1. Al aplanar, `exportMarkupsToPdf` apunta qué flujos de contenido tenía cada página y, al terminar, guarda en el
   diccionario Info del PDF (`/REAFlattened`, texto UTF-16) los flujos que añadió y las marcas aplanadas
   (`src/core/pdf/flattenRecord.ts`).
2. `File ▸ Export ▸ Unflatten Markups of This PDF` (`unflattenOpenDocument`):
   - quita esos flujos de cada página y borra el registro;
   - sustituye el documento abierto y añade las marcas a la lista;
   - el contenido original de la página queda idéntico.
3. Un PDF aplanado por otra herramienta no tiene el registro y no se puede desaplanar: se avisa con un mensaje claro.
4. Un aplanado sin nada que dibujar no deja registro.

## 3. Alcance y límites

- Los recursos que el aplanado añadió a la página (fuentes, formularios) se quedan; no se dibujan.
- La orden de lotes (Batch) del plan maestro no entra en este hito.
- Si se edita el contenido de una página después de aplanar con otra herramienta, el desaplanado solo quita los flujos
  que REA añadió.

## 4. Pruebas

- `src/core/pdf/flattenRecord.test.ts` (3).
- E2E `Aplanar y desaplanar (ADR-0093)`: exporta el PDF aplanado desde el menú, lo reabre con el selector de archivos y
  comprueba que la marca vuelve tras Unflatten.
