# ADR-0045: Sellos de Revu y Foxit

- **Estado:** Aceptado (capturas del usuario de Revu y Foxit, 2026-10-15: "los stamps que incluiste no se parecen a
  los de revu, también te dejo de ejemplo los de foxit")
- **Fecha:** 2026-10-15
- **Amplía:** ADR-0026 y ADR-0040 (sellos de obra con marco redondeado, que se conservan)

## 1. Contexto

REA tenía un solo estilo de sello: marco redondeado, texto en mayúsculas y "By … at …".

En Revu los sellos son casi solo texto:
- "For Review" verde, "Draft Print" azul, "Preliminary" vino y "Revised" naranja, en negrita con una línea pequeña de
  fecha y hora.
- "APPROVED" con marco.
- Fechas en rojo.
- Una etiqueta en forma de flecha, un sello circular de ingeniero, "Released" con renglones y "Watermark" en gris.

En Foxit son cajas de color con marco blanco interior y texto blanco: dinámicos con autor, fecha y hora, estándar con
icono, y de firma (Sign Here).

## 2. Decisión

1. **Catálogo por secciones** (`stamps.ts`):
   - Revu (14 sellos).
   - Dynamic (5), Standard con icono (12) y Sign Here (5), de Foxit.
   - Construction (los 19 de obra anteriores, con sus mismos identificadores).
2. **Dibujo común** (`stampArt.ts`):
   - Trazados de solo M/L/C/Q/Z y textos Helvetica, que la pantalla pinta como SVG y el `/AP` como operadores (con
     Helvetica-Bold, -Oblique y -BoldOblique estándar, sin incrustar).
   - Los iconos de Foxit son trazos blancos dibujados a mano en una caja unidad (sin recursos de terceros).
3. **Texto dinámico al colocarlo** (`stampTexts`):
   - Foxit: "Ana, 15/10/2026, 04:18:40 pm".
   - Revu: "15/10/2026 04:18:40 pm".
   - Sellos de fecha: la fecha como título; European Date con puntos.
   - Released: autor y fecha en sus renglones.
   - Obra: "By … at …".
4. **Selector como el de Foxit**: un panel con secciones y la miniatura real de cada sello (con el autor y la hora
   actuales) en la pestaña Insert. El menú Tools ▸ Stamp sigue las mismas secciones.
5. Los nombres `/Name` estándar se usan cuando existen (Approved, Final, Expired, Draft, Confidential, NotApproved).

## 3. Consecuencias

- Para no pasar el presupuesto del bundle principal (800 kB), el selector de sellos, el panel izquierdo y el menú
  contextual del plano se cargan en fragmentos aparte (780 kB tras el cambio).
- Los sellos ya colocados conservan su dibujo: sin `stampId` de las familias nuevas se dibujan como sellos de obra.

## 4. Evidencia

`src/core/markup/stampArt.test.ts`, `src/components/shell/StampPicker.test.tsx` y el E2E "Sellos de Revu y Foxit
desde el selector de la pestaña Insert (ADR-0045)".
