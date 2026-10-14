# ADR-0032: Flechas y mediciones al estilo de Adobe Acrobat/Reader

- **Estado:** Aceptado (pedido del usuario, 2026-10-14: "quiero que tomes el estilo de flechas y dibujos de
  medición de adobe reader")
- **Fecha:** 2026-10-14

## 1. Contexto

Las flechas de REA tenían punta de ~52° y tamaño fijo en pantalla, y la herramienta Flecha usaba punta cerrada. El
valor de las mediciones iba en un recuadro blanco con borde y negrita, que solo existía en pantalla y en el
aplanado: el `/AP` del PDF no llevaba el valor, así que en Revu o Acrobat la medición se veía sin número.

Según la ayuda de Adobe (Measuring 2D: Default Line Start/End, Caption Style "Inside" u "On Top") y su comunidad:
- La distancia de Acrobat usa flecha abierta ("Open") en ambos extremos.
- El valor va dentro o encima de la línea.
- Los extremos son los de ISO 32000, incluidas las flechas invertidas.

## 2. Decisión

1. **Flechas.** Punta de 60° (30° por lado) y tamaño proporcional al grosor: 9 pt con 1 pt de línea (`4·w + 5`).
   En pantalla escalan con el zoom, como en el PDF. Nuevos extremos **Reverse open arrow** y **Reverse closed
   arrow** (`/ROpenArrow`, `/RClosedArrow`), que se escriben y se leen. La herramienta **Arrow** usa punta
   abierta por defecto, como el Arrow de Acrobat. La cota (Dimension, estilo Revu) conserva sus flechas cerradas.
2. **Distance (Length).** Flecha abierta en ambos extremos, editable como en cualquier línea. El valor va en
   Helvetica 10 pt negra, sin recuadro, girado con la línea y nunca boca abajo:
   - **Inside** (por defecto): la línea se interrumpe donde va el texto. Si la línea es demasiado corta, el texto
     pasa encima.
   - **On Top**: el texto va sobre la línea.

   Se elige en el panel Measure ▸ Caption, para las distancias nuevas o la seleccionada, y se guarda en el PDF
   como `/Cap true /CP /Inline|/Top`. Un `/CP /Top` ajeno se respeta al importar.
3. **Resto de mediciones** (Polylength, Area, Perimeter, Volume, Angle, Radius, Diameter): el mismo texto negro
   sin recuadro:
   - Encima del último tramo en Polylength.
   - En el centro en los contornos.
   - Fuera del arco en Angle.
   - Sobre el radio o el diámetro, con su prefijo R u Ø.
4. **Una sola geometría** (`measureCaption.ts`, en unidades de página) para la pantalla, el `/AP` y el aplanado.
   El valor forma parte del `/AP`, así que Revu, Acrobat y PDF.js lo dibujan. El aplanado deja de añadir el
   recuadro antiguo, que solo se conserva para el número del conteo.
5. La vista previa de Length muestra ya las flechas y el valor en vivo mientras se dibuja.
6. El overlay de marcas es `select-none`. Con texto bajo el cursor (la vista previa), arrastrar cerca del borde
   iniciaba una selección del navegador que desplazaba el visor y movía el punto final. Lo detectó el E2E de
   ADR-0025 (10.7 m en lugar de 10.6 m).

## 3. Consecuencias

- Cambia el aspecto de las mediciones existentes al abrirlas en REA. Las de Length sin extremos guardados pasan a
  mostrar flechas abiertas. Las líneas y flechas con extremos guardados mantienen su tipo, con la nueva punta.
- El relleno de Area y Volume se mantiene (útil para takeoff), aunque Acrobat no rellena por defecto.

## 4. Evidencia

`src/core/markup/acrobatStyle.test.ts`, `src/components/PdfViewerAcrobatStyle.test.tsx` y el E2E "Estilo de
Acrobat en las mediciones (ADR-0032)". Se actualizaron las pruebas cuyo comportamiento cambió a propósito: punta
de la flecha, tamaño del extremo y último operador del `/AP` del perímetro.
