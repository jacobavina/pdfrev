# ADR-0121: Panel Forms

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Quinto de los paneles extra de Revu pendientes. Los campos de formulario (ADR-0027) solo se rellenaban sobre la página, uno
a uno, sin una vista de todo el formulario ni de lo que falta por rellenar.

## 2. Decisión

1. **Panel Forms** (pestaña del riel izquierdo y `View ▸ Panels ▸ Forms Panel`): los campos de texto, casillas, botones
   de opción, listas y desplegables del documento, por página, posición y nombre (orden natural). Los botones y las
   firmas no se listan (las firmas tienen su panel).
2. **Rellenar desde el panel:** texto (se guarda al salir del campo o con Enter; Escape descarta), casilla, botón de
   opción (deja marcado solo uno por grupo) y lista o desplegable con sus opciones. Usa la misma escritura que el visor
   (`fieldValue`), así que se ve sobre el plano y se guarda en el PDF como siempre; cada cambio es un paso de historial.
   Los campos bloqueados no se editan.
3. **Avance y navegación:** "N of M filled", botón *siguiente campo vacío* (desde la selección, dando la vuelta al
   final y saltando los bloqueados), *vaciar todo* (con Undo) y *exportar* los valores como CSV (`<archivo>_form.csv`:
   página, nombre, tipo y valor; las casillas salen como `Yes` / `Off` o con el valor de exportación del botón).

## 3. Alcance y límites

- No valida (campos obligatorios, formatos de fecha o número) ni calcula: REA no modela esas propiedades.
- No añade ni borra campos desde el panel: se crean con `Tools ▸ Form` y se borran como cualquier marca.
- Vaciar todo cuenta como dos pasos de historial como máximo (textos y marcas).

## 4. Pruebas

- `src/core/markup/formList.test.ts` (6): qué campos cuentan, valores, opciones, siguiente vacío, avance y CSV.
- `src/components/panels/FormsPanel.test.tsx` (10): lista, edición con Enter/Escape y Undo, casillas y grupos de opción,
  desplegable, bloqueados, siguiente vacío, vaciar, CSV, menú y pestaña.
- E2E `Forms (ADR-0121)`: una casilla real se marca desde el panel y se ve marcada sobre el plano.
