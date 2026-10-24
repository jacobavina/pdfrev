# ADR-0138: Control de borde/fondo en marcas de texto y alineación de capa de texto en páginas rotadas

## Estado
Aceptado

## Contexto
1. **Contorno o recuadro en marcas de texto (`text`)**:
   - Al crear un cuadro de texto (`Text Box`, atajo `T`), los usuarios necesitaban poder retirar el recuadro (borde y/o color de fondo) para dejar el texto limpio sobre el plano sin contornos visibles.
   - En la cinta de estilos (`StyleSection`), el botón «Border» (`ribbon-callout-border`) solo se mostraba para marcas de tipo `callout`, ocultándose cuando se seleccionaba una marca `text`.
   - El selector de color de línea (`ribbon-stroke-color`) no ofrecía la opción «None» (transparente), impidiendo anular el borde.
   - En el renderizado SVG (`render.ts`), si no se especificaba color de relleno (`fillColor`), se aplicaba por defecto un fondo `#fffbe8` y un borde visible incluso con `strokeWidth: 0`.

2. **Selección de texto en planos rotados (`Treehouse (Cook Ranch)_01_TX_rev21 - Layout - Opt.Roads.pdf`)**:
   - Dicho plano cuenta con rotación intrínseca de 270° (`page.rotate: 270`, `view: [0, 0, 1684, 2384]`, viewport visual `2384 × 1684 pt`).
   - El constructor `TextLayer` de PDF.js 4.x calcula las dimensiones no rotadas en base a `rawDims` (`1684 × 2384 px`) y añade el atributo `data-main-rotation="270"` al contenedor para que el CSS del visor aplique la transformación geométrica adecuada:
     `transform: rotate(270deg) translateX(-100%);`
   - En `src/index.css` faltaban las reglas CSS de rotación para `.textLayer[data-main-rotation="90|180|270"]`.
   - Adicionalmente, el componente React `PdfViewer` inyectaba estilos en línea `width` y `height` con las dimensiones apaisadas (`2384 × 1684`), sobreescribiendo el dimensionamiento de PDF.js y desplazando los spans de texto cientos de píxeles fuera de la hoja, lo que impedía seleccionar el texto del plano.

## Decisiones
1. **Borde y relleno de marcas de texto**:
   - Se habilita `allowNone` en el selector de color de línea (`ribbon-stroke-color`), permitiendo elegir `transparent` (grosor 0).
   - Se amplía el contexto del botón de alternancia «Border» (`ribbon-callout-border`) para abarcar tanto `callout` como `text` (`boxBorderContext`).
   - Al desactivar el borde, se guarda `customFields.boxBorder = 0`, `strokeWidth = 0` y `strokeColor = 'transparent'`. Al activarlo, se restablece con grosor 1 y color visible.
   - Al seleccionar «None» en el color de relleno (`ribbon-fill-color`), se asigna `fillColor: 'transparent'` para evitar la recaída al fondo crema `#fffbe8`.
   - En `render.ts` y `pdfExportService.ts`, cuando una marca de texto no tiene borde (`strokeWidth === 0` o `boxBorder === 0`) y su relleno es `transparent`, se dibuja un rectángulo invisible (`fill: none`, `stroke: none`) o se omite en la exportación, manteniendo accesibles las dimensiones para hit-test y desplazamiento.

2. **Alineación de capa de texto rotada y selección**:
   - En `src/index.css`, se añaden las reglas estándar de rotación de PDF.js:
     ```css
     .textLayer[data-main-rotation="90"] { transform: rotate(90deg) translateY(-100%); }
     .textLayer[data-main-rotation="180"] { transform: rotate(180deg) translate(-100%, -100%); }
     .textLayer[data-main-rotation="270"] { transform: rotate(270deg) translateX(-100%); }
     ```
   - En `PdfViewer.tsx` y `pdfService.ts`, se eliminan las dimensiones en línea `width` y `height` forzadas en `.textLayer`, dejando que PDF.js y las reglas de rotación CSS posicionen la capa píxel a píxel sobre el lienzo.
   - En el menú contextual (`CanvasContextMenu`) y la barra de menús (`MenuBar` ▸ Edit ▸ Copy), si existe texto seleccionado en la ventana (`window.getSelection()`), la acción «Copy» (`Ctrl+C`) copia prioritariamente la cadena seleccionada al portapapeles del sistema y notifica al usuario con un aviso.

## Consecuencias
- Los usuarios pueden quitar el borde y el fondo de cualquier cuadro de texto con un solo clic en «Border» o seleccionando «None» en los inspectores de color.
- En planos técnicos con rotaciones intrínsecas (90°, 180°, 270°) como `Treehouse (Cook Ranch)`, los caracteres de la capa de texto coinciden exactamente con el dibujo vectorial renderizado en el canvas y pueden seleccionarse y copiarse fluidamente con `Select Text` (`Shift+T`).
