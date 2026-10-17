# ADR-0070: Higiene del bundle principal (`documentSaveService` diferido) y enmienda de alcance para las Fases A–F

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0028 (Save y Save As), ADR-0064 (estructura y densidad) y `docs/plan-v2/09-masterplan-completitud-revu.md`

## 1. Contexto

1. El chunk principal (`dist/assets/index-*.js`) estaba en **785.40 kB** frente al presupuesto duro de **800.00 kB** (margen de 14.60 kB). Durante la compilación de Vite, `src/services/documentSaveService.ts` generaba el aviso de mezcla de import dinámico (`App.tsx`, `useAutoSave.ts`) e import estático (`MenuBar.tsx`, `QuickAccessToolbar.tsx`), impidiendo que Rollup lo separara en un chunk propio.
2. El usuario aprobó el Plan Maestro de Completitud Funcional frente a Bluebeam Revu (`docs/plan-v2/09-masterplan-completitud-revu.md`) organizado en las **Fases A–F** (cerradas con los escenarios de producto S1–S5 de `docs/plan-v2/06-matriz-capacidades-revu.md`). Conforme a `AGENTS.md`, `docs/SCOPE.md` debe reflejar explícitamente el alcance aprobado antes de implementar los hitos funcionales.

## 2. Decisión

1. **Desacoplamiento de `documentSaveService.ts` del chunk principal (`A.0`):**
   - Sustituir los imports estáticos de `saveDocumentAs` en `src/components/shell/MenuBar.tsx` y `src/components/shell/QuickAccessToolbar.tsx` por `import('../../services/documentSaveService').then((m) => m.saveDocumentAs())`.
   - De este modo, `documentSaveService.ts` pasa a emitirse como chunk diferido independiente (`dist/assets/documentSaveService-*.js`, ~2.52 kB) y el chunk principal baja de **785.40 kB** a **783.37 kB**.
2. **Regla estricta de presupuesto de bundle para Fases A–F:**
   - Ningún hito puede añadir imports estáticos nuevos al chunk principal; todo módulo o diálogo nuevo debe cargarse mediante `React.lazy` o `import()` dinámico.
3. **Enmienda de `docs/SCOPE.md`:**
   - Incorporar la sección 4 con el alcance aprobado de las **Fases A–F** según `docs/plan-v2/09-masterplan-completitud-revu.md` (excluyendo explícitamente Bluebeam Studio y plugins de creación desde Office/CAD).

## 3. Pruebas (todas pueden fallar)

- Unitario `src/services/documentSaveService.test.ts`: `MenuBar y QuickAccessToolbar cargan documentSaveService de forma diferida sin import estático en el chunk principal (ADR-0070)` — verifica en el código fuente que ni `MenuBar.tsx` ni `QuickAccessToolbar.tsx` importan estáticamente `documentSaveService` y que ambos usan `import('../../services/documentSaveService')`.

## 4. Verificación

- `npm.cmd test`: 803 pruebas en verde (95 archivos).
- `node scripts/verify.mjs --with-e2e --e2e-loop 3`: E2E 36/36 ×3, 13 tests cargo, bundle principal 783.37 kB <= 800.00 kB.
