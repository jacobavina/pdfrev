import { test, expect } from '@playwright/test';

test.describe('Fase 1: Motor de Anotaciones y Visor PDF', () => {
  test('Verifica que el PDF renderiza pixels reales en el canvas y no solo carga', async ({
    page,
  }) => {
    // 1. Cargar la aplicación
    await page.goto('/');

    // 2. Verificar que el shell y sus 4 paneles principales existen
    await expect(page.locator('header')).toBeVisible(); // Top bar
    await expect(page.locator('[data-testid="pdf-viewer-container"]')).toBeVisible(); // Canvas container
    await expect(page.locator('[data-testid="markups-list-panel"]')).toBeVisible(); // Bottom panel

    // 3. Esperar a que el canvas de PDF.js aparezca y tenga píxeles reales rasterizados
    const canvas = page.locator('[data-testid="pdf-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Esperar a que el canvas no solo tenga dimensiones, sino que PDF.js haya volcado píxeles reales
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="pdf-canvas"]') as HTMLCanvasElement;
        if (!el || el.width < 400 || el.height < 300) return false;
        const ctx = el.getContext('2d');
        if (!ctx) return false;
        try {
          const imgData = ctx.getImageData(0, 0, el.width, el.height);
          const data = imgData.data;
          let nonWhite = 0;
          for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a > 0 && !(r >= 250 && g >= 250 && b >= 250)) {
              nonWhite++;
              if (nonWhite > 200) return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      },
      { timeout: 15000 }
    );

    // 4. Verificación técnica de pixeles: comprobar que el canvas NO está en blanco
    // Inspeccionamos el buffer de píxeles para asegurar que PDF.js rasterizó la página
    // (título, retícula y el rectángulo rojo de control generado en el Paso 0)
    const pixelAnalysis = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pdf-canvas"]') as HTMLCanvasElement;
      if (!el) return { width: 0, height: 0, renderedPixels: 0, redPixels: 0 };

      const ctx = el.getContext('2d');
      if (!ctx) return { width: el.width, height: el.height, renderedPixels: 0, redPixels: 0 };

      const imgData = ctx.getImageData(0, 0, el.width, el.height);
      const data = imgData.data;
      let renderedPixels = 0;
      let redPixels = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        // Pixel no blanco ni transparente
        if (a > 0 && !(r >= 250 && g >= 250 && b >= 250)) {
          renderedPixels++;
        }

        // Píxeles rojizos pertenecientes al rectángulo de control del PDF
        if (r > 180 && g < 80 && b < 80) {
          redPixels++;
        }
      }

      return {
        width: el.width,
        height: el.height,
        renderedPixels,
        redPixels,
      };
    });

    console.log('[E2E Pixel Analysis]', pixelAnalysis);

    // Validar que el canvas tiene dimensiones de resolución nativa/HiDPI
    expect(pixelAnalysis.width).toBeGreaterThanOrEqual(800);
    expect(pixelAnalysis.height).toBeGreaterThanOrEqual(600);

    // Validar que hay contenido vectorial/texto pintado (miles de píxeles no blancos)
    expect(pixelAnalysis.renderedPixels).toBeGreaterThan(1500);

    // Validar que el rectángulo rojo de calibración fue rasterizado
    expect(pixelAnalysis.redPixels).toBeGreaterThan(100);

    // 5. Verificar que la capa de overlay SVG está presente y tiene marcas
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible();

    // 6. Verificar que la Lista de Marcas (MarkupsList) muestra las columnas funcionales
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toContainText('Lista de Marcas');

    // 7. Verificar sincronización bidireccional: la fila de la marca de calibración
    const calibrationRow = page.locator('[data-testid="markup-row-calibration-markup-1"]');
    await expect(calibrationRow).toBeVisible();
    await expect(calibrationRow).toContainText('rectangle');
    await expect(calibrationRow).toContainText('Ing. Estructural');

    // 8. Edición de estado en vivo desde la tabla
    const statusSelect = calibrationRow.locator('select');
    await expect(statusSelect).toHaveValue('pending');
    await statusSelect.selectOption('accepted');
    await expect(statusSelect).toHaveValue('accepted');

    // 9. Selección interactiva: hacer clic en la fila resalta el elemento
    await calibrationRow.click();
    await expect(calibrationRow).toHaveClass(/bg-cad-accent/);

    // 10. Deshacer el cambio con el botón Undo
    const undoButton = page.locator('button[title*="Deshacer"]');
    await expect(undoButton).toBeEnabled();
    await undoButton.click();
    await expect(statusSelect).toHaveValue('pending');
  });

  test('Sub-entregable 0.2: Dibuja círculo/elipse, polígono y valida atajo Escape', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    // 1. Dibuja Círculo / Elipse
    const circleBtn = page.locator('button[title*="Círculo / Elipse"]');
    await circleBtn.click();

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();

    if (svgBox) {
      await page.mouse.move(svgBox.x + 150, svgBox.y + 150);
      await page.mouse.down();
      await page.mouse.move(svgBox.x + 250, svgBox.y + 200);
      await page.mouse.up();
    }

    // Comprobar que existe un elemento <ellipse> en el SVG overlay
    const ellipseElem = overlaySvg.locator('ellipse');
    await expect(ellipseElem).toBeVisible();

    // Comprobar que aparece en la lista de marcas
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toContainText('circle');

    // 2. Dibuja Polígono con tecla Enter para cerrar (Criterio 3)
    const polygonBtn = page.locator('button[title*="Polígono"]');
    await polygonBtn.click();

    if (svgBox) {
      await page.mouse.click(svgBox.x + 300, svgBox.y + 100);
      await page.mouse.click(svgBox.x + 350, svgBox.y + 150);
      await page.mouse.click(svgBox.x + 280, svgBox.y + 180);
      await page.keyboard.press('Enter');
    }

    // Comprobar que existe un elemento <polygon> en el SVG overlay
    const polygonElem = overlaySvg.locator('polygon');
    await expect(polygonElem).toBeVisible();
    await expect(markupsPanel).toContainText('polygon');

    // 3. Validar tecla Escape para cancelar trazo en curso (Criterio 3)
    // Con polígono activo, hacer 2 clics y pulsar Escape -> debe descartarse
    const countBefore = await overlaySvg.locator('polygon').count();
    if (svgBox) {
      await page.mouse.click(svgBox.x + 400, svgBox.y + 100);
      await page.mouse.click(svgBox.x + 450, svgBox.y + 120);
      await page.keyboard.press('Escape');
    }
    const countAfter = await overlaySvg.locator('polygon').count();
    expect(countAfter).toBe(countBefore);

    // 4. Sub-entregable 0.3: Verificar que el botón "Exportar PDF" está habilitado
    const exportBtn = page.locator('button[title*="Exportar PDF"]');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();
  });

  test('Sub-entregable 0.3 / 0.4: Botón "Exportar PDF" ejecuta import dinámico y genera descarga de Blob', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    // Dibujar un rectángulo para asegurar que hay marcas en la exportación
    const rectBtn = page.locator('button[title*="Rectángulo"]');
    await rectBtn.click();

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (svgBox) {
      await page.mouse.move(svgBox.x + 100, svgBox.y + 100);
      await page.mouse.down();
      await page.mouse.move(svgBox.x + 200, svgBox.y + 200);
      await page.mouse.up();
    }

    const exportBtn = page.locator('button[title*="Exportar PDF"]');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    // Capturar la descarga desencadenada por el Blob y la etiqueta <a>
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('_con_marcas.pdf');
  });

  test('Sub-entregable A.0: Selección, arrastre con umbral 4px, traslación 50px y reversión atómica con Ctrl+Z', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    // 1. Dibujar un rectángulo técnico de prueba
    const rectBtn = page.locator('button[title*="Rectángulo"]');
    await rectBtn.click();

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (!svgBox) return;

    const startX = svgBox.x + 120;
    const startY = svgBox.y + 120;
    const endX = svgBox.x + 220;
    const endY = svgBox.y + 200;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    // Localizar el rectángulo recién dibujado dentro de su grupo
    const newRect = overlaySvg
      .locator('g[data-testid^="markup-g-"]')
      .last()
      .locator('rect:not([data-testid="selection-bbox"])');
    await expect(newRect).toBeVisible();

    const initialXStr = await newRect.getAttribute('x');
    const initialYStr = await newRect.getAttribute('y');
    expect(initialXStr).not.toBeNull();
    expect(initialYStr).not.toBeNull();
    const origX = parseFloat(initialXStr!);

    // 2. Cambiar a herramienta Seleccionar (V)
    const selectBtn = page.locator('button[title*="Seleccionar"]');
    await selectBtn.click();

    // Punto sobre el borde del rectángulo para interactuar (hit-test de figura hueca)
    const edgeX = startX + 2;
    const edgeY = (startY + endY) / 2;

    // 3. Probar umbral de 4 px: un micro-movimiento de 2 px NO debe mover la marca
    await page.mouse.move(edgeX, edgeY);
    await page.mouse.down();
    await page.mouse.move(edgeX + 2, edgeY);
    await page.mouse.up();

    const postTremorX = parseFloat((await newRect.getAttribute('x'))!);
    expect(postTremorX).toBeCloseTo(origX, 0);

    // 4. Arrastre real de 50 px a la derecha
    await page.mouse.move(edgeX, edgeY);
    await page.mouse.down();
    await page.mouse.move(edgeX + 50, edgeY);
    await page.mouse.up();

    const movedX = parseFloat((await newRect.getAttribute('x'))!);
    // El rectángulo debe haberse desplazado aproximadamente 50 px a la derecha
    expect(movedX).toBeGreaterThanOrEqual(origX + 45);
    expect(movedX).toBeLessThanOrEqual(origX + 55);

    // 5. Reversión atómica con Ctrl+Z: exactamente un paso regresa a la posición original
    await page.keyboard.press('Control+z');
    const restoredX = parseFloat((await newRect.getAttribute('x'))!);
    expect(restoredX).toBeCloseTo(origX, 0);

    // 6. Rehacer con Ctrl+Y: vuelve a la posición desplazada
    await page.keyboard.press('Control+y');
    const redoneX = parseFloat((await newRect.getAttribute('x'))!);
    expect(redoneX).toBeGreaterThanOrEqual(origX + 45);
    expect(redoneX).toBeLessThanOrEqual(origX + 55);

    // 7. Deshacer de nuevo para restaurar posición inicial
    await page.keyboard.press('Control+z');
    const finalX = parseFloat((await newRect.getAttribute('x'))!);
    expect(finalX).toBeCloseTo(origX, 0);
  });

  test('Sub-entregable A.1: Cloud+ como grupo (creación atómica, arrastre conjunto de nube y directriz, y borrado/deshacer en un paso)', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    // 1. Activar herramienta Cloud+
    const cloudPlusBtn = page.locator('button[title*="Cloud+"]');
    await expect(cloudPlusBtn).toBeVisible();
    await cloudPlusBtn.click();

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (!svgBox) return;

    const startX = svgBox.x + 150;
    const startY = svgBox.y + 150;
    const endX = svgBox.x + 300;
    const endY = svgBox.y + 250;

    // 2. Trazar Cloud+ arrastrando el ratón
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    // 3. Comprobar que en el SVG overlay se crearon los elementos de la nube y del callout
    const cloudPath = overlaySvg.locator('path[d*="Q"]').last();
    await expect(cloudPath).toBeVisible();

    const calloutText = overlaySvg.locator('text:has-text("Nota Cloud+")').last();
    await expect(calloutText).toBeVisible();

    // Guardar captura para verificación visual de la curvatura y flecha del abombamiento
    await page.screenshot({
      path: 'C:/Users/jmm_j/.gemini/antigravity/brain/9026c7fb-b4c3-4cb1-906c-879487ed1de7/cloud_visual_verification.png',
    });

    // Comprobar que en la lista de marcas aparecen cloudPlus y callout
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toContainText('cloudPlus');
    await expect(markupsPanel).toContainText('callout');

    // 4. Cambiar a herramienta Seleccionar (V)
    const selectBtn = page.locator('button[title*="Seleccionar"]');
    await selectBtn.click();

    // Guardar posición inicial del texto del callout
    const initialTextX = parseFloat((await calloutText.getAttribute('x'))!);
    const initialTextY = parseFloat((await calloutText.getAttribute('y'))!);

    // 5. Clic sobre la nube para arrastrar el grupo (interior de la nube en 200, 200)
    const dragClickX = startX + 50;
    const dragClickY = startY + 50;

    await page.mouse.move(dragClickX, dragClickY);
    await page.mouse.down();
    await page.mouse.move(dragClickX + 60, dragClickY + 40);
    await page.mouse.up();

    // 6. Verificar que tanto la nube como el callout se movieron juntos
    const movedTextX = parseFloat((await calloutText.getAttribute('x'))!);
    const movedTextY = parseFloat((await calloutText.getAttribute('y'))!);
    expect(movedTextX).toBeGreaterThanOrEqual(initialTextX + 50);
    expect(movedTextX).toBeLessThanOrEqual(initialTextX + 70);
    expect(movedTextY).toBeGreaterThanOrEqual(initialTextY + 30);
    expect(movedTextY).toBeLessThanOrEqual(initialTextY + 50);

    // 7. Deshacer atómico con Ctrl+Z: un solo paso regresa todo el grupo a su posición original
    await page.keyboard.press('Control+z');
    const restoredTextX = parseFloat((await calloutText.getAttribute('x'))!);
    const restoredTextY = parseFloat((await calloutText.getAttribute('y'))!);
    expect(restoredTextX).toBeCloseTo(initialTextX, 0);
    expect(restoredTextY).toBeCloseTo(initialTextY, 0);

    // 8. Borrado conjunto: pulsar Delete con el grupo seleccionado elimina nube y callout juntos
    await page.keyboard.press('Delete');
    await expect(overlaySvg.locator('text:has-text("Nota Cloud+")')).toHaveCount(0);

    // 9. Deshacer el borrado con Ctrl+Z: un solo paso restaura el grupo completo
    await page.keyboard.press('Control+z');
    await expect(overlaySvg.locator('text:has-text("Nota Cloud+")').last()).toBeVisible();
    await expect(markupsPanel).toContainText('cloudPlus');
    await expect(markupsPanel).toContainText('callout');
  });

  test('Sub-entregable A.2: Multiselección con Marquee por intersección, verificación de lista intacta, arrastre conjunto y undo atómico', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toBeVisible();

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (!svgBox) return;

    // 1. Dibujar 2 rectángulos separados
    const rectBtn = page.locator('button[title*="Rectángulo"]');
    await rectBtn.click();

    // Rectángulo 1: de (100, 100) a (180, 180)
    await page.mouse.move(svgBox.x + 100, svgBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 180, svgBox.y + 180);
    await page.mouse.up();

    // Rectángulo 2: de (240, 100) a (320, 180)
    await page.mouse.move(svgBox.x + 240, svgBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 320, svgBox.y + 180);
    await page.mouse.up();

    // Contar marcas en la tabla antes del marquee
    const markupsCountBefore = await markupsPanel.locator('tr[data-testid^="markup-row-"]').count();
    expect(markupsCountBefore).toBeGreaterThanOrEqual(2);

    // Obtener referencias de ambos rectángulos dibujados
    const rectGroups = overlaySvg.locator('g[data-testid^="markup-g-"]');
    const totalGroups = await rectGroups.count();
    const rect1 = rectGroups.nth(totalGroups - 2).locator('rect:not([data-testid="selection-bbox"])');
    const rect2 = rectGroups.nth(totalGroups - 1).locator('rect:not([data-testid="selection-bbox"])');

    // Cambiar a herramienta Seleccionar (V)
    const selectBtn = page.locator('button[title*="Seleccionar"]');
    await selectBtn.click();

    // 2. Marquee por intersección desde zona vacía (50, 80) hasta (280, 150)
    // Abarca X [50..280] e Y [80..150]. Rect 1 está en [100..180, 100..180]. Rect 2 está en [240..320, 100..180].
    // Rect 1 interseca; Rect 2 interseca parcialmente (termina en 320 > 280) -> Criterio estricto de INTERSECCIÓN
    await page.mouse.move(svgBox.x + 50, svgBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 280, svgBox.y + 150);

    // Comprobar que el rectángulo elástico del marquee está visible en el DOM durante el arrastre
    const marqueeRect = overlaySvg.locator('[data-testid="marquee-selection-rect"]');
    await expect(marqueeRect).toBeVisible();

    // Soltar ratón para confirmar selección
    await page.mouse.up();

    // El rectángulo del marquee debe desaparecer inmediatamente
    await expect(marqueeRect).toHaveCount(0);

    // Aserción estricta 1: La lista de marcas queda intacta (cero marcas creadas por el marquee)
    const markupsCountAfter = await markupsPanel.locator('tr[data-testid^="markup-row-"]').count();
    expect(markupsCountAfter).toBe(markupsCountBefore);

    // Ambos rectángulos deben estar seleccionados (2 bboxes de selección visibles)
    const selectionBboxes = overlaySvg.locator('rect[data-testid="selection-bbox"]');
    await expect(selectionBboxes).toHaveCount(2);

    // Obtener posiciones iniciales antes del arrastre conjunto
    const rect1InitialX = parseFloat((await rect1.getAttribute('x'))!);
    const rect1InitialY = parseFloat((await rect1.getAttribute('y'))!);
    const rect2InitialX = parseFloat((await rect2.getAttribute('x'))!);
    const rect2InitialY = parseFloat((await rect2.getAttribute('y'))!);

    // 3. Arrastre conjunto de las K marcas seleccionadas:
    // Clic sobre el borde izquierdo de rect1 (que ya está seleccionado)
    const dragStartX = svgBox.x + rect1InitialX + 2;
    const dragStartY = svgBox.y + rect1InitialY + 20;

    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(dragStartX + 50, dragStartY + 30);
    await page.mouse.up();

    // Verificar que AMBOS rectángulos se trasladaron juntos
    const rect1MovedX = parseFloat((await rect1.getAttribute('x'))!);
    const rect1MovedY = parseFloat((await rect1.getAttribute('y'))!);
    const rect2MovedX = parseFloat((await rect2.getAttribute('x'))!);
    const rect2MovedY = parseFloat((await rect2.getAttribute('y'))!);

    expect(rect1MovedX).toBeGreaterThanOrEqual(rect1InitialX + 45);
    expect(rect1MovedX).toBeLessThanOrEqual(rect1InitialX + 55);
    expect(rect1MovedY).toBeGreaterThanOrEqual(rect1InitialY + 25);
    expect(rect1MovedY).toBeLessThanOrEqual(rect1InitialY + 35);

    expect(rect2MovedX).toBeGreaterThanOrEqual(rect2InitialX + 45);
    expect(rect2MovedX).toBeLessThanOrEqual(rect2InitialX + 55);
    expect(rect2MovedY).toBeGreaterThanOrEqual(rect2InitialY + 25);
    expect(rect2MovedY).toBeLessThanOrEqual(rect2InitialY + 35);

    // 4. Aserción estricta 2: Un solo Ctrl+Z revierte las K marcas a sus posiciones originales
    await page.keyboard.press('Control+z');

    const rect1RestoredX = parseFloat((await rect1.getAttribute('x'))!);
    const rect1RestoredY = parseFloat((await rect1.getAttribute('y'))!);
    const rect2RestoredX = parseFloat((await rect2.getAttribute('x'))!);
    const rect2RestoredY = parseFloat((await rect2.getAttribute('y'))!);

    expect(rect1RestoredX).toBeCloseTo(rect1InitialX, 0);
    expect(rect1RestoredY).toBeCloseTo(rect1InitialY, 0);
    expect(rect2RestoredX).toBeCloseTo(rect2InitialX, 0);
    expect(rect2RestoredY).toBeCloseTo(rect2InitialY, 0);
  });

  test('Sub-entregable A.3: Creación de Callout con directriz, edición inline, movimiento independiente de ancla y arrastre conjunto de caja', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toBeVisible();

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (!svgBox) return;

    // 1. Seleccionar herramienta Callout (Nota técnica con directriz)
    const calloutBtn = page.locator('button[title*="directriz"]');
    await calloutBtn.click();

    // 2. Crear Callout arrastrando en el lienzo:
    // Desde el objetivo/ancla (140, 140) hasta la posición de la caja (260, 220)
    await page.mouse.move(svgBox.x + 140, svgBox.y + 140);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 260, svgBox.y + 220);
    await page.mouse.up();

    // 3. Verificar que el editor inline se abre automáticamente
    const editorInput = page.locator('[data-testid="inline-text-editor-input"]');
    await expect(editorInput).toBeVisible();

    // Obtener referencias de la caja y texto del callout
    const calloutGroup = overlaySvg.locator('g[data-testid^="markup-g-"]').last();
    const calloutBox = calloutGroup.locator('rect:not([data-testid="selection-bbox"])');
    await expect(calloutBox).toBeVisible();
    const initialBoxWidth = parseFloat((await calloutBox.getAttribute('width'))!);

    // 4. Escribir texto técnico extenso y confirmar con Enter
    const newTechnicalText = 'Tubería de impulsión DN200 según plano de fontanería';
    await editorInput.fill(newTechnicalText);
    await page.keyboard.press('Enter');

    // El editor inline debe cerrarse
    await expect(editorInput).toHaveCount(0);

    // El texto debe reflejarse en el SVG y la caja debe haberse expandido
    const textElem = calloutGroup.locator('text').first();
    await expect(textElem).toContainText('Tubería de impulsión');
    const expandedBoxWidth = parseFloat((await calloutBox.getAttribute('width'))!);
    expect(expandedBoxWidth).toBeGreaterThan(initialBoxWidth);
    await expect(markupsPanel).toContainText('callout');

    // 5. Cambiar a herramienta Seleccionar (V)
    const selectBtn = page.locator('button[title*="Seleccionar"]');
    await selectBtn.click();

    // El tirador de ancla del callout seleccionado debe estar visible
    const anchorHandle = overlaySvg.locator('[data-testid="callout-anchor-handle-0"]');
    await expect(anchorHandle).toBeVisible();

    const initAnchorCx = parseFloat((await anchorHandle.getAttribute('cx'))!);
    const initAnchorCy = parseFloat((await anchorHandle.getAttribute('cy'))!);
    const initBoxX = parseFloat((await calloutBox.getAttribute('x'))!);
    const initBoxY = parseFloat((await calloutBox.getAttribute('y'))!);

    // 6. Arrastrar el tirador del ancla de forma independiente (Paso 4 del plan aprobado):
    // El ancla se desplaza mientras que la caja permanece estacionaria
    await page.mouse.move(svgBox.x + initAnchorCx, svgBox.y + initAnchorCy);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + initAnchorCx - 40, svgBox.y + initAnchorCy - 30);
    await page.mouse.up();

    const movedAnchorCx = parseFloat((await anchorHandle.getAttribute('cx'))!);
    const movedAnchorCy = parseFloat((await anchorHandle.getAttribute('cy'))!);
    expect(movedAnchorCx).toBeCloseTo(initAnchorCx - 40, 0);
    expect(movedAnchorCy).toBeCloseTo(initAnchorCy - 30, 0);

    const boxXAfterAnchorDrag = parseFloat((await calloutBox.getAttribute('x'))!);
    const boxYAfterAnchorDrag = parseFloat((await calloutBox.getAttribute('y'))!);
    expect(boxXAfterAnchorDrag).toBeCloseTo(initBoxX, 0);
    expect(boxYAfterAnchorDrag).toBeCloseTo(initBoxY, 0);

    // 7. Arrastre de la caja del callout (Resolución del BLOQUEANTE - Paso 5 del plan aprobado):
    // Arrastrar la caja debe desplazar la caja Y la directriz por el EXACTO MISMO delta
    const boxClickX = svgBox.x + boxXAfterAnchorDrag + 30;
    const boxClickY = svgBox.y + boxYAfterAnchorDrag + 15;

    await page.mouse.move(boxClickX, boxClickY);
    await page.mouse.down();
    await page.mouse.move(boxClickX + 60, boxClickY + 40);
    await page.mouse.up();

    const finalBoxX = parseFloat((await calloutBox.getAttribute('x'))!);
    const finalBoxY = parseFloat((await calloutBox.getAttribute('y'))!);
    const finalAnchorCx = parseFloat((await anchorHandle.getAttribute('cx'))!);
    const finalAnchorCy = parseFloat((await anchorHandle.getAttribute('cy'))!);

    const deltaBoxX = finalBoxX - boxXAfterAnchorDrag;
    const deltaBoxY = finalBoxY - boxYAfterAnchorDrag;
    const deltaAnchorX = finalAnchorCx - movedAnchorCx;
    const deltaAnchorY = finalAnchorCy - movedAnchorCy;

    expect(deltaBoxX).toBeGreaterThanOrEqual(50);
    expect(deltaBoxX).toBeLessThanOrEqual(70);
    expect(deltaBoxY).toBeGreaterThanOrEqual(30);
    expect(deltaBoxY).toBeLessThanOrEqual(50);

    // Directriz y caja se trasladan por el mismo delta exacto
    expect(deltaAnchorX).toBeCloseTo(deltaBoxX, 0);
    expect(deltaAnchorY).toBeCloseTo(deltaBoxY, 0);

    // 8. Deshacer atómico con Ctrl+Z del arrastre de la caja:
    await page.keyboard.press('Control+z');

    const restoredBoxX = parseFloat((await calloutBox.getAttribute('x'))!);
    const restoredBoxY = parseFloat((await calloutBox.getAttribute('y'))!);
    const restoredAnchorCx = parseFloat((await anchorHandle.getAttribute('cx'))!);
    const restoredAnchorCy = parseFloat((await anchorHandle.getAttribute('cy'))!);

    expect(restoredBoxX).toBeCloseTo(boxXAfterAnchorDrag, 0);
    expect(restoredBoxY).toBeCloseTo(boxYAfterAnchorDrag, 0);
    expect(restoredAnchorCx).toBeCloseTo(movedAnchorCx, 0);
    expect(restoredAnchorCy).toBeCloseTo(movedAnchorCy, 0);

    // 9. Segundo Deshacer con Ctrl+Z del movimiento independiente de ancla:
    await page.keyboard.press('Control+z');

    const initialRestoredAnchorCx = parseFloat((await anchorHandle.getAttribute('cx'))!);
    const initialRestoredAnchorCy = parseFloat((await anchorHandle.getAttribute('cy'))!);
    expect(initialRestoredAnchorCx).toBeCloseTo(initAnchorCx, 0);
    expect(initialRestoredAnchorCy).toBeCloseTo(initAnchorCy, 0);
  });

  test('Sub-entregable A.3: Invarianza al zoom de la caja de Callout (mismo tamaño en unidades de página a 100% y 200%)', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    const calloutBtn = page.locator('button[title*="directriz"]');
    const zoomInBtn = page.locator('button[title*="Acercar"]');
    const resetZoomBtn = page.locator('button[title*="Restablecer zoom"]');
    await expect(resetZoomBtn).toHaveText('100%');

    const sampleText = 'VIGA ESTRUCTURAL B-12';
    const editorInput = page.locator('[data-testid="inline-text-editor-input"]');

    // Punto del plano normalizado (cerca del centro para visibilidad a 100% y 200% con scroll)
    const normAnchor = { x: 0.45, y: 0.45 };
    const normBox = { x: 0.55, y: 0.52 };

    // 1. Crear Callout al 100% de zoom
    const svgBox100 = await overlaySvg.boundingBox();
    expect(svgBox100).not.toBeNull();
    if (!svgBox100) return;

    await calloutBtn.click();
    await page.mouse.move(
      svgBox100.x + svgBox100.width * normAnchor.x,
      svgBox100.y + svgBox100.height * normAnchor.y
    );
    await page.mouse.down();
    await page.mouse.move(
      svgBox100.x + svgBox100.width * normBox.x,
      svgBox100.y + svgBox100.height * normBox.y
    );
    await page.mouse.up();

    await expect(editorInput).toBeVisible();
    await editorInput.fill(sampleText);
    await page.keyboard.press('Enter');
    await expect(editorInput).toHaveCount(0);

    const callout1Group = overlaySvg.locator('g[data-testid^="markup-g-"]').last();
    const callout1Box = callout1Group.locator('rect:not([data-testid="selection-bbox"])');
    await expect(callout1Box).toBeVisible();
    const width100Screen = parseFloat((await callout1Box.getAttribute('width'))!);
    const width100PageUnits = width100Screen / 1.0;

    // Eliminar Callout 1 con Delete para permitir recrearlo en el mismo punto exacto a 200%
    await page.keyboard.press('Delete');
    await expect(overlaySvg.locator('g[data-testid^="markup-g-"]')).toHaveCount(1);

    // 2. Acercar zoom al 200% (4 clics de 25%)
    for (let i = 0; i < 4; i++) {
      await zoomInBtn.click();
    }
    await expect(resetZoomBtn).toHaveText('200%');
    await expect(overlaySvg).toHaveAttribute('width', '1600');

    // 3. Crear Callout al 200% de zoom en el mismo punto exacto de página y con el mismo texto
    await calloutBtn.click();
    const svgBox200 = await overlaySvg.boundingBox();
    expect(svgBox200).not.toBeNull();
    if (!svgBox200) return;

    await page.mouse.move(
      svgBox200.x + svgBox200.width * normAnchor.x,
      svgBox200.y + svgBox200.height * normAnchor.y
    );
    await page.mouse.down();
    await page.mouse.move(
      svgBox200.x + svgBox200.width * normBox.x,
      svgBox200.y + svgBox200.height * normBox.y
    );
    await page.mouse.up();

    await expect(editorInput).toBeVisible();
    await editorInput.fill(sampleText);
    await page.keyboard.press('Enter');
    await expect(editorInput).toHaveCount(0);

    const callout2Group = overlaySvg.locator('g[data-testid^="markup-g-"]').last();
    const callout2Box = callout2Group.locator('rect:not([data-testid="selection-bbox"])');
    await expect(callout2Box).toBeVisible();
    const width200Screen = parseFloat((await callout2Box.getAttribute('width'))!);
    const width200PageUnits = width200Screen / 2.0;

    // En unidades de página (pt), la caja debe tener exactamente el mismo ancho
    expect(width200PageUnits).toBeCloseTo(width100PageUnits, 1);

    // 4. Restablecer zoom a 100% y verificar que la caja mide exactamente lo mismo en pantalla
    await resetZoomBtn.click();
    await expect(resetZoomBtn).toHaveText('100%');
    await expect(overlaySvg).toHaveAttribute('width', '800');

    const finalWidthScreen = parseFloat((await callout2Box.getAttribute('width'))!);
    expect(finalWidthScreen).toBeCloseTo(width100Screen, 1);
  });

  test('Sub-entregable A.4: Nota adhesiva técnica stickyNote (atajo N con guarda, popup con 4 colores, commit en confirmación, icono 24x24 pt y reversión atómica)', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    const stickyBtn = page.locator('button[title*="Nota adhesiva"]');
    const selectBtn = page.locator('button[title*="Seleccionar"]');
    await expect(stickyBtn).toBeVisible();

    const popup = page.locator('[data-testid="sticky-note-popup"]');
    const editorInput = page.locator('[data-testid="inline-text-editor-input"]');
    const preview = page.locator('[data-testid="pending-sticky-note-preview"]');

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (!svgBox) return;

    // 1. Atajo N para activar la herramienta Nota Adhesiva
    await page.keyboard.press('n');
    await expect(stickyBtn).toHaveClass(/bg-cad-accent/);

    // 2. Clic en lienzo abre editor contra ancla pendiente con 4 colores y vista previa (Condición 4 y 5)
    await page.mouse.click(svgBox.x + 220, svgBox.y + 160);
    await expect(popup).toBeVisible();
    await expect(preview).toBeVisible();

    // Comprobar presencia de los 4 colores predefinidos (Condición 5)
    await expect(page.locator('[data-testid="sticky-color-yellow"]')).toBeVisible();
    await expect(page.locator('[data-testid="sticky-color-green"]')).toBeVisible();
    await expect(page.locator('[data-testid="sticky-color-pink"]')).toBeVisible();
    await expect(page.locator('[data-testid="sticky-color-blue"]')).toBeVisible();

    // 3. Guarda del atajo N: al escribir 'n' dentro del editor, no cambia de herramienta ni rompe el input (Condición 6)
    await page.keyboard.press('n');
    expect(await editorInput.inputValue()).toBe('n');
    await expect(stickyBtn).toHaveClass(/bg-cad-accent/);

    // 4. Cancelar con Escape: descarta la nota sin dejar paso en historial (Condición 4: cancelada = 0 comandos)
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(preview).toHaveCount(0);

    // El número de marcas debe permanecer en 1 (solo la marca de calibración inicial)
    const initialGroups = overlaySvg.locator('g[data-testid^="markup-g-"]');
    await expect(initialGroups).toHaveCount(1);

    // 5. Creación al confirmar con preset verde (Condición 1, 4 y 5: creada = un comando, 24x24 pt en escala 1)
    await page.mouse.click(svgBox.x + 220, svgBox.y + 160);
    await expect(popup).toBeVisible();

    await page.locator('[data-testid="sticky-color-green"]').click();
    await editorInput.fill('Detalle estructural viga V-1');
    await page.keyboard.press('Enter');

    await expect(popup).toHaveCount(0);
    await expect(preview).toHaveCount(0);

    // Exactamente 2 marcas ahora (calibración + nota adhesiva creada en un solo comando)
    await expect(initialGroups).toHaveCount(2);

    const stickyGroup = initialGroups.last();
    const stickyRect = stickyGroup.locator('rect:not([data-testid="selection-bbox"])');
    await expect(stickyRect).toBeVisible();

    // Verificar dimensiones cuadradas en puntos (Condición 1: 24x24 pt a escala 1)
    expect(await stickyRect.getAttribute('width')).toBe('24');
    expect(await stickyRect.getAttribute('height')).toBe('24');
    expect(await stickyRect.getAttribute('fill')).toBe('#bbf7d0');
    expect(await stickyRect.getAttribute('stroke')).toBe('#16a34a');

    // Caja de selección visible con padding estándar de 4px por lado (24 + 8 = 32)
    const selBbox = stickyGroup.locator('rect[data-testid="selection-bbox"]');
    await expect(selBbox).toBeVisible();
    expect(await selBbox.getAttribute('width')).toBe('32');
    expect(await selBbox.getAttribute('height')).toBe('32');

    // 6. Doble clic reabre popup con texto y preset existente, y permite cambiar color (Condición 5)
    await selectBtn.click();
    await page.mouse.dblclick(svgBox.x + 220 + 12, svgBox.y + 160 + 12);
    await expect(popup).toBeVisible();
    expect(await editorInput.inputValue()).toBe('Detalle estructural viga V-1');

    // Cambiar a rosa y confirmar con Enter
    await page.locator('[data-testid="sticky-color-pink"]').click();
    await page.keyboard.press('Enter');
    await expect(popup).toHaveCount(0);

    expect(await stickyRect.getAttribute('fill')).toBe('#fbcfe8');
    expect(await stickyRect.getAttribute('stroke')).toBe('#db2777');

    // 7. Enter con texto vacío crea nota vacía con icono visible (Condición 4)
    await stickyBtn.click();
    await page.mouse.click(svgBox.x + 350, svgBox.y + 200);
    await expect(popup).toBeVisible();
    await page.keyboard.press('Enter'); // Confirmar texto vacío

    await expect(popup).toHaveCount(0);
    await expect(initialGroups).toHaveCount(3);

    const emptyStickyGroup = initialGroups.last();
    const emptyStickyRect = emptyStickyGroup.locator('rect:not([data-testid="selection-bbox"])');
    await expect(emptyStickyRect).toBeVisible();
    expect(await emptyStickyRect.getAttribute('width')).toBe('24');
    expect(await emptyStickyRect.getAttribute('height')).toBe('24');

    // 8. Deshacer atómico con Ctrl+Z (Condición 4)
    await page.keyboard.press('Control+z');
    await expect(initialGroups).toHaveCount(2); // Nota vacía eliminada en un solo paso

    await page.keyboard.press('Control+z'); // Deshace cambio de color a rosa (vuelve a verde)
    expect(await stickyRect.getAttribute('fill')).toBe('#bbf7d0');

    await page.keyboard.press('Control+z'); // Deshace la creación de la nota verde
    await expect(initialGroups).toHaveCount(1);
  });
});


