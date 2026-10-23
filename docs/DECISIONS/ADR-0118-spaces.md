# ADR-0118: Spaces

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Tercero de los paneles extra de Revu pendientes (tras Links y Flags). En un plano de obra o de takeoff se miden las
salas con mediciones de área, pero no había forma de darles número y nombre ni de ver todas juntas con sus totales.

## 2. Decisión

1. **Un espacio es una medición de área** (`area` con medida) con los campos propios `isSpace = 1`, `spaceNumber` y
   `spaceName`. No hay un tipo de marca nuevo: el área, su relleno, sus recortes, su escala y su medida se comportan
   igual, y las ediciones de la forma recalculan lo de siempre.
2. **El nombre sobre el plano:** número y nombre se escriben también como la etiqueta de la medición (`measureLabel`,
   "101 · Sala de juntas"), que REA ya dibuja junto a la medida y escribe en el PDF. Así se ve en pantalla, al imprimir,
   al aplanar y en otros visores, sin dibujos extra. Convertir un área que ya tenía etiqueta usa esa etiqueta como nombre.
3. **Crear:** `Edit ▸ Make Space`, `Make Space` en el menú contextual (si hay áreas seleccionadas) y el botón del
   panel. Las áreas seleccionadas pasan a espacios con "Space 1", "Space 2"… (el primer número libre).
4. **Panel Spaces** (pestaña del riel y `View ▸ Panels ▸ Spaces Panel`): niveles (la etiqueta de página del PDF o
   "Page N") con subtotal de área, filas con número y nombre editables (se guardan al salir del campo o con Enter;
   Escape descarta), área y perímetro, un botón para ir al espacio, un × para dejar de tratarlo como espacio y el total
   al pie. Orden por número natural (2 antes que 10). Unidades distintas no se suman entre sí.
5. **Exportar:** el botón CSV guarda `<archivo>_spaces.csv` con nivel, número, nombre, área, perímetro y unidad
   (UTF-8 con BOM, comillas RFC 4180).
6. Cada cambio es un paso de historial (nuevo `replaceMarkups`); las marcas bloqueadas no se convierten ni se editan.

## 3. Alcance y límites

- Un espacio es una región dibujada a mano: no se detecta desde las paredes del plano.
- No hay niveles propios distintos de las páginas ni jerarquía (planta ▸ zona ▸ sala).
- Los espacios ocultos (ADR-0109) no salen en el panel ni en el CSV.

## 4. Pruebas

- `src/core/measurements/spaces.test.ts` (7): qué es un espacio, etiqueta, quitar sin perder otros campos, nombre
  automático, orden natural, totales por unidad y filas del CSV.
- `src/components/panels/SpacesPanel.test.tsx` (9): crear, edición con Enter/blur/Escape y Undo, niveles y totales, ir a
  un espacio y quitarlo, bloqueadas, CSV, menús y pestaña, e ida y vuelta por el PDF.
- E2E `Spaces (ADR-0118)`: un área real pasa a espacio, se nombra y el nombre sale sobre el plano.
