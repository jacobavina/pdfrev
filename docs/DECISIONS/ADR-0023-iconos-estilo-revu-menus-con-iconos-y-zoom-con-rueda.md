# ADR-0023: Íconos estilo Revu, menús con íconos, atajos de vista de Revu y zoom con rueda

- **Estado:** Aceptado (pedido del usuario, 2026-10-11, con capturas de Revu 21)
- **Fecha:** 2026-10-11

## 1. Contexto

El usuario pidió que los íconos de medición y de marcado se vean como los de Revu, que las listas desplegables
(menús) lleven íconos y que el control de zoom del doble clic acerque/aleje también con la rueda.

## 2. Decisión

1. **Íconos propios** (`shell/customIcons.tsx`, dibujados en REA, sin activos de terceros) con el lenguaje visual de
   Revu: trazo fino; mediciones con marco de regla punteado violeta (longitud, polilongitud, área, conteo, calibrar);
   cuadro de texto "A", llamada, nota, resaltado de texto, subrayado, tachado, pluma azul, marcador amarillo,
   polilínea, rectángulo, elipse, polígono irregular, nube, Cloud+, línea, flecha y cota.
2. **Menús con íconos**: cada entrada lleva su ícono; la opción activa (p. ej. Continuous Pages, Dark Mode) se marca
   resaltando el ícono, como en Revu. Las entradas de Markup y Measure usan el ícono de su herramienta.
3. **Atajos de vista de Revu** (reemplazan los de ADR-0019): Ctrl+9 Fit Page, Ctrl+0 Fit Width, Ctrl+8 Actual Size,
   Ctrl+4 Single Page, Ctrl+5 Continuous Pages, Ctrl+3 Dark Mode; Ctrl+Shift+R rotar página, Ctrl+Shift+X extraer.
   Eliminar página no lleva atajo (es destructivo y no se puede deshacer).
4. **Control de zoom**: mientras está abierto, la rueda del ratón (sin Ctrl) acerca/aleja manteniendo fijo el punto
   del doble clic; + y − siguen disponibles.
5. **Opacidad** en la cinta con muestra visual (color sobre damero y porcentaje).

## 3. Evidencia

`src/components/PdfViewerDimension.test.tsx`, `src/components/shell/Shell.test.tsx` y
`node scripts/verify.mjs --with-e2e --e2e-loop 3`.
