# ADR-0054: Sincronización en ambos sentidos y alineación en la vista lado a lado (Split View)

- **Estado:** Aceptado
- **Fecha:** 2026-10-15
- **Amplía:** ADR-0049 (Vista lado a lado) y ADR-0050 (Alineación por puntos en Overlay Pages)

## 1. Contexto

En ADR-0049 la vista lado a lado (`SplitPane`) solo seguía al visor principal en un sentido (`main` → `split`). Al desplazar el plano desde el panel derecho o al cambiar de página en `SplitPane` comparando con otro PDF, el visor principal permanecía inmóvil. Además, si el usuario había alineado las dos hojas mediante `useOverlayStore` (`matrix`, `offset`), la vista lado a lado no aplicaba esa transformación al centrar la zona equivalente.

## 2. Decisión

1. **Sincronización en ambos sentidos (`main` ↔ `split`)**:
   - `useSplitStore` incorpora `splitView: { pageIndex, nx, ny } | null` y `driver: 'main' | 'split' | null`.
   - Cuando el usuario desplaza el visor principal, se publica `setMainView` (`driver: 'main'`) y `SplitPane` centra su scroll usando `programmaticScrollRef` para ignorar el evento `scroll` resultante.
   - Cuando el usuario desplaza `SplitPane` (`#split-scroll`), se publica `setSplitView` (`driver: 'split'`) y `PdfViewer` centra su scroll con `setScrollProgrammatically`, evitando rebotes infinitos.
   - Cuando `sync` está activo y se compara con otro PDF (`sourceBytes !== null`), los botones `split-prev` y `split-next` también actualizan `currentPageIndex` en el visor principal.
2. **Alineación entre hojas**:
   - `mainToSplitCenter` aplica `invertAffine(matrix, offset, q)` y `splitToMainCenter` aplica `applyAffine(matrix, offset, p)` en puntos de página (`pt`), de modo que `SplitPane` y `PdfViewer` mantienen centrada la misma zona física del plano incluso cuando las dos revisiones tienen desfase, giro o cambio de escala.

## 3. Evidencia

- `src/components/viewer/SplitPane.test.tsx`
- `tests/e2e/pdf-viewer.spec.ts`
