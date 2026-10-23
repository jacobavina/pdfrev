# ADR-0115: Print y E2E del Tool Chest más robusto

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

`Print` era lo último de la brecha de menús de Revu que se pidió (`docs/plan-v2/10-brecha-menus-revu.md`). Sin él,
`Ctrl+P` imprimiría la interfaz de la ventana y no el plano.

## 2. Decisión

1. **File ▸ Print…** (`Ctrl+P`, que ya no abre la impresión del navegador) abre un diálogo con:
   páginas (todas, la actual o una lista), contenido (con marcas o solo el dibujo), tamaño (*Fit to the paper you choose
   next* o *Actual size*), calidad (100, 150, 200 o 300 ppp) y blanco y negro.
2. **Cómo se imprime:** las páginas elegidas se rasterizan con PDF.js (con las marcas aplanadas encima si se pidió,
   igual que *PDF with Flattened Markups*, sin las marcas ocultas ni las de capas ocultas) y se colocan, una imagen por
   página, en un contenedor `#rea-print-root` que solo se ve al imprimir. Después se llama a `window.print()`, que abre el
   diálogo del sistema (impresora, papel, copias). Al terminar (`afterprint`, o a los 10 minutos si no llega) el
   contenedor y las imágenes se retiran.
3. **Hoja de estilos:** cada página tiene su página con nombre (`p0`, `p1`…). *Actual size* da a cada una su tamaño en
   puntos; *Fit* solo indica orientación y ajusta la imagen sin deformarla al papel elegido. Las páginas de tamaños
   distintos no se mezclan.
4. **Límites de resolución:** una página no pasa de 9000 px de lado ni de 50 millones de píxeles; un plano grande baja
   su resolución (sin pasar de 36 ppp por abajo). Con más de 60 páginas el diálogo avisa de que tardará.
5. **E2E del Tool Chest** (hallazgo de la verificación de ADR-0114): dos pruebas antiguas fallaron una vez con la
   máquina cargada porque la app no pintó a tiempo o el primer clic en "expandir" se perdió. Ahora `openApp` recarga una
   vez si el visor no aparece en 12 s y el Tool Chest reintenta abrirse hasta 20 s. No cambia lo que se comprueba.

## 3. Alcance y límites

- No hay vista previa propia: la vista previa y la elección de impresora son las del sistema.
- Se imprimen imágenes, no vectores: el texto no se selecciona en la copia en papel ni en un "imprimir a PDF".
- En la aplicación de escritorio el diálogo es el de WebView2; no se puede automatizar, así que solo se probó el
  contenido que se manda a imprimir, no el cuadro del sistema.

## 4. Pruebas

- `src/core/print/printLayout.test.ts` (7): resolución y límites, y la hoja de estilos de cada modo.
- `src/services/printService.test.ts` (8): una imagen por página, aplanado con filtrado de capas, progreso, limpieza
  con `afterprint` y fallos.
- `src/components/modals/PrintDialog.test.tsx` (7): menú y atajo, opciones hacia el servicio y avisos.
- E2E `Print (ADR-0115)` (2): con `window.print` sustituido, la hoja de impresión real de Chromium sale con una página
  por plano, del tamaño de la del plano, con su imagen y en horizontal si el plano lo es.
