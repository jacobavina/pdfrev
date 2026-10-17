# ADR-0066: Acentos de color en los iconos y desplegables siempre enteros dentro de la ventana

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Enmienda:** ADR-0065, punto 2 (iconos monocromos), a petición del usuario

## 1. Contexto

El usuario hizo dos observaciones al editar una nube:

1. **Desplegable de tipos de línea recortado.** El panel de Propiedades está pegado al borde derecho, y la lista se
   abría alineada a la izquierda del botón. Con 212 px de ancho se salía de la ventana: se leían los nombres
   ("Dashed 1", "Cloud"…) pero no sus dibujos. Al desplegable de color le pasaba lo mismo.
2. **Iconos sin color.** ADR-0065 dejó todos los iconos en gris neutro, y con ello se perdieron pistas que se usaban
   para reconocerlos:
   - la barra amarilla del resaltador;
   - el punteado violeta alrededor de las herramientas de medición;
   - la punta azul del lápiz;
   - los colores por tipo de la lista de marcas.

## 2. Decisión

1. **Iconos con acento:**
   - `customIcons.tsx` recupera sus trazos interiores de color (los de antes de ADR-0065, commit `9da271b`). Los
     colores ya no son literales: son tokens nuevos de `src/index.css`:
     - `--icon-highlight` (amarillo);
     - `--icon-measure` (violeta);
     - `--icon-pen` (azul).
   - Se usan con `tok()`, igual que los `ov-*`.
   - Los iconos de snap del panel de mediciones vuelven a `icon-measure`.
   - Los iconos por tipo de la lista de marcas vuelven a sus colores de Tailwind.
   - El trazo base sigue en 1.75 y los tamaños en 16/18/20.
   - El acento de la interfaz (`cad-accent`) sigue reservado para selección, foco, pestaña activa y marca. Los
     colores de los iconos son semánticos, no de estado.
2. **Desplegables enteros:**
   - `IconPicker` (tipo de línea, extremos, grosor) y `ColorPicker` miden su lista después de abrirla.
   - Si no cabe a la derecha, la desplazan a la izquierda (8 px de margen).
   - Si no cabe debajo, la abren hacia arriba.

## 3. Pruebas tocadas y por qué

**`designScale.test.ts` › iconos:** la prueba de ADR-0065 exigía que los iconos propios no tuvieran trazos
interiores. El usuario pidió recuperarlos, así que ahora:
- exige que los tres acentos sean tokens `--icon-*`;
- se renombra para decirlo;
- sigue exigiendo el trazo base de 1.75 y los tamaños 16/18/20.

## 4. Verificación

- `src/components/shell/PickerViewport.test.tsx` (nueva):
  - `la lista de tipos de línea abierta junto al borde derecho se desplaza a la izquierda y, sin sitio debajo, se abre hacia arriba`
  - `con sitio de sobra la lista se queda bajo el botón, alineada a su izquierda`
  - `el desplegable de color abierto junto al borde derecho también queda entero dentro de la ventana`
- La regla de "ningún color literal en componentes" sigue en verde.
- Captura con Playwright a 1440 × 900, con una marca seleccionada y Propiedades abierto: la lista de tipos de línea
  ocupa x = 1220…1432, entera, con sus dibujos visibles. Las cintas Markup y Measure muestran los acentos.
