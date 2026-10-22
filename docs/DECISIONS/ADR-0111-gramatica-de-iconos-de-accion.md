# ADR-0111: Gramática de iconos de acción y revisión de los menús

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

El usuario señaló que el icono de Offset no se entendía y pidió revisar todos. Auditoría de `MenuBar.tsx` y la cinta:
`CopyPlus` servía a Duplicate, Offset y Multiply; `EyeOff` a Hide y a tres entradas de redacción; `FileDown` a Export,
Flatten y Unflatten; `Columns2` a Align & Flip, Side by Side y dos comparaciones; `Paintbrush` a Copy Format y Paste
Format; `ZoomIn` a Zoom In y Zoom Window. Tres entradas de acción distintas con el mismo dibujo no se distinguen.

## 2. Decisión

**Una acción, un dibujo.** Reglas (también en `docs/DESIGN.md` §4):

1. Ningún icono de acción comparte dibujo con otro de su mismo menú.
2. Lo que se **copia, repite o desplaza** va en trazo discontinuo; el original, en trazo pleno.
3. Los pares *copiar / aplicar* usan verbos distintos: **pipeta** para Copy Format y **brocha** para Paste Format.
4. Las mediciones llevan el marco de regla violeta (`icon-measure`); ninguna medición queda sin él (Fill lo perdía).

Cambios: iconos propios nuevos `OffsetIcon` (dos esquinas concéntricas, la interior discontinua), `MultiplyIcon`
(original y tres copias discontinuas), `PasteInPlaceIcon` (portapapeles con mira), `RedactIcon` (texto con barra),
`FlattenIcon` / `UnflattenIcon` (flechas hacia / desde la línea central, esta discontinua) y `FillMeasureIcon`. De
Lucide: `Pipette`, `Paintbrush`, `LassoSelect`, `History`, `Merge` (Combine), `Diff` (comparar), `Blend` (Overlay Pages),
`ScanSearch` (Zoom Window), `ShieldCheck`, `FileSearch`, `PanelRightOpen`, `ListStart`, `RotateCwSquare`, `ListX`,
`Crosshair` (Snap to Grid, porque el imán se leía como un gancho a 16 px).

## 3. Alcance y límites

- Se revisaron las capturas de los menús Edit, View, Document y Tools y de las pestañas Markup, Measure e Insert a 2×
  y 3×. Los iconos de las herramientas de dibujo y de medición ya eran coherentes y no se tocaron.
- Los iconos de Lucide que se repiten por motivo (por ejemplo `Layers` en Layers Panel) se dejan.

## 4. Pruebas

Visual (capturas con Playwright a 2× y 3×) y tipos; el resto lo cubren las pruebas de menús existentes, que buscan por
`data-testid` y no por icono. `src/designScale.test.ts` sigue vigilando tamaños de texto y sombras.
