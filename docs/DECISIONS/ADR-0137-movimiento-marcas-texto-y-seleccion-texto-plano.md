# ADR-0137: Movimiento de marcas de texto y descubribilidad de selección de texto en planos

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## 1. Contexto

El usuario reportó dos incidencias críticas de usabilidad al trabajar con planos y anotaciones:
1. Al crear un cuadro de texto (por ejemplo la palabra "Hola") mediante un clic simple o arrastre breve, ya no resultaba posible moverlo ni arrastrarlo a otra ubicación sobre el plano; al hacer clic sobre él se deseleccionaba y se iniciaba un marco de selección (marquee).
2. Al abrir un plano con texto seleccionable de PDF, resultaba confuso y no evidente cómo seleccionar o copiar texto del plano con el ratón. En la cinta de herramientas, la función aparecía bajo la etiqueta confusa "Copy" (que inducía a pensar en una acción de portapapeles), y no estaba presente en la barra de menús (`Edit` ni `Tools`). Además, arrastrar sobre el dibujo en modo selección de marcas no ofrecía ninguna orientación ni atajo.

## 2. Decisión

1. **Geometría y Hit-Testing de Marcas de Texto:**
   - En `getMarkupBounds()` (`src/utils/coordinates.ts`), se introdujo el cálculo de dimensiones mínimas de renderizado ($80\times 26\text{ pt}$ para `text` y $80\times 24\text{ pt}$ para `typewriter`, coherente con `render.ts` y ADR-0074). Las directrices (`leaders`) se agregan a la envolvente sin inflar artificialmente la caja interior del texto.
   - En `hitTestMarkup()`, se verifica si el punto cae dentro del recuadro mínimo renderizado del texto o dentro de la tolerancia de sus directrices, resolviendo que clics dentro de textos cortos o creados con un clic simple se detecten como impacto positivo.
   - En `PdfViewer.tsx`, se incluyeron `text` y `typewriter` en `isBoxTool` garantizando coordenadas canónicas ordenadas y se añadió respaldo en `handleMouseDown` para que marcas ya seleccionadas no se deseleccionen si el clic cae dentro de su área visible.
   - La posición del editor inline (`inlineEditing`) se ancla al vértice superior izquierdo canónico `markupPoints[0]`.

2. **Descubribilidad y Usabilidad de Selección de Texto de Documento:**
   - En `toolDefinitions.tsx`, la herramienta de selección de texto pasa de la etiqueta abreviada `short: 'Copy'` a `short: 'SelectText'`, manteniendo su atajo canónico `Shift+T` y explicando con claridad en su tooltip que permite seleccionar texto del dibujo para copiar con `Ctrl+C`.
   - En `MenuBar.tsx`, se incorporó `Select Text` (`Shift+T`) bajo el menú `Edit` y se creó la sección `Tools ▸ Select` conteniendo `Select (V)`, `Select Text (Shift+T)`, `Lasso (Shift+O)` y `Pan (Shift+V)`.
   - En `PdfViewer.tsx`, al pulsar `Escape` en modo `selectText` se regresa de forma natural al modo `select`. Asimismo, si el usuario arrastra un marco elástico en modo `select` sobre una página que contiene texto sin seleccionar marcas de dibujo, se le muestra una notificación toast guiándolo hacia `Select Text` (`Shift+T`).

## 3. Alcance y límites

- Se preserva al 100% el comportamiento de ADR-0104 (`SelectText.test.tsx`), garantizando que en modo `select` la capa de texto no capture eventos de ratón para proteger la interacción fluida con marcas, mientras que en `selectText` la capa de texto captura eventos directamente.
- No se altera ninguno de los títulos de prueba exigidos por `PARITY.md`.

## 4. Pruebas

- `src/utils/coordinates.test.ts`: casos de prueba para bounds y hit-testing de texto creado con un solo punto y typewriter.
- `src/utils/dragInteraction.test.ts`: prueba de selección y arrastre de cuadros de texto creados por clic simple.
- `src/components/TextMarkupMoving.test.tsx`: suite dedicada con 3 pruebas verificando que clics en texto no lo deseleccionan y permiten arrastre.
- `src/components/SelectText.test.tsx`: verificación de etiqueta `SelectText` y retorno a `select` con `Escape`.
- `node scripts/verify.mjs`: suite completa de 1,484 pruebas unitarias, 390 escenarios de `PARITY.md`, compilación TypeScript, verificación de bundle $\le 800\text{ kB}$ y pruebas Rust 100% green.
