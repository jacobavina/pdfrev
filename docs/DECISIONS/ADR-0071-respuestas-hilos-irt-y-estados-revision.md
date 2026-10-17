# ADR-0071: Respuestas en hilo (`/IRT /RT /R`) y preservación de transiciones de estado de revisión (`/StateModel Review`)

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Hito:** `A.1` (`docs/plan-v2/09-masterplan-completitud-revu.md`)

## Contexto

En flujos reales de revisión de ingeniería (escenario S1 de la matriz `06`), varios revisores intercambian respuestas anidadas sobre una misma marca y cambian su estado de revisión (`Accepted`, `Rejected`, `Completed`, `Cancelled`, `None`) a lo largo de varias rondas entre Bluebeam Revu, Adobe Acrobat y REA:
1. ISO 32000-1 §12.5.6.2 modela las respuestas como anotaciones `/Subtype /Text` con `/IRT <ref>` apuntando a la anotación padre (o a una respuesta previa en cadena) y `/RT /R` (siendo `/R` el valor por defecto cuando `/RT` se omite; `/RT /Group` se reserva para agrupaciones).
2. Hasta ahora, `importPdfAnnotations` solo interceptaba anotaciones con `/StateModel (Review)` y trataba cualquier otra anotación `/Subtype /Text` con `/IRT` como una nota adhesiva independiente (`stickyNote`), contaminando el plano con notas fantasma al abrir un PDF comentado en Revu o Acrobat.
3. Además, cuando una marca acumulaba múltiples transiciones `/StateModel (Review)` en el PDF, solo se conservaba el último estado y al guardar se reescribía una única anotación de estado, perdiendo el historial de transiciones previas.

## Decisión

1. **Modelo e inmutabilidad (`src/types/markup.ts`, `src/store/useMarkupStore.ts`):**
   - Se añaden `MarkupReply` (`{ id, author, text, createdAt, updatedAt }`) y `MarkupStatusTransition` (`{ status, author, createdAt }`) a `Markup` (`replies?: MarkupReply[]`, `statusHistory?: MarkupStatusTransition[]`), preservándolos en `migrateBbxDocument`.
   - Se incorporan en `useMarkupStore` los comandos deshacibles `addMarkupReply`, `updateMarkupReply` y `deleteMarkupReply`, y se amplía `updateMarkupStatus` para registrar la secuencia de transiciones en `statusHistory` con soporte exacto de `Undo/Redo`.
2. **Escritura e importación PDF ISO 32000-1 (`src/core/pdf/incrementalWriter.ts`, `src/core/pdf/annotationReader.ts`):**
   - Al guardar incrementalmente, el barrido de limpieza aplica clausura transitiva sobre `/IRT` (excluyendo `/RT /Group`) y `/Popup` para retirar toda la cadena de respuestas y estados de las marcas reescritas o borradas.
   - Cada respuesta en `markup.replies` se escribe como anotación estándar `/Subtype /Text` con `/IRT <rootObjNum> 0 R`, `/RT /R`, `/NM`, `/T`, `/Contents`, `/M`, `/CreationDate`, `/Open false` y `/F 4` (sin diccionario `/REA`, ya que no es una marca gráfica independiente).
   - Las transiciones de `markup.statusHistory` se escriben en orden encadenando `/IRT` con `/StateModel (Review)` y `/State`.
   - Al importar (`importPdfAnnotations`), `resolveRootParentId` resuelve transitivamente cualquier cadena `/IRT` (con guardia de ciclo hasta profundidad 32) hasta la marca raíz. Las respuestas y las transiciones de estado se ordenan cronológicamente (`createdAt`, con desempate por orden en `/Annots`), asignando `m.replies`, `m.status` (el último estado) y `m.statusHistory` (cuando hay más de una transición).
3. **Interfaz en `MarkupsList`, menú contextual y exportación (`src/components/MarkupsList.tsx`, `src/components/shell/CanvasContextMenu.tsx`, `src/services/exportService.ts`):**
   - `CanvasContextMenu` y el menú contextual de `MarkupsList` incluyen la acción `Reply…`, que abre la lista de marcas, despliega el hilo de la marca y enfoca el compositor inline (`reply-composer-row-${markup.id}`).
   - `MarkupsList` muestra el contador y botón de plegado/desplegado del hilo (`toggle-replies-btn-${markup.id}`, `markup-replies-count-${markup.id}`), filas hijas (`markup-reply-row-${reply.id}`) con edición inline y borrado, e incluye las respuestas en la búsqueda rápida, la exportación CSV y el reporte PDF.

## Consecuencias

- **Positivas:** Interoperabilidad bidireccional sin pérdidas con hilos de respuestas y estados de revisión de Bluebeam Revu y Adobe Acrobat; cero incremento de dependencias y cero imports estáticos nuevos en el chunk principal (`MarkupsList`, `CanvasContextMenu` y `exportService` siguen en sus fragmentos diferidos).
- **Verificación:** Cubierto por `src/core/pdf/repliesInterop.test.ts` (4 tests de ida y vuelta PDF, cadenas `/IRT` transitivas, historial `/StateModel (Review)` y árbol UI/exportación). La apertura del menú contextual con clic derecho en ventana nativa queda declarada para verificación del usuario al cierre.
