# ADR-0117: Flags

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Segundo de los paneles extra de Revu pendientes (tras Links, ADR-0116). Hacía falta una forma de dejar una marca
señalada para volver a ella, sin cambiar su estado de revisión (pendiente, aceptada…) ni su comentario.

## 2. Decisión

1. **La bandera** es el campo propio `flagged = 1` de la marca. Viaja con el archivo en el diccionario de REA (ya se
   escriben y leen los campos propios), se conserva al copiar, pegar y duplicar, y no cambia nada más de la marca.
2. **Poner y quitar:** `Edit ▸ Flag / Remove Flag`, `Flag` en el menú contextual y `Ctrl+Alt+F`. Sobre una selección,
   si todas las marcas la tienen se quita y si no se pone a todas. Un solo paso de historial (Undo).
3. **Sobre la hoja** se dibuja una bandera ámbar en la esquina superior derecha de la marca (directrices incluidas). Es
   una ayuda de pantalla: no se imprime, no se aplana y no cambia el dibujo del PDF.
4. **Panel Flags** (pestaña del riel izquierdo y `View ▸ Panels ▸ Flags Panel`): las marcas con bandera por página y
   posición, con su comentario (o el tipo y la medida), autor y estado; filtro *All flags / This page*. Un clic va a la
   marca y la selecciona; el botón de la fila quita la bandera; *Remove all* quita todas (con Undo). Las marcas ocultas
   no salen.

## 3. Alcance y límites

- Solo hay una bandera por marca y un color; no hay banderas con nombre ni asignadas a personas.
- Otros visores de PDF no muestran la bandera: es una nota de REA.
- No filtra la lista de marcas ni añade una columna al CSV; el panel es el sitio donde se ven.

## 4. Pruebas

- `src/core/markup/flags.test.ts` (6): poner y quitar sin dejar rastro, respeto a otros campos, valor 1 (también como
  texto al leer el PDF), orden, título y posición de la bandera.
- `src/components/panels/FlagsPanel.test.tsx` (8): lista, ir a la marca y filtro, quitar y *Remove all* con Undo, menú,
  atajo y bandera sobre la hoja, menú View y pestaña, ida y vuelta por el PDF, y copiar y pegar.
- E2E `Flags (ADR-0117)`: la combinación de teclas sobre el plano real, la bandera en pantalla y el panel.
