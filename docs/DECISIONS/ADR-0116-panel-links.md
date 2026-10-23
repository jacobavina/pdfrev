# ADR-0116: Panel Links

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Primero de los paneles extra de Revu pendientes (`docs/plan-v2/10-brecha-menus-revu.md`, oleada 3: Spaces, Links, Sets y
Flags). Los enlaces del documento solo se veían sobre la página; no había forma de revisarlos todos ni de encontrar los
rotos.

## 2. Decisión

1. Nueva pestaña **Links** en el riel izquierdo (icono de enlace) y `View ▸ Panels ▸ Links Panel`.
2. **Qué lista:** los hipervínculos de REA (marcas `link` con `linkUri` o `linkPage`, ocultas aparte) y los enlaces
   propios del PDF (anotaciones `Link` con dirección o destino interno, de todas las páginas). Un enlace de REA que el
   archivo también guarda como anotación no sale dos veces.
3. **Cómo:** agrupados por página y por posición vertical. Un clic en la fila lleva a la página del enlace y selecciona
   la marca; el botón de la fila lo sigue (abre la dirección o va a la página); la papelera borra los enlaces de REA con
   Undo (los del PDF y los bloqueados no se borran).
4. **Rotos:** sin destino, a una página que no existe en el documento o a una dirección que no es `http`, `https` ni
   `mailto` (la misma regla que aplica el comando nativo al abrirlos). Se marcan en la fila, se cuentan en la cabecera y
   el filtro (*All / Web and email / Go to page / Broken*) los separa. Los rotos no tienen botón de seguir.
5. La lectura de los enlaces del PDF es una pasada por las páginas, cancelable, que se repite al cambiar el documento.
6. `PanelShell` pasa a su propio archivo para que los paneles nuevos lo compartan con el dock.

## 3. Alcance y límites

- No comprueba que una dirección web responda: "roto" es lo que REA no puede abrir.
- Los enlaces del PDF no se editan ni se borran desde aquí: cambiarían el archivo original.
- La lista de enlaces del PDF no se actualiza con ediciones externas hasta reabrir el documento.

## 4. Pruebas

- `src/core/links/linkList.test.ts` (6): qué marcas cuentan, destinos, enlaces rotos, orden, agrupado y filtro.
- `src/components/panels/LinksPanel.test.tsx` (7): lista mezclada sin repetidos, rotos y filtro, seguir y borrar con
  Undo, documento sin enlaces, y menú y pestaña. Encontró un fallo de mi código: un destino con índice de página 0
  se descartaba por ser "falso".
- E2E `Panel Links (ADR-0116)`: crear un enlace real, verlo en el panel, seguirlo, borrarlo y recuperarlo con Undo.
