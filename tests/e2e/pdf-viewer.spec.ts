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

  test('Sub-entregable A.5: Resaltador vectorial highlightVector (atajo H, guarda de foco, previsualización en vivo, creación atómica, mixBlendMode multiply, umbral de pantalla y undo/redo)', async ({
    page,
  }) => {
    await page.goto('/');

    const svgOverlay = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(svgOverlay).toBeVisible({ timeout: 15000 });
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toBeVisible();

    const initialGroups = svgOverlay.locator('g[data-testid^="markup-g-"]');
    const initialCount = await initialGroups.count();

    // 1. Guarda de foco: escribir en un input no dispara el atajo H
    const textInput = markupsPanel.locator('input[type="text"]').first();
    if (await textInput.count() > 0) {
      await textInput.focus();
      await page.keyboard.press('h');
      const hlBtn = page.locator('button[title="Resaltador vectorial (H)"]');
      await expect(hlBtn).not.toHaveClass(/bg-cad-accent/);
      await page.locator('header').click(); // Quitar foco
    }

    // 2. Atajo H activa la herramienta highlightVector
    await page.keyboard.press('h');
    const hlBtn = page.locator('button[title="Resaltador vectorial (H)"]');
    await expect(hlBtn).toHaveClass(/bg-cad-accent/);

    const svgBox = (await svgOverlay.boundingBox())!;

    // 3. Condición 1: Umbral de pantalla (micro-movimiento < 4 px no crea marca)
    await page.mouse.move(svgBox.x + 80, svgBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 82, svgBox.y + 81); // 2.23 px < 4 px
    await page.mouse.up();
    await expect(initialGroups).toHaveCount(initialCount);

    // 4. Previsualización en vivo durante el arrastre y cancelación con Escape (0 marcas)
    await page.mouse.move(svgBox.x + 100, svgBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 220, svgBox.y + 160);

    const preview = page.locator('[data-testid="highlight-vector-preview"]');
    await expect(preview).toBeVisible();
    expect(await preview.getAttribute('fill')).toBe('#ffff00');
    expect(await preview.getAttribute('opacity')).toBe('0.5');

    // Cancelar arrastre con Escape
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
    await expect(initialGroups).toHaveCount(initialCount);

    // 5. Creación atómica con arrastre > 4 px (1 comando en historial)
    await page.mouse.move(svgBox.x + 120, svgBox.y + 120);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 260, svgBox.y + 180);
    await page.mouse.up();

    await expect(initialGroups).toHaveCount(initialCount + 1);

    const hlGroup = initialGroups.last();
    const hlRect = hlGroup.locator('rect:not([data-testid="selection-bbox"])');
    await expect(hlRect).toBeVisible();
    expect(await hlRect.getAttribute('fill')).toBe('#ffff00');
    expect(await hlRect.getAttribute('opacity')).toBe('0.5');

    // Verificar estilo mix-blend-mode: multiply en el DOM
    const blendMode = await hlRect.evaluate((el) => window.getComputedStyle(el).mixBlendMode);
    expect(blendMode).toBe('multiply');

    // 6. Verificar presencia en MarkupsList con icono y tipo
    const tableRow = markupsPanel.locator('tbody tr').last();
    await expect(tableRow).toBeVisible();
    await expect(tableRow.locator('td').nth(1)).toContainText('highlightVector');

    // 7. Deshacer y Rehacer atómicos (Ctrl+Z y Ctrl+Y)
    await page.keyboard.press('Control+z');
    await expect(initialGroups).toHaveCount(initialCount);

    await page.keyboard.press('Control+y');
    await expect(initialGroups).toHaveCount(initialCount + 1);

    // 8. Selección y traslación con la herramienta V
    const selectBtn = page.locator('button[title="Seleccionar (V)"]');
    await selectBtn.click();

    // Clic en el centro del highlight para seleccionarlo
    await page.mouse.click(svgBox.x + 190, svgBox.y + 150);
    const selectionBbox = page.locator('[data-testid="selection-bbox"]');
    await expect(selectionBbox).toBeVisible();

    // Arrastre en modo selección (> 4 px) para trasladar
    const initialBboxX = parseFloat((await selectionBbox.getAttribute('x'))!);
    await page.mouse.move(svgBox.x + 190, svgBox.y + 150);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 240, svgBox.y + 150);
    await page.mouse.up();

    const translatedBboxX = parseFloat((await selectionBbox.getAttribute('x'))!);
    expect(translatedBboxX).toBeGreaterThan(initialBboxX);

    // Deshacer la traslación
    await page.keyboard.press('Control+z');
    const revertedBboxX = parseFloat((await selectionBbox.getAttribute('x'))!);
    expect(revertedBboxX).toBeCloseTo(initialBboxX, 0);
  });

  test('Sub-entregable A.6: Resaltador de texto highlightText (atajo Shift+H vs H, guarda de foco, selección real con offset, cobertura geométrica, escala 200%, multilínea atómica y toast en página sin texto)', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toBeVisible();

    const textLayer = page.locator('[data-testid="pdf-text-layer"]');
    await expect(textLayer).toBeVisible();
    const titleSpan = textLayer.locator('span').filter({ hasText: 'PLANO DE PRUEBA' }).first();
    await expect(titleSpan).toBeVisible({ timeout: 15000 });

    const textBtn = page.locator('button[title*="Resaltador de texto"]');
    const vectorBtn = page.locator('button[title*="Resaltador vectorial"]');
    await expect(textBtn).toBeVisible();
    await expect(vectorBtn).toBeVisible();

    // 1. Guarda de foco: con un input enfocado en MarkupsList, Shift+H y H no cambian de herramienta
    const commentInput = markupsPanel.locator('input[type="text"]').first();
    await commentInput.focus();
    await page.keyboard.press('Shift+H');
    await expect(textBtn).not.toHaveClass(/bg-cad-accent/);
    await page.keyboard.press('h');
    await expect(vectorBtn).not.toHaveClass(/bg-cad-accent/);

    // Quitar foco haciendo clic en header
    await page.locator('header').click();

    // 2. Distinción de atajos sin foco: H activa resaltador vectorial, Shift+H activa resaltador de texto
    await page.keyboard.press('h');
    await expect(vectorBtn).toHaveClass(/bg-cad-accent/);
    await expect(textBtn).not.toHaveClass(/bg-cad-accent/);

    await page.keyboard.press('Shift+H');
    await expect(textBtn).toHaveClass(/bg-cad-accent/);
    await expect(vectorBtn).not.toHaveClass(/bg-cad-accent/);

    // Colapsar panel inferior para dar espacio vertical completo al lienzo
    const collapsePanelBtn = markupsPanel.locator('button').first();
    await collapsePanelBtn.click();
    await expect(markupsPanel).toHaveCSS('height', '32px');

    const spanBox = (await titleSpan.boundingBox())!;
    expect(spanBox).not.toBeNull();

    const initialGroups = overlaySvg.locator('g[data-testid^="markup-g-"]');
    const initialCount = await initialGroups.count();

    // Arrastre real con ratón sobre el texto del título
    await page.mouse.move(spanBox.x + 4, spanBox.y + spanBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(spanBox.x + spanBox.width - 4, spanBox.y + spanBox.height / 2, { steps: 5 });
    await page.mouse.up();

    // Se crea exactamente 1 marca nueva de tipo highlightText
    await expect(initialGroups).toHaveCount(initialCount + 1);

    const hlGroup = initialGroups.last();
    const hlRect = hlGroup.locator('rect:not([data-testid="selection-bbox"])');
    await expect(hlRect).toBeVisible();

    // Condición 8: Aserción fuerte de contenido en MarkupsList (reabrir panel)
    await collapsePanelBtn.click();
    await expect(markupsPanel).toHaveCSS('height', '200px');
    const newRow = markupsPanel.locator('tbody tr').last();
    await expect(newRow).toBeVisible();
    await expect(newRow.locator('td').nth(1)).toContainText('highlightText');
    const textInRow = await newRow.locator('input[type="text"]').inputValue();
    expect(textInRow).toContain('PLANO DE PRUEBA');

    // Colapsar panel para continuar pruebas de lienzo
    await collapsePanelBtn.click();
    await expect(markupsPanel).toHaveCSS('height', '32px');

    // Condición 1: Cobertura geométrica (rectángulo cubre la caja del tramo dentro de <= 8 px de tolerancia)
    const hlBox = (await hlRect.boundingBox())!;
    expect(Math.abs(hlBox.x - spanBox.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(hlBox.y - spanBox.y)).toBeLessThanOrEqual(8);
    expect(Math.abs(hlBox.width - spanBox.width)).toBeLessThanOrEqual(8);
    expect(Math.abs(hlBox.height - spanBox.height)).toBeLessThanOrEqual(8);

    // 4. Escala 200% y --scale-factor (Condición 2)
    const zoomInBtn = page.locator('button[title="Acercar (+)"]');
    const resetZoomBtn = page.locator('button[title="Restablecer zoom a 100%"]');

    // Colapsar panel lateral de páginas para dar amplitud horizontal completa al lienzo
    const collapseThumbnailsBtn = page.locator('button[title="Colapsar panel"]');
    await collapseThumbnailsBtn.click();

    // Aumentar zoom hasta 200% (4 pasos de 0.25)
    for (let i = 0; i < 4; i++) {
      await zoomInBtn.click();
    }
    await expect(resetZoomBtn).toHaveText('200%');
    await expect(overlaySvg).toHaveAttribute('width', '1600');

    // Validar que la variable CSS --scale-factor está fijada a 2
    const scaleFactor = await textLayer.evaluate((el) => el.style.getPropertyValue('--scale-factor'));
    expect(scaleFactor.trim()).toBe('2');

    const countBefore200 = await initialGroups.count();
    const controlSpan = textLayer.locator('span').filter({ hasText: 'RECTÁNGULO DE CONTROL' }).first();
    await expect(controlSpan).toBeVisible();
    await controlSpan.scrollIntoViewIfNeeded();
    const subBox200 = (await controlSpan.boundingBox())!;

    await page.mouse.move(subBox200.x + 4, subBox200.y + subBox200.height / 2);
    await page.mouse.down();
    await page.mouse.move(subBox200.x + subBox200.width - 4, subBox200.y + subBox200.height / 2, { steps: 5 });
    await page.mouse.up();

    await expect(initialGroups).toHaveCount(countBefore200 + 1);

    const subHlRect = overlaySvg
      .locator('g[data-testid^="markup-g-"]')
      .last()
      .locator('rect:not([data-testid="selection-bbox"])');
    await expect(subHlRect).toBeVisible();
    const subHlBox200 = (await subHlRect.boundingBox())!;

    // Cobertura geométrica a 2x
    expect(Math.abs(subHlBox200.x - subBox200.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(subHlBox200.y - subBox200.y)).toBeLessThanOrEqual(8);
    expect(Math.abs(subHlBox200.width - subBox200.width)).toBeLessThanOrEqual(8);
    expect(Math.abs(subHlBox200.height - subBox200.height)).toBeLessThanOrEqual(8);

    // Restablecer zoom a 100% y verificar que la marca creada a 2x cubre el texto a 1x con la misma precisión
    await resetZoomBtn.click();
    await expect(resetZoomBtn).toHaveText('100%');
    await expect(overlaySvg).toHaveAttribute('width', '800');

    const subBox100 = (await controlSpan.boundingBox())!;
    const subHlBox100 = (await subHlRect.boundingBox())!;

    expect(Math.abs(subHlBox100.x - subBox100.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(subHlBox100.y - subBox100.y)).toBeLessThanOrEqual(8);
    expect(Math.abs(subHlBox100.width - subBox100.width)).toBeLessThanOrEqual(8);
    expect(Math.abs(subHlBox100.height - subBox100.height)).toBeLessThanOrEqual(8);

    // 5. Selección multilínea atómica, arrastre conjunto y reversión (Condición 4)
    await page.keyboard.press('Escape');
    await textBtn.click();

    const countBeforeMulti = await initialGroups.count();

    // Arrastrar a través de dos líneas consecutivas (RECTÁNGULO DE CONTROL y Norm)
    const line1Span = textLayer.locator('span').filter({ hasText: 'RECTÁNGULO DE CONTROL' }).first();
    const line2Span = textLayer.locator('span').filter({ hasText: 'Norm: x=' }).first();
    await expect(line1Span).toBeVisible();
    await expect(line2Span).toBeVisible();

    const span1Box = (await line1Span.boundingBox())!;
    const span2Box = (await line2Span.boundingBox())!;

    await page.mouse.move(span1Box.x + 10, span1Box.y + span1Box.height / 2);
    await page.mouse.down();
    await page.mouse.move(span2Box.x + span2Box.width / 2, span2Box.y + span2Box.height / 2, { steps: 5 });
    await page.mouse.up();

    const countAfterMulti = await initialGroups.count();
    expect(countAfterMulti).toBeGreaterThan(countBeforeMulti);
    const createdMultiCount = countAfterMulti - countBeforeMulti;
    expect(createdMultiCount).toBeGreaterThanOrEqual(2);

    // Arrastre conjunto en modo selección de las marcas del grupo
    const selectBtn = page.locator('button[title="Seleccionar (V)"]');
    await selectBtn.click();

    const selBboxes = overlaySvg.locator('rect[data-testid="selection-bbox"]');
    await expect(selBboxes.first()).toBeVisible();
    const initialSelX = parseFloat((await selBboxes.first().getAttribute('x'))!);

    await page.mouse.move(span1Box.x + 10, span1Box.y + span1Box.height / 2);
    await page.mouse.down();
    await page.mouse.move(span1Box.x + 40, span1Box.y + span1Box.height / 2);
    await page.mouse.up();

    const movedSelX = parseFloat((await selBboxes.first().getAttribute('x'))!);
    expect(movedSelX).toBeGreaterThan(initialSelX);

    // 1 Ctrl+Z deshace la traslación de todo el grupo
    await page.keyboard.press('Control+z');
    const revertedSelX = parseFloat((await selBboxes.first().getAttribute('x'))!);
    expect(revertedSelX).toBeCloseTo(initialSelX, 0);

    // 1 Ctrl+Z adicional deshace la creación de todas las marcas del grupo multilínea en un paso atómico
    await page.keyboard.press('Control+z');
    await expect(initialGroups).toHaveCount(countBeforeMulti);

    // 1 Ctrl+Y restaura todas las marcas del grupo multilínea en un paso atómico
    await page.keyboard.press('Control+y');
    await expect(initialGroups).toHaveCount(countAfterMulti);

    // 6. Página 3 (sin capa de texto) y aviso accesible (Condición 3 y 9)
    const nextPageBtn = page.locator('button[title="Página siguiente"]');
    await nextPageBtn.click(); // Página 2
    await nextPageBtn.click(); // Página 3

    const pageIndicator = page.locator('header span.font-mono.px-1');
    await expect(pageIndicator).toContainText('3 / 3');

    // Esperar a que la página 3 termine de renderizar con 0 texto (data-has-text="false")
    await expect(page.locator('[data-testid="pdf-page-container"]')).toHaveAttribute(
      'data-has-text',
      'false'
    );

    // Intentar activar la herramienta highlightText en la página 3 dispara el toast accesible
    await page.keyboard.press('Shift+H');
    const toast = page.locator('[role="alert"]');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText(
      'Esta página no contiene capa de texto seleccionable. Utilice el resaltador vectorial (H).'
    );

    // Clic en el lienzo con highlightText activo en página sin texto vuelve a disparar el aviso
    await textLayer.click({ position: { x: 100, y: 100 } });
    await expect(toast).toBeVisible();

    // 0 marcas creadas y 0 comandos añadidos en página 3
    const page3Groups = overlaySvg.locator('g[data-testid^="markup-g-"]');
    await expect(page3Groups).toHaveCount(0);

    // Guiar al usuario al resaltador vectorial (H)
    await page.keyboard.press('h');
    await expect(vectorBtn).toHaveClass(/bg-cad-accent/);
  });

  test('Sub-entregable B.4 / B.5: Tool Chest (panel lateral, paletas, miniaturas vectoriales, drag & drop al canvas con tolerancia <= 5px, modo propiedad sobre K marcas y contexto en lista de marcas)', async ({
    page,
  }) => {
    // 1. Cargar la aplicación
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    const toolChestPanel = page.locator('[data-testid="tool-chest-panel"]');
    await expect(toolChestPanel).toBeVisible();

    // 2. Expandir el panel de Tool Chest si está colapsado
    const expandBtn = page.locator('[data-testid="expand-tool-chest-btn"]');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }
    await expect(toolChestPanel).toHaveAttribute('data-collapsed', 'false');

    // 3. Verificar paleta por defecto "Mis Herramientas" y sección de recientes
    const paletteSelect = page.locator('[data-testid="palette-select"]');
    await expect(paletteSelect).toBeVisible();
    await expect(paletteSelect).toHaveValue('default-palette');

    const recentSection = page.locator('[data-testid="recent-tools-section"]');
    await expect(recentSection).toBeVisible();

    // 4. Añadir la marca de calibración al Tool Chest mediante el botón en la lista de marcas
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toBeVisible();

    const calibRow = page.locator('[data-testid="markup-row-calibration-markup-1"]');
    await expect(calibRow).toBeVisible();

    // Añadir al Tool Chest mediante clic derecho (menú contextual)
    await calibRow.click({ button: 'right' });
    const contextMenu = page.locator('[data-testid="markups-list-context-menu"]');
    await expect(contextMenu).toBeVisible();

    const addToToolChestItem = page.locator('[data-testid="context-menu-add-to-toolchest"]');
    await addToToolChestItem.click();

    // 5. Verificar que la herramienta aparece en la paleta activa con su miniatura vectorial
    const toolItems = toolChestPanel.locator('[data-testid^="tool-item-"]');
    await expect(toolItems).toHaveCount(1);
    const addedTool = toolItems.first();
    await expect(addedTool).toBeVisible();
    await expect(addedTool).toHaveAttribute('data-tool-type', 'rectangle');
    await expect(addedTool).toHaveAttribute('data-tool-mode', 'drawing');

    // La miniatura vectorial utiliza el pipeline canónico
    const thumb = addedTool.locator('[data-testid="tool-vector-thumbnail-rectangle"]');
    await expect(thumb).toBeVisible();

    // Sub-entregable B.5: Drag & Drop desde Tool Chest al canvas con tolerancia <= 5px
    // =========================================================================================
    // NOTA DE AUDITORÍA Y LIMITACIÓN DE PLAYWRIGHT:
    // Este test E2E sintetiza los eventos DragEvent ('dragover' y 'drop') directamente en el DOM
    // mediante page.evaluate y DataTransfer con el tipo MIME 'application/rea-tool'.
    // Esto verifica la lógica interna del frontend: conversión de coordenadas, centrado dentro de
    // tolerancia <= 5px, creación atómica de marca y registro en recientes a nivel de motor web.
    // SIN EMBARGO, este test NO ejercita el pipeline OLE/nativo de arrastre del sistema operativo
    // en WebView2/Windows. En la ventana nativa de Tauri 2, el gestor nativo de arrastre de archivos
    // de la ventana intercepta los eventos OLE a menos que se configure explícitamente
    // "dragDropEnabled": false en src-tauri/tauri.conf.json. Por tanto, este test en verde NO
    // sustituye la comprobación nativa del usuario en la ventana real de Tauri.
    // =========================================================================================
    const initialGroups = overlaySvg.locator('g[data-testid^="markup-g-"]');
    const initialCount = await initialGroups.count(); // 1 marca inicial (calibración)

    const svgBox = (await overlaySvg.boundingBox())!;
    const dropTargetX = Math.round(svgBox.x + 200);
    const dropTargetY = Math.round(svgBox.y + 250);

    // Obtener ID de la herramienta añadida
    const toolTestId = await addedTool.getAttribute('data-testid');
    const toolId = toolTestId ? toolTestId.replace('tool-item-', '') : 'fallback-id';
    const toolPayload = {
      id: toolId,
      paletteId: 'default-palette',
      name: 'Rectángulo Dropped',
      type: 'rectangle',
      style: { strokeColor: '#db2777', fillColor: 'rgba(219,39,119,0.2)', strokeWidth: 3, opacity: 1 },
      mode: 'drawing',
    };

    // Despachar eventos nativos DragEvent con tipo MIME 'application/rea-tool'
    await page.evaluate(
      ({ selector, payload, clientX, clientY }) => {
        const target = document.querySelector(selector);
        if (!target) throw new Error('Target not found: ' + selector);

        const dt = new DataTransfer();
        dt.setData('application/rea-tool', JSON.stringify(payload));

        const dragOver = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          dataTransfer: dt,
        });
        target.dispatchEvent(dragOver);

        const drop = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          dataTransfer: dt,
        });
        target.dispatchEvent(drop);
      },
      {
        selector: '[data-testid="pdf-page-container"]',
        payload: toolPayload,
        clientX: dropTargetX,
        clientY: dropTargetY,
      }
    );

    // Invocación única de addMarkup: el conteo debe incrementar en exactamente 1
    await expect(initialGroups).toHaveCount(initialCount + 1);

    // Verificar tolerancia <= 5px entre el cursor de drop y el centro de la marca creada
    const droppedGroup = initialGroups.last();
    const droppedRect = droppedGroup.locator('rect:not([data-testid="selection-bbox"])');
    await expect(droppedRect).toBeVisible();

    const droppedBox = (await droppedRect.boundingBox())!;
    const droppedCenterX = droppedBox.x + droppedBox.width / 2;
    const droppedCenterY = droppedBox.y + droppedBox.height / 2;

    expect(Math.abs(droppedCenterX - dropTargetX)).toBeLessThanOrEqual(5);
    expect(Math.abs(droppedCenterY - dropTargetY)).toBeLessThanOrEqual(5);

    // La herramienta se añadió automáticamente a Herramientas Recientes
    const recentItems = toolChestPanel.locator('[data-testid^="recent-tool-"]');
    await expect(recentItems).toHaveCount(1);

    // 7. Probar Modo Propiedad sobre K marcas seleccionadas (un único comando atómico)
    // Cambiar la herramienta a Modo Propiedad ('P')
    const modeToggleBtn = addedTool.locator('[data-testid^="tool-mode-toggle-"]');
    await modeToggleBtn.click();
    await expect(addedTool).toHaveAttribute('data-tool-mode', 'properties');
    await expect(modeToggleBtn).toHaveText('P');

    // Seleccionar ambas marcas en el lienzo mediante Shift+Click
    const calibGroup = initialGroups.first();
    const calibRect = calibGroup.locator('rect:not([data-testid="selection-bbox"])');
    const calibBox = (await calibRect.boundingBox())!;

    // Clic en herramienta de selección
    const selectBtn = page.locator('button[title*="Seleccionar"]');
    await selectBtn.click();

    // Seleccionar primera marca y con Shift la segunda
    await page.mouse.click(calibBox.x + calibBox.width / 2, calibBox.y + calibBox.height / 2);
    await page.keyboard.down('Shift');
    await page.mouse.click(droppedCenterX, droppedCenterY);
    await page.keyboard.up('Shift');

    // Dos marcas seleccionadas
    const selBboxes = overlaySvg.locator('rect[data-testid="selection-bbox"]');
    await expect(selBboxes).toHaveCount(2);

    // Aplicar estilo de herramienta en Modo Propiedad haciendo clic sobre ella en Tool Chest
    await addedTool.click();

    // Ambas marcas reciben el estilo de la herramienta (strokeColor = #0284c7)
    await expect(calibRect).toHaveAttribute('stroke', '#0284c7');
    await expect(droppedRect).toHaveAttribute('stroke', '#0284c7');

    // Reversión con un único Ctrl+Z revierte la marca dropped a su color original (#db2777)
    await page.keyboard.press('Control+z');
    await expect(droppedRect).toHaveAttribute('stroke', '#db2777');

    // 8. Colapsar el panel lateral para mantener el layout limpio
    const collapseBtn = page.locator('[data-testid="collapse-tool-chest-btn"]');
    await collapseBtn.click();
    await expect(toolChestPanel).toHaveAttribute('data-collapsed', 'true');
  });
});



