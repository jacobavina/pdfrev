# ADR-0040: Barra de propiedades contextual con fuentes, y sellos como los de Revu

- **Estado:** Aceptado (captura del usuario de Revu, 2026-10-15: "cuando una cloud+ se ve así, me deja editar en la
  parte de arriba la configuración a mi gusto incluido el tipo de letra. Los stamps son distintos igual")
- **Fecha:** 2026-10-15

## 1. Contexto

La barra superior de Revu edita la marca seleccionada, incluido el tipo de letra de la nota de una Cloud+. En REA el
grupo Style de la cinta solo definía el estilo de las marcas nuevas, y los cuadros de texto y las llamadas no tenían
fuente configurable. Los sellos usaban doble marco y fecha ISO ("Ana · 2026-10-15 04:51"), distintos de los sellos
dinámicos de Revu y Acrobat.

## 2. Decisión

1. **Barra de propiedades contextual**:
   - Con la herramienta de selección y marcas seleccionadas, el grupo Style se rotula "Properties · N selected" y
     edita la selección en un paso deshacible: color, relleno, grosor, tipo de línea, extremos y opacidad.
   - Con una herramienta de dibujo activa, o sin selección, define el estilo de lo que se va a dibujar.
2. **Grupo Text en la cinta**: fuente (Helvetica, Times, Courier), tamaño, negrita, cursiva y color del texto.
   Negrita y cursiva se aplican a la selección.
3. **Modelo de fuente común** (`markupFontOf`) para cuadros de texto, llamadas (también la nota de Cloud+) y
   mediciones. Se usa en pantalla y en el `/AP` con la fuente estándar correspondiente, sin incrustar.
4. **Sellos estilo Revu/Acrobat**:
   - Marco único de esquinas redondeadas, sin relleno, y título en negrita.
   - Línea dinámica en cursiva: "By Ana at 4:51 am, Oct 15, 2026".
   - En el `/AP` el marco va con curvas exactas y la línea dinámica en Helvetica-Oblique.

## 3. Consecuencias

- Se actualizaron las pruebas que fijaban el doble marco y el formato de fecha anterior de los sellos.
- Los sellos ya colocados conservan su texto dinámico guardado y solo cambian de marco.

## 4. Evidencia

`src/components/RevuEditing.test.tsx`, `src/core/markup/stamps.test.ts` y el E2E de ADR-0039/0040.
