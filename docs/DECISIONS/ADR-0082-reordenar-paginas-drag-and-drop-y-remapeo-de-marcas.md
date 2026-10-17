# ADR-0082: Reordenación de Páginas con Drag & Drop, Botones de Desplazamiento y Remapeo de Marcas y Calibraciones

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Autor:** Jacob Aviña / Antigravity
- **Hito:** Fase C (Documento y Páginas, P5-C.1 / C.2)
- **Decisión anterior:** ADR-0016 (Operaciones de página básicas: rotar, eliminar, insertar y extraer sin reordenar) y ADR-0081 (Consolidación de cotas, Cloud+ adaptativo y menú Revu 21).

---

## Contexto y Necesidad de Producto

En Bluebeam Revu 21 y en flujos de revisión y preparación de planos de arquitectura e ingeniería, la organización del juego de planos exige reorganizar el orden de las páginas de un documento PDF (p. ej. mover una lámina de detalles técnicos o una carátula tras las plantas arquitectónicas).

Aunque REA contaba desde ADR-0016 con funciones puras para rotar, eliminar, insertar páginas en blanco y extraerlas en `pageOperations.ts`, la capacidad de **reordenar páginas** permanecía pendiente (marcada como brecha en la Matriz de Capacidades §1.5 y en el punto 2 de la auditoría de `09-masterplan-completitud-revu.md`):
1. No existía la función `reorderPdfPages(pdfBytes, fromIndex, toIndex)` ni el algoritmo formal de remapeo bidireccional de marcas (`remapMarkupsOnPageReorder`) ni de calibraciones y viewports de escala (`remapCalibrationsOnPageReorder`, `remapViewportsOnPageReorder`).
2. El panel lateral de miniaturas (`ThumbnailsSidebar.tsx`) permitía rotar, insertar, extraer y eliminar, pero no ofrecía botones directos de desplazamiento vertical (*Move Up* / *Move Down*) ni interacción de arrastre y soltado (*Drag & Drop*) para mover hojas visualmente.
3. Las operaciones de página carecían de una fila dedicada en `PARITY.md`.

---

## Decisiones Técnicas

### 1. Reordenación en el árbol de páginas del PDF (`reorderPdfPages`)
Se implementa en `src/core/pages/pageOperations.ts` sobre `pdf-lib`:
- Carga el documento `PDFDocument.load(pdfBytes, { ignoreEncryption: true })`.
- Valida que $0 \le \text{fromIndex} < \text{totalPages}$ y $0 \le \text{toIndex} < \text{totalPages}$.
- Si $\text{fromIndex} === \text{toIndex}$, devuelve los bytes originales de forma no destructiva sin recalcular.
- Extrae la referencia de la página de origen con `const page = pdfDoc.getPage(fromIndex)`, retira su entrada en el catálogo con `pdfDoc.removePage(fromIndex)` y la reinserta en la posición destino con `pdfDoc.insertPage(toIndex, page)`.
- Esto preserva de forma atómica y pura todos los recursos, secuencias de contenido, diccionarios de fuentes y metadatos de la página sin necesidad de clonar el documento entero.

### 2. Algoritmo de Remapeo Bidireccional de Marcas y Calibraciones
Sea $p$ el índice de página original ($0$-based) de una marca o escala.
- **Caso $\text{fromIndex} < \text{toIndex}$ (desplazamiento hacia adelante):**
  - Si $p = \text{fromIndex} \implies p' = \text{toIndex}$.
  - Si $\text{fromIndex} < p \le \text{toIndex} \implies p' = p - 1$.
  - En cualquier otro caso $\implies p' = p$.
- **Caso $\text{fromIndex} > \text{toIndex}$ (desplazamiento hacia atrás):**
  - Si $p = \text{fromIndex} \implies p' = \text{toIndex}$.
  - Si $\text{toIndex} \le p < \text{fromIndex} \implies p' = p + 1$.
  - En cualquier otro caso $\implies p' = p$.

Se implementan las funciones puras e inmutables:
- `remapMarkupsOnPageReorder(markups: Markup[], fromIndex: number, toIndex: number): Markup[]`
- `remapRecordOnPageReorder<T>(record: Record<number, T>, fromIndex: number, toIndex: number): Record<number, T>`
- `remapCalibrationsOnPageReorder` y `remapViewportsOnPageReorder`.

### 3. Servicio de Integración y Actualización de Estado (`executeReorderPage`)
En `src/services/pageService.ts`:
- Ejecuta `reorderPdfPages` y carga el nuevo `pdfDoc` con `loadPdfDocument`.
- Aplica el remapeo de marcas en `useMarkupStore` y de calibraciones y viewports en `useCalibrationStore`.
- Actualiza `currentPageIndex` para seguir a la página activa tras el desplazamiento.
- Marca el estado del documento como sucio (`markDirty()`) para que `Ctrl+S` o el autoguardado sincronicen la nueva disposición del PDF.
- Notifica al usuario con un mensaje toast ergonómico (`Page X moved to position Y`).

### 4. Interfaz de Usuario en Miniaturas (`ThumbnailsSidebar.tsx`)
- **Botones accesibles:** Acciones contextuales en cada miniatura con `ChevronUp` (Subir página, deshabilitado en página 0) y `ChevronDown` (Bajar página, deshabilitado en la última página), con iconos estrictamente de 16 px (`size={16}`).
- **Drag & Drop nativo:** Atributo `draggable` en `ThumbnailItem` con `dataTransfer.setData('text/plain', String(pageIndex))`, indicador visual de soltado (`isDragOver` con tokens semánticos `border-cad-accent` y `bg-cad-hover`), garantizando paridad total con la experiencia fluida de Bluebeam Revu.

---

## Consecuencias y Verificación

1. **Paridad con Revu 21:** Resuelve la brecha §1.5 (línea 102) de la Matriz de Capacidades y el hallazgo 2 del Masterplan.
2. **Seguridad y Cero Regresiones:** El algoritmo de remapeo es determinista, probado con suites de pruebas unitarias exhaustivas en avance, retroceso y límites.
3. **Presupuesto del Bundle:** Utiliza `ChevronUp` y `ChevronDown` ya presentes en el bundle principal, sin añadir dependencias externas, preservando el margen de $\le 800.00$ kB.
