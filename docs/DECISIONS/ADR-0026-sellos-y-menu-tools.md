# ADR-0026: Sellos predeterminados y menú Tools con submenús

- **Estado:** Aceptado (pedidos del usuario, 2026-10-11)
- **Fecha:** 2026-10-11

## 1. Decisión

1. **Sellos** (`core/markup/stamps.ts`): 19 sellos de revisión de obra como los de Revu/Foxit (APPROVED, APPROVED AS
   NOTED, NO EXCEPTIONS TAKEN, MAKE CORRECTIONS NOTED, REVISE AND RESUBMIT, REJECTED, REVIEWED, FOR CONSTRUCTION, NOT
   FOR CONSTRUCTION, PRELIMINARY, FOR INFORMATION ONLY, AS-BUILT, COMPLETED, VOID, DRAFT, FINAL, REVISED, CONFIDENTIAL,
   FOR COMMENT). Doble marco del color del sello, título en Helvetica-Bold y subtítulo dinámico con autor y fecha.
   Un clic coloca el sello a su tamaño; arrastrar define la caja. Misma distribución en pantalla, /AP y aplanado.
2. En el PDF: anotación /Stamp con /Name estándar cuando existe (Approved, NotApproved, Draft, Final, Confidential,
   ForComment) y /AP con fuentes Helvetica y Helvetica-Bold; ida y vuelta exacta.
3. **Cinta**: grupo Stamp (botón y lista con vista previa de cada sello).
4. **Menú Tools** como en Revu: submenús Markup ▸, Stamp ▸ y Measure ▸ (sustituyen a los menús Markup y Measure).

## 2. Pendiente (siguiente lote)

Tools ▸ Hyperlink, File Attachment, Form (campos de formulario) y Signature; sellos personalizados e imagen.

## 3. Evidencia

`src/core/markup/stamps.test.ts`, `PdfViewerDimension.test.tsx`, `Shell.test.tsx` y el E2E de ADR-0024/0025/0026.
