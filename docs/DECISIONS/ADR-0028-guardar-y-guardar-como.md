# ADR-0028: Guardar, Guardar como y menú Export

- **Estado:** Aceptado (reporte del usuario, 2026-10-12: "no tengo la opción de guardar, exportar, guardar como…")
- **Fecha:** 2026-10-12

## 1. Contexto

"Guardar en el PDF" solo se habilitaba con un archivo abierto desde disco y cambios pendientes: con el documento de
demostración (o uno sin ruta) no había forma de guardar, y no existía "Guardar como". Las exportaciones estaban
sueltas en el menú Archivo.

## 2. Decisión

1. **Save (Ctrl+S)**: activo siempre que haya documento. Con archivo, escribe en él (incremental + .bbx.json); sin
   archivo, hace Save As.
2. **Save As… (Ctrl+Shift+S)**: diálogo nativo con filtro PDF (añade `.pdf` si falta), escritura atómica con el
   comando `save_pdf`, y el documento pasa a ser ese archivo (título, autoguardado del sidecar y siguientes Save).
   En el navegador descarga el PDF con las marcas.
3. Solo se marca como guardado si el PDF y el sidecar se escribieron; cancelar o fallar deja los cambios pendientes.
4. **File ▸ Export ▸**: PDF with Flattened Markups, Markups List (CSV), Markup Summary Report (PDF). En la cinta:
   Open, Save, Save As y Export.

## 3. Evidencia

`src/services/documentSaveService.test.ts`, `src/components/shell/Shell.test.tsx` y el E2E P2-C.5 (Ctrl+S descarga
el PDF en el documento de demostración).
