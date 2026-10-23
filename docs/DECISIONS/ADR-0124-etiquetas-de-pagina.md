# ADR-0124: Editar las etiquetas de página

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

REA ya leía las etiquetas de página del PDF (`/PageLabels`, ADR-0086) y las mostraba en las miniaturas, pero no se podían
crear ni cambiar. En un juego de planos la etiqueta es el número de lámina ("A-101"), no la posición en el archivo
(*Create Page Labels* de la oleada 2 de `docs/plan-v2/10-brecha-menus-revu.md`).

## 2. Decisión

1. **Document ▸ Page Labels…**: diálogo con una lista de rangos. Cada fila empieza en una página y llega hasta la siguiente:
   página de inicio, estilo (`1, 2, 3`, `I, II`, `i, ii`, `A, B`, `a, b` o solo prefijo), prefijo y primer número. Se
   pueden añadir y quitar filas; la vista previa muestra cómo se leerán las primeras 12 páginas.
2. **Escritura:** `writePageLabelRanges` guarda el árbol de números `/PageLabels` del catálogo (estilo `/S`, prefijo `/P`
   como texto Unicode, primer número `/St`). Si el primer rango no empieza en la página 1 se antepone uno decimal desde 1,
   como dicta ISO 32000-1 §12.4.2; sin rangos se quita `/PageLabels`; dos rangos en la misma página se quedan en uno.
3. **Lectura:** el diálogo abre con los rangos que el PDF ya tiene (`readPageLabelRanges`, que comparte el análisis con
   la lectura de etiquetas de siempre).
4. Al aplicar se actualizan las etiquetas del visor al instante y el documento queda modificado: hay que guardarlo.
   Validaciones: páginas entre 1 y el total, sin repetir, y primer número de 1 o más.

## 3. Alcance y límites

- No hay estilos propios de otros idiomas ni etiquetas por página suelta distintas de un rango.
- No es una operación con Undo, como el resto de cambios de bytes del documento; *Remove all labels* la deshace.
- Las etiquetas por posición se reinician al insertar o reemplazar páginas (ADR-0114, ADR-0123): hay que volver a definirlas.

## 4. Pruebas

- `src/core/pdf/pageLabelsWrite.test.ts` (6): ida y vuelta, PDF sin etiquetas, rango inicial automático, quitarlas,
  prefijos con acentos y que no cambie lo demás.
- `src/components/modals/PageLabelsDialog.test.tsx` (7): menú, vista previa, aplicar con dos rangos hasta el visor, reabrir con
  lo que el PDF ya tiene, validaciones, quitar rangos y todo, y Escape.
- E2E `Page Labels (ADR-0124)`: las miniaturas de la aplicación real muestran las etiquetas nuevas.
