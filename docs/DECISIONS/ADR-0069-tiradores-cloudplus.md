# ADR-0069: Cloud+ con tiradores: la nube se redimensiona, la llamada queda fija

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0021 (puntos de control) y ADR-0039 (nube libre y tiradores)

## 1. Contexto

Una Cloud+ es un grupo de 2 marcas (nube `cloudPlus` + llamada `callout`) que comparten `groupId`. La capa de
puntos de control (`PdfViewer.tsx`) solo se renderizaba con `selectedMarkupIds.length === 1`, así que al
seleccionar una Cloud+ (length === 2) los tiradores nunca aparecían. La cloud normal (1 marca) sí se podía
redimensionar. El núcleo ya soportaba `cloudPlus` (`POLYGONIZABLE_TYPES` en `src/core/markup/controlPoints.ts`),
así que el fallo estaba en la capa de selección, no en la geometría.

## 2. Decisión

1. **Función pura** `editableControlPointTarget(selection: Markup[])` en `src/core/markup/controlPoints.ts`:
   - exactamente una marca → esa marca (comportamiento actual);
   - selección que es exactamente UN grupo (todas comparten el mismo `groupId`) → el miembro redimensionable:
     la nube (`cloud` o `cloudPlus`); la llamada queda fija y su directriz no se mueve;
   - cualquier otra selección (varios grupos, marcas sueltas, grupo sin nube) → `null`: sin tiradores.
2. La capa de puntos de control de `PdfViewer.tsx` usa esa función en lugar de `length === 1`.
3. El arrastre sigue pasando por `reshapeMarkup` sobre ese único miembro: un solo comando atómico de historial,
   de modo que **un solo Ctrl+Z** devuelve la nube a su forma anterior con la llamada intacta.

## 3. Pruebas (todas pueden fallar)

- Unitario `src/core/markup/controlPoints.test.ts` (8 pruebas): selección vacía, una marca, grupo cloud+callout
  → la nube, nube normal en grupo, dos grupos → null, grupo + suelta → null, sueltas → null, grupo sin nube → null.
- E2E `tests/e2e/pdf-viewer.spec.ts`: `Cloud+ con tiradores: la nube se redimensiona, la llamada queda fija y un
  Ctrl+Z revierte (ADR-0069)` — crea la Cloud+, aserta `control-points-layer`, arrastra la esquina, comprueba que
  la nube cambió de forma, que la llamada no se movió y que un Ctrl+Z devuelve la forma anterior.
- Sin regresiones: la cloud normal conserva sus tiradores (pruebas E2E de ADR-0021 y ADR-0041 intactas).

## 4. Verificación

- `npm.cmd test`: 802 pruebas en verde (94 → 95 archivos).
- `node scripts/verify.mjs --with-e2e --e2e-loop 3`: E2E 36/36 ×3, 13 tests cargo, bundle dentro del umbral.
- `npm.cmd run test:native` en frío: verde.