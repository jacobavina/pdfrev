import { test, expect } from '@playwright/test';

test.describe('Fase 1: Motor de Anotaciones y Visor PDF', () => {
  // Estas pruebas hacen clic por coordenadas con el ancho del visor fijo: sin abrir paneles al seleccionar
  // (ADR-0043). La apertura automática tiene su propia prueba, que la activa desde View.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('rea-auto-panels')) localStorage.setItem('rea-auto-panels', '0');
    });
  });

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
    await expect(markupsPanel).toContainText('Markups List');

    // 7. Verificar sincronización bidireccional: la fila de la marca de calibración
    const calibrationRow = page.locator('[data-testid="markup-row-calibration-markup-1"]');
    await expect(calibrationRow).toBeVisible();
    // Desde ADR-0017 la lista muestra el tipo en español
    await expect(calibrationRow).toContainText('Rectangle');
    await expect(calibrationRow).toContainText('Structural Eng.');

    // 8. Edición de estado en vivo desde la tabla
    const statusSelect = calibrationRow.locator('select');
    await expect(statusSelect).toHaveValue('pending');
    await statusSelect.selectOption('accepted');
    await expect(statusSelect).toHaveValue('accepted');

    // 9. Selección interactiva: hacer clic en la fila resalta el elemento
    await calibrationRow.click();
    await expect(calibrationRow).toHaveClass(/bg-cad-accent/);

    // 10. Deshacer el cambio con el botón Undo
    const undoButton = page.locator('button[title*="Undo"]');
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
    const circleBtn = page.locator('button[title*="Ellipse (O)"]');
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
    await expect(markupsPanel.locator('tbody')).toContainText('Ellipse');

    // 2. Dibuja Polígono con tecla Enter para cerrar (Criterio 3)
    const polygonBtn = page.locator('button[title*="Polygon (P)"]');
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
    await expect(markupsPanel.locator('tbody')).toContainText('Polygon');

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
    const exportBtn = page.locator('button[title*="Export a vector PDF"]');
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
    const rectBtn = page.locator('button[title*="Rectangle (R)"]');
    await rectBtn.click();

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (svgBox) {
      await page.mouse.move(svgBox.x + 100, svgBox.y + 100);
      await page.mouse.down();
      await page.mouse.move(svgBox.x + 200, svgBox.y + 200);
      await page.mouse.up();
    }

    const exportBtn = page.locator('button[title*="Export a vector PDF"]');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    // Capturar la descarga desencadenada por el Blob y la etiqueta <a>
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('_markups.pdf');
  });

  test('Sub-entregable A.0: Selección, arrastre con umbral 4px, traslación 50px y reversión atómica con Ctrl+Z', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    // 1. Dibujar un rectángulo técnico de prueba
    const rectBtn = page.locator('button[title*="Rectangle (R)"]');
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
    const selectBtn = page.locator('button[title*="Select (V)"]');
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
    // Festón estilo Revu (ADR-0021): arcos como cúbicas "C"
    const cloudPath = overlaySvg.locator('path[d*="C"]').last();
    await expect(cloudPath).toBeVisible();

    const calloutText = overlaySvg.locator('text:has-text("Cloud+ note")').last();
    await expect(calloutText).toBeVisible();

    // Guardar captura para verificación visual de la curvatura y flecha del abombamiento
    await page.screenshot({
      path: 'C:/Users/jmm_j/.gemini/antigravity/brain/9026c7fb-b4c3-4cb1-906c-879487ed1de7/cloud_visual_verification.png',
    });

    // Comprobar que en la lista de marcas aparecen cloudPlus y callout
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel.locator('tbody')).toContainText('Cloud+');
    await expect(markupsPanel.locator('tbody')).toContainText('Callout');

    // 4. Cambiar a herramienta Seleccionar (V)
    const selectBtn = page.locator('button[title*="Select (V)"]');
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
    await expect(overlaySvg.locator('text:has-text("Cloud+ note")')).toHaveCount(0);

    // 9. Deshacer el borrado con Ctrl+Z: un solo paso restaura el grupo completo
    await page.keyboard.press('Control+z');
    await expect(overlaySvg.locator('text:has-text("Cloud+ note")').last()).toBeVisible();
    await expect(markupsPanel.locator('tbody')).toContainText('Cloud+');
    await expect(markupsPanel.locator('tbody')).toContainText('Callout');
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
    const rectBtn = page.locator('button[title*="Rectangle (R)"]');
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
    const selectBtn = page.locator('button[title*="Select (V)"]');
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

  test('Sub-entregable A.3: Creación de Callout con directriz, edición inline, movimiento independiente de ancla y arrastre de la caja con la punta fija', async ({
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
    const calloutBtn = page.locator('button[title*="Callout (Q)"]');
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
    await expect(markupsPanel.locator('tbody')).toContainText('Callout');

    // 5. Cambiar a herramienta Seleccionar (V)
    const selectBtn = page.locator('button[title*="Select (V)"]');
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

    // 7. Arrastre de la caja del callout: como en Revu y Foxit (ADR-0042) se mueve la caja y la punta de la flecha
    // sigue señalando el mismo sitio
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

    // La punta no se mueve (ADR-0042)
    expect(deltaAnchorX).toBeCloseTo(0, 0);
    expect(deltaAnchorY).toBeCloseTo(0, 0);

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

    const calloutBtn = page.locator('button[title*="Callout (Q)"]');
    const zoomInBtn = page.locator('button[title="Zoom in (+)"]');
    const resetZoomBtn = page.locator('button[title*="Reset zoom"]');
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

    const stickyBtn = page.locator('button[title*="Note (N)"]');
    const selectBtn = page.locator('button[title*="Select (V)"]');
    await expect(stickyBtn).toBeVisible();

    const popup = page.locator('[data-testid="sticky-note-popup"]');
    const editorInput = page.locator('[data-testid="inline-text-editor-input"]');
    const preview = page.locator('[data-testid="pending-sticky-note-preview"]');

    const svgBox = await overlaySvg.boundingBox();
    expect(svgBox).not.toBeNull();
    if (!svgBox) return;

    // 1. Atajo N para activar la herramienta Nota Adhesiva
    await page.keyboard.press('n');
    await expect(stickyBtn).toHaveAttribute('aria-pressed', 'true');

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
    await expect(stickyBtn).toHaveAttribute('aria-pressed', 'true');

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
    // Contar solo cuando la marca de demostración ya cargó (si no, el recuento inicial puede ser 0)
    await expect(page.locator('[data-testid="markup-row-calibration-markup-1"]')).toBeVisible();

    const initialGroups = svgOverlay.locator('g[data-testid^="markup-g-"]');
    const initialCount = await initialGroups.count();

    // 1. Guarda de foco: escribir en un input no dispara el atajo H
    const textInput = markupsPanel.locator('input[type="text"]').first();
    if (await textInput.count() > 0) {
      await textInput.focus();
      await page.keyboard.press('h');
      const hlBtn = page.locator('button[title="Highlight (H)"]');
      await expect(hlBtn).toHaveAttribute('aria-pressed', 'false');
      await page.locator('header').click(); // Quitar foco
    }

    // 2. Atajo H activa la herramienta highlightVector
    await page.keyboard.press('h');
    const hlBtn = page.locator('button[title="Highlight (H)"]');
    await expect(hlBtn).toHaveAttribute('aria-pressed', 'true');

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
    await expect(tableRow.locator('td').nth(1)).toContainText('Highlight');

    // 7. Deshacer y Rehacer atómicos (Ctrl+Z y Ctrl+Y)
    await page.keyboard.press('Control+z');
    await expect(initialGroups).toHaveCount(initialCount);

    await page.keyboard.press('Control+y');
    await expect(initialGroups).toHaveCount(initialCount + 1);

    // 8. Selección y traslación con la herramienta V
    const selectBtn = page.locator('button[title="Select (V)"]');
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

    const textBtn = page.locator('button[title*="Text Highlight"]');
    const vectorBtn = page.locator('button[title*="Highlight (H)"]');
    await expect(textBtn).toBeVisible();
    await expect(vectorBtn).toBeVisible();

    // 1. Guarda de foco: con un input enfocado en MarkupsList, Shift+H y H no cambian de herramienta
    const commentInput = markupsPanel.locator('input[type="text"]').first();
    await commentInput.focus();
    await page.keyboard.press('Shift+H');
    await expect(textBtn).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('h');
    await expect(vectorBtn).toHaveAttribute('aria-pressed', 'false');

    // Quitar foco haciendo clic en header
    await page.locator('header').click();

    // 2. Distinción de atajos sin foco: H activa resaltador vectorial, Shift+H activa resaltador de texto
    await page.keyboard.press('h');
    await expect(vectorBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(textBtn).toHaveAttribute('aria-pressed', 'false');

    await page.keyboard.press('Shift+H');
    await expect(textBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(vectorBtn).toHaveAttribute('aria-pressed', 'false');

    // Colapsar panel inferior para dar espacio vertical completo al lienzo
    const collapsePanelBtn = markupsPanel.locator('button').first();
    await collapsePanelBtn.click();
    await expect(markupsPanel).toHaveCSS('height', '32px');

    const spanBox = (await titleSpan.boundingBox())!;
    expect(spanBox).not.toBeNull();

    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);
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
    // Alto por defecto de la lista (ADR-0044)
    await expect(markupsPanel).toHaveCSS('height', '168px');
    const newRow = markupsPanel.locator('tbody tr').last();
    await expect(newRow).toBeVisible();
    await expect(newRow.locator('td').nth(1)).toContainText('Text Highlight');
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
    const zoomInBtn = page.locator('button[title="Zoom in (+)"]');
    const resetZoomBtn = page.locator('button[title="Reset zoom to 100%"]');

    // Colapsar panel lateral de páginas para dar amplitud horizontal completa al lienzo
    const collapseThumbnailsBtn = page.locator('button[title="Collapse panel"]');
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
    const selectBtn = page.locator('button[title="Select (V)"]');
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
    const nextPageBtn = page.locator('button[title="Next page"]');
    await nextPageBtn.click(); // Página 2
    await nextPageBtn.click(); // Página 3

    // Desde ADR-0017 la navegación de páginas vive en la barra de estado
    const pageIndicator = page.locator('[data-testid="page-indicator"]');
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
      'This page has no selectable text layer. Use the Highlight tool (H).'
    );

    // Clic en el lienzo con highlightText activo en página sin texto vuelve a disparar el aviso
    await textLayer.click({ position: { x: 100, y: 100 } });
    await expect(toast).toBeVisible();

    // 0 marcas creadas y 0 comandos añadidos en página 3
    const page3Groups = overlaySvg.locator('g[data-testid^="markup-g-"]');
    await expect(page3Groups).toHaveCount(0);

    // Guiar al usuario al resaltador vectorial (H)
    await page.keyboard.press('h');
    await expect(vectorBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('Sub-entregable B.4 / B.5: Tool Chest (panel lateral, paletas, miniaturas vectoriales, drag & drop al canvas con tolerancia <= 5px, modo propiedad sobre K marcas y contexto en lista de marcas)', async ({
    page,
  }) => {
    // 1. Cargar la aplicación
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    const toolChestPanel = page.locator('[data-testid="tool-chest-panel"]');
    // Plegado no se ve: se abre desde el riel derecho (ADR-0044)
    await expect(toolChestPanel).toHaveCount(1);

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
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);
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
    const selectBtn = page.locator('button[title*="Select (V)"]');
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

  test('Sub-entregable P2-C.2: Menú contextual de estados técnicos en MarkupsList y sincronización atómica de grupos (Condición 3)', async ({
    page,
  }) => {
    // 1. Cargar la aplicación
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toBeVisible();

    const calibRow = page.locator('[data-testid="markup-row-calibration-markup-1"]');
    await expect(calibRow).toBeVisible();

    // 2. Menú contextual mediante clic derecho en la fila
    await calibRow.click({ button: 'right' });
    const contextMenu = page.locator('[data-testid="markups-list-context-menu"]');
    await expect(contextMenu).toBeVisible();

    // Verificar presencia de opciones de estado y Tool Chest
    await expect(page.locator('[data-testid="context-menu-add-to-toolchest"]')).toBeVisible();
    await expect(page.locator('[data-testid="context-menu-status-pending"]')).toBeVisible();
    await expect(page.locator('[data-testid="context-menu-status-accepted"]')).toBeVisible();
    await expect(page.locator('[data-testid="context-menu-status-rejected"]')).toBeVisible();
    await expect(page.locator('[data-testid="context-menu-status-completed"]')).toBeVisible();
    await expect(page.locator('[data-testid="context-menu-status-cancelled"]')).toBeVisible();

    // 3. Cambiar estado a 'rejected' desde el menú contextual
    await page.locator('[data-testid="context-menu-status-rejected"]').click();
    await expect(contextMenu).not.toBeVisible();

    // Verificar que la fila refleja el nuevo estado
    const statusSelect = calibRow.locator('select');
    await expect(statusSelect).toHaveValue('rejected');

    // 4. Reversión atómica con Ctrl+Z
    await page.keyboard.press('Control+z');
    await expect(statusSelect).toHaveValue('pending');

    // Rehacer con Ctrl+Y
    await page.keyboard.press('Control+y');
    await expect(statusSelect).toHaveValue('rejected');

    // 5. Condición 3: Crear un grupo multilínea y verificar sincronización atómica de estado
    const textLayer = page.locator('[data-testid="pdf-text-layer"]');
    await expect(textLayer).toBeVisible();

    const line1Span = textLayer.locator('span').filter({ hasText: 'RECTÁNGULO DE CONTROL' }).first();
    const line2Span = textLayer.locator('span').filter({ hasText: 'Norm: x=' }).first();
    await expect(line1Span).toBeVisible();
    await expect(line2Span).toBeVisible();

    // Activar resaltador de texto con Shift+H
    await page.keyboard.press('Shift+H');

    const span1Box = (await line1Span.boundingBox())!;
    const span2Box = (await line2Span.boundingBox())!;

    const initialGroups = overlaySvg.locator('g[data-testid^="markup-g-"]');
    const countBeforeMulti = await initialGroups.count();

    await page.mouse.move(span1Box.x + 10, span1Box.y + span1Box.height / 2);
    await page.mouse.down();
    await page.mouse.move(span2Box.x + span2Box.width / 2, span2Box.y + span2Box.height / 2, { steps: 5 });
    await page.mouse.up();

    const countAfterMulti = await initialGroups.count();
    expect(countAfterMulti).toBeGreaterThan(countBeforeMulti);
    const multiLinesCount = countAfterMulti - countBeforeMulti;
    expect(multiLinesCount).toBeGreaterThanOrEqual(2);

    // Salir del modo dibujo
    await page.keyboard.press('Escape');

    // Localizar las filas recién creadas del grupo en MarkupsList
    const allRows = markupsPanel.locator('tbody tr');
    const totalRowCount = await allRows.count();
    const groupRow1 = allRows.nth(totalRowCount - 2);
    const groupRow2 = allRows.nth(totalRowCount - 1);

    const groupSelect1 = groupRow1.locator('select');
    const groupSelect2 = groupRow2.locator('select');
    await expect(groupSelect1).toHaveValue('pending');
    await expect(groupSelect2).toHaveValue('pending');

    // Clic derecho en la primera fila del grupo y cambiar estado a 'completed'
    await groupRow1.click({ button: 'right' });
    await expect(contextMenu).toBeVisible();
    await page.locator('[data-testid="context-menu-status-completed"]').click();
    await expect(contextMenu).not.toBeVisible();

    // AMBAS marcas del grupo deben haberse actualizado a 'completed' atómicamente
    await expect(groupSelect1).toHaveValue('completed');
    await expect(groupSelect2).toHaveValue('completed');

    // 1 Ctrl+Z revierte TODO el grupo de nuevo a 'pending'
    await page.keyboard.press('Control+z');
    await expect(groupSelect1).toHaveValue('pending');
    await expect(groupSelect2).toHaveValue('pending');

    // 1 Ctrl+Y vuelve a aplicar 'completed' a TODO el grupo
    await page.keyboard.press('Control+y');
    await expect(groupSelect1).toHaveValue('completed');
    await expect(groupSelect2).toHaveValue('completed');
  });

  test('Sub-entregable P2-C.3: Columnas personalizadas con parser de gramática cerrada, edición en línea y ordenación', async ({
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

    // 1. Dibujar dos rectángulos
    const rectBtn = page.locator('button[title*="Rectangle (R)"]');
    await rectBtn.click();

    // Rectángulo 1: (100, 100) a (180, 180)
    await page.mouse.move(svgBox.x + 100, svgBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 180, svgBox.y + 180);
    await page.mouse.up();

    // Rectángulo 2: (220, 100) a (300, 180)
    await page.mouse.move(svgBox.x + 220, svgBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + 300, svgBox.y + 180);
    await page.mouse.up();

    await page.keyboard.press('Escape');

    // 2. Abrir modal para añadir columna numérica "Largo"
    const addColBtn = page.locator('[data-testid="add-custom-column-button"]');
    await expect(addColBtn).toBeVisible();
    await addColBtn.click();

    const addModal = page.locator('[data-testid="add-column-modal"]');
    await expect(addModal).toBeVisible();

    await page.locator('[data-testid="column-name-input"]').fill('Largo');
    await page.locator('[data-testid="column-type-select"]').selectOption('number');
    await page.locator('[data-testid="save-column-button"]').click();
    await expect(addModal).not.toBeVisible();

    // Verificar cabecera de la columna creada
    const largoHeader = page.locator('[data-testid="custom-column-header-largo"]');
    await expect(largoHeader).toBeVisible();

    // 3. Abrir modal para añadir columna calculada "Área" con validación de sintaxis
    await addColBtn.click();
    await expect(addModal).toBeVisible();
    await page.locator('[data-testid="column-name-input"]').fill('Área');
    await page.locator('[data-testid="column-type-select"]').selectOption('formula');

    // Sintaxis inválida primero
    const exprInput = page.locator('[data-testid="column-expression-input"]');
    await exprInput.fill('10 + * 2');
    const syntaxError = page.locator('[data-testid="formula-syntax-error"]');
    await expect(syntaxError).toBeVisible();
    const saveBtn = page.locator('[data-testid="save-column-button"]');
    await expect(saveBtn).toBeDisabled();

    // Sintaxis válida
    await exprInput.fill('{largo} * 2');
    await expect(syntaxError).not.toBeVisible();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(addModal).not.toBeVisible();

    const areaHeader = page.locator('[data-testid="custom-column-header-area"]');
    await expect(areaHeader).toBeVisible();

    // 4. Editar celdas numéricas en las marcas recién creadas
    const rows = markupsPanel.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);

    const firstRow = rows.nth(rowCount - 2);
    const secondRow = rows.nth(rowCount - 1);

    const firstRowLargoInput = firstRow.locator('[data-testid*="custom-column-cell-"][data-testid*="-largo"] input');
    await firstRowLargoInput.fill('10');

    const secondRowLargoInput = secondRow.locator('[data-testid*="custom-column-cell-"][data-testid*="-largo"] input');
    await secondRowLargoInput.fill('25');

    // 5. Verificar que la columna de fórmula evaluó dinámicamente {largo} * 2 (10*2=20, 25*2=50)
    const firstRowAreaCell = firstRow.locator('[data-testid*="custom-column-cell-"][data-testid*="-area"]');
    const secondRowAreaCell = secondRow.locator('[data-testid*="custom-column-cell-"][data-testid*="-area"]');
    await expect(firstRowAreaCell).toContainText('20');
    await expect(secondRowAreaCell).toContainText('50');

    // 6. Ordenar por la columna personalizada calculada (clic en cabecera de Área)
    await areaHeader.click();
    // En orden ascendente: la marca con valor 20 aparece antes que la de 50
    const allAreaCells = markupsPanel.locator('[data-testid*="custom-column-cell-"][data-testid*="-area"]');
    const areaTextsAsc = await allAreaCells.allInnerTexts();
    const idx20Asc = areaTextsAsc.indexOf('20');
    const idx50Asc = areaTextsAsc.indexOf('50');
    expect(idx20Asc).toBeGreaterThanOrEqual(0);
    expect(idx50Asc).toBeGreaterThanOrEqual(0);
    expect(idx20Asc).toBeLessThan(idx50Asc);

    // Segundo clic: descendente (50 antes que 20)
    await areaHeader.click();
    const areaTextsDesc = await allAreaCells.allInnerTexts();
    const idx20Desc = areaTextsDesc.indexOf('20');
    const idx50Desc = areaTextsDesc.indexOf('50');
    expect(idx20Desc).toBeGreaterThanOrEqual(0);
    expect(idx50Desc).toBeGreaterThanOrEqual(0);
    expect(idx50Desc).toBeLessThan(idx20Desc);
  });

  test('Sub-entregable P2-C.5: Cierre Bloque C (Exportación CSV/PDF, Inspector de propiedades y atajo de guardado Ctrl+S)', async ({
    page,
  }) => {
    await page.goto('/');

    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });

    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel).toBeVisible();

    const inspectorPanel = page.locator('[data-testid="properties-inspector-panel"]');
    await expect(inspectorPanel).toHaveCount(1);

    // Expandir panel si inicia colapsado
    const expandBtn = page.locator('[data-testid="expand-properties-btn"]');
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }

    // 1. La marca inicial de calibración inicia seleccionada: verificar badge del inspector
    const badge = inspectorPanel.locator('[data-testid="selection-count-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/1 markup/);

    // 2. Deseleccionar la marca desmarcando su checkbox en MarkupsList -> muestra mensaje vacío
    const rows = markupsPanel.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const rowCheckbox = rows.first().locator('input[type="checkbox"]');
    await rowCheckbox.click();

    const emptyMsg = inspectorPanel.locator('[data-testid="properties-empty-message"]');
    await expect(emptyMsg).toBeVisible();

    // 3. Volver a seleccionar haciendo clic en el checkbox -> reaparece el inspector con sus propiedades
    await rowCheckbox.click();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/1 markup/);

    const strokeWidthInput = inspectorPanel.locator('[data-testid="prop-stroke-width"]');
    await expect(strokeWidthInput).toBeVisible();

    // 3. Modificar grosor de trazo en el inspector a 6
    await strokeWidthInput.fill('6');

    // Deshacer con Ctrl+Z
    await page.keyboard.press('Control+z');

    // 4. Ctrl+S en el documento de demostración guarda como (en el navegador, descarga el PDF con las marcas)
    const saveDownload = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    expect((await saveDownload).suggestedFilename()).toBe('test-blueprint.pdf');
    const saveBtn = page.locator('[data-testid="save-button"]');
    await expect(saveBtn).toBeEnabled();

    // 5. Exportar CSV y verificar captura del archivo de descarga
    const exportCsvBtn = page.locator('[data-testid="export-csv-button"]');
    await expect(exportCsvBtn).toBeVisible();

    const csvDownloadPromise = page.waitForEvent('download');
    await exportCsvBtn.click();
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/i);

    // 6. Exportar Reporte PDF y verificar captura del archivo de descarga
    const exportPdfBtn = page.locator('[data-testid="export-pdf-report-button"]');
    await expect(exportPdfBtn).toBeVisible();

    const pdfDownloadPromise = page.waitForEvent('download');
    await exportPdfBtn.click();
    const pdfDownload = await pdfDownloadPromise;
    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/i);
  });
  test('Regresión de diseño: la barra de herramientas no desborda la ventana a 1280 px (controles de zoom visibles)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('[data-testid="markup-overlay-svg"]')).toBeVisible({ timeout: 15000 });

    // El contenedor raíz de la app no debe tener contenido más ancho que la ventana
    const overflow = await page.evaluate(() => {
      const root = document.querySelector('header')?.parentElement as HTMLElement | null;
      return root ? { sw: root.scrollWidth, cw: root.clientWidth } : null;
    });
    expect(overflow).not.toBeNull();
    expect(overflow!.sw).toBeLessThanOrEqual(overflow!.cw);

    // Los controles de la derecha (zoom) quedan dentro de la ventana
    const zoomIn = page.locator('button[title="Zoom in (+)"]');
    await expect(zoomIn).toBeVisible();
    const box = (await zoomIn.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
  });

  test('Espacio de trabajo (ADR-0017): menú Medición → área por polígono, panel de mediciones, menú contextual, capas y tema', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-row-calibration-markup-1"]')).toBeVisible();
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });

    // 1. Menú Medición → Área (la herramienta queda activa en la cinta)
    await page.locator('[data-testid="menu-herramientas"]').click();
    await page.locator('[data-testid="menu-tools-measure"]').click();
    await page.getByRole('menuitem', { name: /^Area/ }).click();
    await expect(page.locator('[data-testid="tool-measure-area"]')).toHaveAttribute('aria-pressed', 'true');

    // 2. Polígono de 4 vértices sobre zona libre de la página y cierre con Enter
    for (const [nx, ny] of [
      [0.6, 0.2],
      [0.9, 0.2],
      [0.9, 0.6],
      [0.6, 0.6],
    ]) {
      const p = at(nx, ny);
      await page.mouse.click(p.x, p.y);
    }
    await page.keyboard.press('Enter');

    // 3. La medición aparece en la lista (tipo en español) y en el panel de mediciones con perímetro
    const markupsPanel = page.locator('[data-testid="markups-list-panel"]');
    await expect(markupsPanel.locator('tbody tr').filter({ hasText: 'Area' })).toHaveCount(1);
    await page.locator('[data-testid="expand-measurements-btn"]').click();
    const areaTotal = page.locator('[data-testid="measurements-total-area"]');
    await expect(areaTotal).toContainText('mm²');
    await expect(page.locator('[data-testid="measurements-totals"]')).toContainText('Perimeter');

    // 4. Clic derecho sobre el borde izquierdo del rectángulo de control → menú contextual → Aceptado
    await page.locator('[data-testid="tool-select"]').click();
    const edge = at(0.125, 0.6);
    await page.mouse.click(edge.x, edge.y, { button: 'right' });
    const ctxMenu = page.locator('[data-testid="canvas-context-menu"]');
    await expect(ctxMenu).toBeVisible();
    await expect(ctxMenu).toContainText('Rectangle');
    await page.locator('[data-testid="canvas-menu-status-accepted"]').click();
    await expect(ctxMenu).toHaveCount(0);
    await expect(
      page.locator('[data-testid="markup-row-calibration-markup-1"]').locator('select')
    ).toHaveValue('accepted');

    // 5. Panel Capas: ocultar la capa "Calibración" retira la marca del plano
    await page.locator('[data-testid="left-tab-layers"]').click();
    await expect(page.locator('[data-testid="layers-panel"]')).toContainText('Calibration');
    await page.locator('[data-testid="layer-toggle-Calibration"]').click();
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(0);
    await page.locator('[data-testid="layer-toggle-Calibration"]').click();
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);

    // 6. Barra de estado: coordenadas del cursor sobre la página y tema oscuro
    const center = at(0.5, 0.5);
    await page.mouse.move(center.x, center.y);
    await expect(page.locator('[data-testid="cursor-coordinates"]')).toContainText('mm');
    await page.locator('[data-testid="theme-toggle-btn"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Flechas y tipos de línea (ADR-0018): atajo A, punta abierta de Acrobat, línea discontinua con extremos elegidos en la cinta', async ({
    page,
  }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-row-calibration-markup-1"]')).toBeVisible();
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });
    const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 6 });
      await page.mouse.up();
    };
    const groups = overlaySvg.locator('g[data-testid^="markup-g-"]');
    const before = await groups.count();

    // 1. Atajo A → herramienta Flecha activa en la cinta; se dibuja una línea con punta abierta, como el Arrow de
    //    Acrobat (ADR-0032; antes cerrada)
    await page.locator('header').click(); // quitar foco de cualquier control
    await page.keyboard.press('a');
    await expect(page.locator('[data-testid="tool-arrow"]')).toHaveAttribute('aria-pressed', 'true');
    await drag(at(0.6, 0.25), at(0.8, 0.4));
    await expect(groups).toHaveCount(before + 1);
    const arrowGroup = groups.last();
    await expect(arrowGroup.locator('line')).toHaveCount(1);
    await expect(arrowGroup.locator('polyline')).toHaveCount(1);
    await expect(arrowGroup.locator('polygon')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Line' })
    ).toHaveCount(1);

    // 2. Cinta: discontinua + círculo al inicio + flecha abierta al final → se reflejan en la marca nueva
    // Selectores con dibujo (ADR-0020): se abre la lista y se elige la opción por su dibujo
    const pick = async (picker: string, value: string) => {
      await page.locator(`[data-testid="${picker}"]`).click();
      await page.locator(`[data-testid="${picker}-option-${value}"]`).click();
      await expect(page.locator(`[data-testid="${picker}"]`)).toHaveAttribute('data-value', value);
    };
    await pick('ribbon-line-style', 'dashed');
    await pick('ribbon-line-start', 'circle');
    await pick('ribbon-line-end', 'openArrow');
    await page.locator('[data-testid="tool-line"]').click();
    await drag(at(0.6, 0.6), at(0.85, 0.6));
    await expect(groups).toHaveCount(before + 2);
    const styled = groups.last();
    await expect(styled.locator('line')).toHaveAttribute('stroke-dasharray', /\d/);
    await expect(styled.locator('ellipse')).toHaveCount(1); // círculo al inicio
    await expect(styled.locator('polyline')).toHaveCount(1); // flecha abierta al final

    // 3. Deshacer quita la última marca de un solo paso
    await page.keyboard.press('Control+z');
    await expect(groups).toHaveCount(before + 1);
  });

  test('Vista continua, cota, puntos de control y zoom (ADR-0019/0020/0021): scroll entre páginas, ajustar, Shift+L, deformar nube, doble clic', async ({
    page,
  }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-row-calibration-markup-1"]')).toBeVisible();
    const container = page.locator('[data-testid="pdf-viewer-container"]');

    // 1. Vista continua: las 3 páginas apiladas; al bajar, la página activa y el indicador cambian
    await expect(page.locator('[data-page-slot]')).toHaveCount(3);
    await container.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(page.locator('[data-testid="page-indicator"]')).toHaveText('3 / 3');
    await expect(page.locator('[data-testid="pdf-page-container"]')).toHaveAttribute('data-page-slot', '2');

    // 2. Ajustar a página: la hoja entera cabe en el área visible; la navegación externa la lleva a la vista
    await page.locator('[data-testid="fit-page-btn"]').click();
    await expect
      .poll(async () => {
        const c = (await container.boundingBox())!;
        const p = (await page.locator('[data-testid="pdf-page-container"]').boundingBox())!;
        return p.y >= c.y && p.y + p.height <= c.y + c.height + 1;
      })
      .toBe(true);
    await page.locator('[data-testid="view-single-btn"]').click();
    await expect(page.locator('[data-page-slot]')).toHaveCount(1);
    await page.locator('[data-testid="view-continuous-btn"]').click();
    await page.locator('[data-testid="thumbnail-0"]').click({ position: { x: 20, y: 20 } });
    await expect(page.locator('[data-testid="page-indicator"]')).toHaveText('1 / 3');

    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });
    const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 6 });
      await page.mouse.up();
    };

    // 3. Cota (Shift+L): se traza, queda lista para escribir y se ve con su texto
    await page.locator('header').click();
    await page.keyboard.press('Shift+L');
    await expect(page.locator('[data-testid="tool-dimension"]')).toHaveAttribute('aria-pressed', 'true');
    await drag(at(0.6, 0.3), at(0.9, 0.3));
    await page.keyboard.press('Enter');
    const dimension = overlaySvg.locator('g[data-testid^="markup-dimension-"]');
    await expect(dimension).toHaveCount(1);
    await expect(dimension.locator('text')).toHaveText(/mm$/);
    await expect(page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Dimension' })).toHaveCount(1);

    // 4. Nube: se dibuja, se selecciona y un punto de control la deforma; Ctrl+Z la devuelve
    await page.keyboard.press('Escape');
    await page.keyboard.press('c');
    await drag(at(0.6, 0.5), at(0.8, 0.7));
    await page.keyboard.press('v');
    await page.mouse.click(at(0.6, 0.6).x, at(0.6, 0.6).y);
    await expect(page.locator('[data-testid^="control-point-"]')).toHaveCount(4);
    const handle = (await page.locator('[data-testid="control-point-2"]').boundingBox())!;
    await drag({ x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, at(0.92, 0.85));
    await expect(page.locator('[data-testid^="control-point-"]')).toHaveCount(4);
    const moved = (await page.locator('[data-testid="control-point-2"]').boundingBox())!;
    expect(moved.x).toBeGreaterThan(handle.x + 50);
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await page.locator('[data-testid="control-point-2"]').boundingBox())!.x)
      .toBeLessThan(handle.x + 2);

    // 5. Doble clic en el plano vacío: control de zoom; + acerca
    await page.mouse.dblclick(at(0.05, 0.95).x, at(0.05, 0.95).y);
    await expect(page.locator('[data-testid="zoom-widget"]')).toBeVisible();
    const zoomBtn = page.locator('[data-testid="status-bar"] button').filter({ hasText: '%' });
    const before = await zoomBtn.innerText();
    await page.locator('[data-testid="zoom-widget-in"]').click();
    await expect(zoomBtn).not.toHaveText(before);
  });

  test('Medición estilo Foxit, sellos y capas del PDF (ADR-0024/0025/0026): preset 1:100, etiqueta, snap, Tools ▸ Stamp', async ({
    page,
  }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-row-calibration-markup-1"]')).toBeVisible();

    // 1. Panel Measure: preset 1:100 mostrado en metros; la barra de estado indica la escala
    await page.locator('[data-testid="expand-measurements-btn"]').click();
    await page.locator('[data-testid="measure-mode-preset"]').check();
    await page.locator('[data-testid="measure-preset-select"]').selectOption('m-1-100');
    await page.locator('[data-testid="measure-length-unit"]').selectOption('m');
    await expect(page.locator('[data-testid="calibration-indicator"]')).toContainText('Scale: 1:100');
    await page.locator('[data-testid="measure-label"]').fill('Wall');

    // 2. Longitud de 300 pt de papel (0.375 del ancho de 800 pt) = 105.83 mm × 100 = 10.6 m, con su etiqueta
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });
    await page.locator('header').click();
    await page.keyboard.press('Shift+Alt+L');
    await expect(page.locator('[data-testid="tool-measure-length"]')).toHaveAttribute('aria-pressed', 'true');
    // A 0.79 de alto: bajo la retícula del plano (sin enganches de contenido) y visible sobre la lista de marcas
    const a = at(0.125, 0.79);
    const b = at(0.5, 0.79);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    const length = overlaySvg.locator('g[data-testid^="markup-length-"]');
    await expect(length).toHaveCount(1);
    await expect(length.locator('text')).toHaveText('Wall: 10.6 m');

    // 3. Snap: con Longitud activa, el cursor cerca del extremo muestra el indicador de extremo
    await page.mouse.move(b.x + 3, b.y + 2);
    await expect(overlaySvg.locator('[data-testid="snap-indicator-endpoint"]')).toHaveCount(1);

    // 4. Tools ▸ Stamp ▸ NOT FOR CONSTRUCTION y un clic en el plano coloca el sello
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="menu-herramientas"]').click();
    await page.locator('[data-testid="menu-tools-stamp"]').hover();
    await page.locator('[data-testid="menu-stamp-not-for-construction"]').click();
    await expect(page.locator('[data-testid="tool-stamp"]')).toHaveAttribute('aria-pressed', 'true');
    const c = at(0.75, 0.15);
    await page.mouse.click(c.x, c.y);
    const stamp = overlaySvg.locator('g[data-testid^="markup-stamp-"]');
    await expect(stamp).toHaveCount(1);
    await expect(stamp).toContainText('NOT FOR CONSTRUCTION');
    await expect(page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Stamp' })).toHaveCount(1);

    // 5. Panel Layers: sección de capas del PDF (el plano de prueba no tiene capas) y capas de marcas
    await page.locator('[data-testid="left-tab-layers"]').click();
    await expect(page.locator('[data-testid="pdf-layers-section"]')).toContainText('This PDF has no layers.');
    await expect(page.locator('[data-testid="layers-panel"]')).toContainText('Markup Layers');
  });

  test('Hyperlink, File Attachment y Form (ADR-0027): casilla desde Tools ▸ Form, enlace a página y adjunto', async ({
    page,
  }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });

    // 1. Tools ▸ Form ▸ Check Box: un clic crea la casilla; con Seleccionar, doble clic la marca
    await page.locator('[data-testid="menu-herramientas"]').click();
    await page.locator('[data-testid="menu-tools-form"]').hover();
    await page.locator('[data-testid="menu-field-checkbox"]').click();
    const c = at(0.8, 0.2);
    await page.mouse.click(c.x, c.y);
    const field = overlaySvg.locator('g[data-testid^="markup-field-"]');
    await expect(field).toHaveCount(1);
    await expect(field).toContainText('Check1');
    await page.locator('header').click();
    await page.keyboard.press('v');
    // Crear el campo abre Propiedades y la hoja se desplaza: se usa la posición actual de la casilla
    const fb = (await field.locator('rect').first().boundingBox())!;
    await page.mouse.dblclick(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await expect(field.locator('path')).toHaveCount(1); // la marca de verificación

    // 2. Hyperlink a la página 3: recuadro, diálogo y Ctrl+clic para seguirlo
    await page.locator('[data-testid="collapse-properties-btn"]').click();
    const box2 = (await overlaySvg.boundingBox())!;
    const at2 = (nx: number, ny: number) => ({ x: box2.x + box2.width * nx, y: box2.y + box2.height * ny });
    await page.locator('[data-testid="tool-link"]').click();
    const a = at2(0.72, 0.55);
    const b = at2(0.92, 0.6);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-testid="link-dialog"]')).toBeVisible();
    await page.locator('[data-testid="link-mode-page"]').check();
    await page.locator('[data-testid="link-page"]').fill('3');
    await page.locator('[data-testid="link-confirm"]').click();
    await expect(overlaySvg.locator('g[data-testid^="markup-link-"]')).toContainText('Page 3');
    await page.keyboard.press('v');
    await page.keyboard.down('Control');
    await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
    await page.keyboard.up('Control');
    await expect(page.locator('[data-testid="page-indicator"]')).toHaveText('3 / 3');

    // 3. File Attachment: un clic abre el selector de archivos y la marca lleva el nombre del archivo
    await page.locator('[data-testid="thumbnail-0"]').click({ position: { x: 20, y: 20 } });
    await expect(page.locator('[data-testid="page-indicator"]')).toHaveText('1 / 3');
    await page.locator('[data-testid="tool-fileAttachment"]').click();
    const chooser = page.waitForEvent('filechooser');
    const box3 = (await overlaySvg.boundingBox())!;
    const d = { x: box3.x + box3.width * 0.6, y: box3.y + box3.height * 0.12 };
    await page.mouse.click(d.x, d.y);
    await (await chooser).setFiles({ name: 'RFI-012.txt', mimeType: 'text/plain', buffer: Buffer.from('RFI 012') });
    const row = page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'File Attachment' });
    await expect(row).toHaveCount(1);
    // El comentario es un campo editable: el nombre del archivo está en su valor
    await expect(row.locator('input[type="text"]').first()).toHaveValue('RFI-012.txt');
    await expect(overlaySvg.locator('g[data-testid^="markup-attachment-"]')).toHaveCount(1);
  });
  test('Mediciones Angle, Radius y Volume con reglas (ADR-0029): atajos Shift+Alt, profundidad y Ctrl+R', async ({
    page,
  }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);

    // 1. Ctrl+R muestra las reglas (sin recargar la página) y numera en milímetros de papel
    await page.locator('header').click();
    await page.keyboard.press('Control+r');
    await expect(page.locator('[data-testid="ruler-top"]')).toBeVisible();
    await expect(page.locator('[data-testid="ruler-left"]')).toBeVisible();
    await expect(page.locator('[data-testid="ruler-corner"]')).toHaveText('mm');
    await expect(page.locator('[data-testid="ruler-top"] text').first()).toBeVisible();
    await expect(overlaySvg).toBeVisible();

    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });

    // 2. Ángulo recto con tres clics (Shift+Alt+G)
    await page.keyboard.press('Shift+Alt+G');
    await expect(page.locator('[data-testid="tool-measure-angle"]')).toHaveAttribute('aria-pressed', 'true');
    for (const [nx, ny] of [
      [0.9, 0.62],
      [0.7, 0.62],
      [0.7, 0.42],
    ]) {
      const p = at(nx, ny);
      await page.mouse.click(p.x, p.y);
    }
    const angle = overlaySvg.locator('g[data-testid^="markup-angle-"]');
    await expect(angle).toHaveCount(1);
    await expect(angle).toContainText('90.0°');

    // 3. Radio: del centro al borde, etiqueta con prefijo R
    await page.keyboard.press('Shift+Alt+R');
    const c = at(0.55, 0.66);
    const e = at(0.6, 0.66);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(e.x, e.y, { steps: 5 });
    await page.mouse.up();
    await expect(overlaySvg.locator('g[data-testid^="markup-radius-"]')).toContainText(/^R \d+\.\d mm$/);

    // 4. Volumen con profundidad 2 fijada en el panel Measure; se cierra con Enter
    await page.locator('[data-testid="expand-measurements-btn"]').click();
    await page.locator('[data-testid="measure-volume-depth"]').fill('2');
    const box2 = (await overlaySvg.boundingBox())!;
    const at2 = (nx: number, ny: number) => ({ x: box2.x + box2.width * nx, y: box2.y + box2.height * ny });
    await page.locator('header').click();
    await page.keyboard.press('Shift+Alt+V');
    await expect(page.locator('[data-testid="tool-measure-volume"]')).toHaveAttribute('aria-pressed', 'true');
    for (const [nx, ny] of [
      [0.45, 0.12],
      [0.6, 0.12],
      [0.6, 0.22],
    ]) {
      const p = at2(nx, ny);
      await page.mouse.click(p.x, p.y);
    }
    await page.keyboard.press('Enter');
    const volume = overlaySvg.locator('g[data-testid^="markup-volume-"]');
    await expect(volume).toHaveCount(1);
    await expect(volume).toContainText(/mm³$/);
    await expect(page.locator('[data-testid="measurements-total-volume"]')).toContainText('mm³');

    // 5. Ctrl+R otra vez oculta las reglas
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+r');
    await expect(page.locator('[data-testid="ruler-top"]')).toHaveCount(0);
  });
  test('Snap al dibujo, clic-clic y calibración por dos puntos (ADR-0031): cuadrícula del PDF, 140 pies y recálculo', async ({
    page,
  }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);
    const box = (await overlaySvg.boundingBox())!;
    // Intersecciones de la cuadrícula del plano en (350, 150) y (550, 150) pt; el cursor cae 3 px al lado
    const near = (xPt: number, yPt: number) => ({
      x: box.x + (box.width * xPt) / 800 + 3,
      y: box.y + (box.height * yPt) / 600 + 2,
    });
    const a = near(350, 150);
    const b = near(550, 150);

    // 1. Length con dos clics: el snap se engancha a las líneas del PDF
    await page.locator('header').click();
    await page.keyboard.press('Shift+Alt+L');
    // La geometría del plano se lee al elegir la herramienta: el indicador aparece al mover el cursor tras la carga
    const intersection = overlaySvg.locator('[data-testid="snap-indicator-intersection"]');
    await expect(async () => {
      await page.mouse.move(a.x + 1, a.y);
      await page.mouse.move(a.x, a.y);
      await expect(intersection).toHaveCount(1, { timeout: 500 });
    }).toPass({ timeout: 15000 });
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await expect(overlaySvg.locator('[data-testid="snap-indicator-intersection"]')).toHaveCount(1);
    await page.mouse.click(b.x, b.y);
    // Tercer clic del flujo de Acrobat (ADR-0035): sobre la misma línea, sin desplazarla
    await page.mouse.click(b.x, b.y);
    const length = overlaySvg.locator('g[data-testid^="markup-length-"]');
    await expect(length).toHaveCount(1);
    await expect(length.locator('text')).toHaveText('70.6 mm'); // 200 pt exactos

    // 2. Calibrate en la cinta: aviso, los mismos dos puntos y 140' en pies-pulgadas
    await page.locator('[data-testid="tool-calibrate"]').click();
    await expect(page.locator('[data-testid="calibrate-hint"]')).toBeVisible();
    await page.mouse.move(a.x, a.y);
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.click(b.x, b.y);
    await expect(page.locator('[data-testid="calibration-measured"]')).toContainText('200.00 pt');
    await page.locator('[data-testid="calibration-unit-select"]').selectOption('ftin');
    await page.locator('[data-testid="calibration-length-input"]').fill("140'");
    await page.locator('[data-testid="calibration-confirm-btn"]').click();
    await expect(page.locator('[data-testid="calibration-indicator"]')).toContainText(`1 in = 50'-4 13/16"`);
    // La medición anterior se recalcula con la escala nueva
    await expect(length.locator('text')).toHaveText(`140'-0"`);
    await expect(page.locator('[data-testid="calibrate-hint"]')).toHaveCount(0);
  });
  test('Estilo de Acrobat en las mediciones (ADR-0032/0033): flechas cerradas, valor dentro de la línea o encima', async ({
    page,
  }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });

    // Distancia con dos clics: línea interrumpida por el valor, una flecha cerrada en cada extremo (ADR-0033) y sin recuadro
    await page.locator('header').click();
    await page.keyboard.press('Shift+Alt+L');
    const a = at(0.55, 0.3);
    const b = at(0.9, 0.42);
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.click(b.x, b.y);
    await page.mouse.click(b.x, b.y); // tercer clic sin desplazar (ADR-0035)
    const length = overlaySvg.locator('g[data-testid^="markup-length-"]');
    await expect(length).toHaveCount(1);
    // Dos tramos y las dos guías de los extremos (ADR-0034)
    await expect(length.locator('line:not([data-testid="distance-leader"])')).toHaveCount(2);
    await expect(length.locator('[data-testid="distance-leader"]')).toHaveCount(2);
    await expect(length.locator('polygon')).toHaveCount(2);
    await expect(length.locator('rect')).toHaveCount(0);
    await expect(length.locator('text')).toHaveAttribute('fill', '#000000');
    await expect(length.locator('text')).toHaveAttribute('transform', /rotate\(/);

    // Panel Measure ▸ Caption "On top of the line" para la distancia seleccionada: la línea vuelve a ser continua
    await page.keyboard.press('v');
    // Un cuarto del recorrido: sobre el tramo visible, lejos del texto
    await page.mouse.click(a.x + (b.x - a.x) * 0.25, a.y + (b.y - a.y) * 0.25);
    await expect(page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Length' })).toHaveCount(1);
    await page.locator('[data-testid="expand-measurements-btn"]').click();
    await page.locator('[data-testid="measure-caption"]').selectOption('top');
    await expect(length.locator('line:not([data-testid="distance-leader"])')).toHaveCount(1);
  });
  test('Distancia de Acrobat con líneas de referencia (ADR-0033): tercer clic, flechas cerradas angostas', async ({ page }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);

    // Panel Measure ▸ Distance Properties ▸ Leader lines
    await page.locator('[data-testid="expand-measurements-btn"]').click();
    await page.locator('[data-testid="measure-leaders"]').check();
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });

    await page.locator('header').click();
    await page.keyboard.press('Shift+Alt+L');
    const a = at(0.55, 0.35);
    const b = at(0.85, 0.35);
    const c = at(0.7, 0.25);
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await page.mouse.click(b.x, b.y);
    await page.mouse.move(c.x, c.y, { steps: 3 });
    await page.mouse.click(c.x, c.y);

    const length = overlaySvg.locator('g[data-testid^="markup-length-"]').filter({ hasNot: page.locator('[data-testid="markup-length-preview-length"]') });
    await expect(length).toHaveCount(1);
    await expect(length.locator('[data-testid="distance-leader"]')).toHaveCount(2);
    await expect(length.locator('polygon')).toHaveCount(2); // flechas cerradas
    await expect(page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Length' })).toHaveCount(1);
  });
  test('Overlay Pages (ADR-0038): comparar con otra página, colores rojo/azul, alinear y cerrar', async ({ page }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);

    // Document ▸ Overlay Pages ▸ Overlay with a Page of This Document (página 1 contra la 2)
    await page.locator('[data-testid="menu-documento"]').click();
    await page.locator('[data-testid="menu-overlay"]').hover();
    await page.locator('[data-testid="menu-overlay-self"]').click();
    await expect(page.locator('[data-testid="overlay-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="overlay-page-select"]')).toHaveValue('1');

    // La mezcla tiene tinta solo de la actual (rojo) y solo de la comparada (azul)
    const colors = async () =>
      page.evaluate(() => {
        const c = document.querySelector('[data-testid="overlay-canvas"]') as HTMLCanvasElement | null;
        if (!c || c.width <= 300) return { red: 0, blue: 0 };
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let red = 0;
        let blue = 0;
        for (let i = 0; i < d.length; i += 16) {
          if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) red++;
          else if (d[i + 2] > 150 && d[i] < 110) blue++;
        }
        return { red, blue };
      });
    await expect.poll(async () => (await colors()).red, { timeout: 10000 }).toBeGreaterThan(50);
    expect((await colors()).blue).toBeGreaterThan(50);

    // Alinear 10 pt con Mayús y cerrar
    await page.locator('[data-testid="overlay-nudge-right"]').click({ modifiers: ['Shift'] });
    await expect(page.locator('[data-testid="overlay-offset"]')).toHaveText('10, 0 pt');
    await page.locator('[data-testid="overlay-close"]').click();
    await expect(page.locator('[data-testid="overlay-bar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="overlay-canvas"]')).toHaveCount(0);
  });
  test('Nube de forma libre, tiradores de Revu y fuente en la barra de propiedades (ADR-0039/0040)', async ({ page }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });

    // Nube de forma libre: clic en cada vértice y Enter
    await page.locator('header').click();
    await page.keyboard.press('c');
    for (const [nx, ny] of [
      [0.6, 0.15],
      [0.85, 0.18],
      [0.9, 0.4],
      [0.62, 0.36],
    ]) {
      const p = at(nx, ny);
      await page.mouse.click(p.x, p.y);
    }
    await page.keyboard.press('Enter');
    const row = page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Cloud' });
    await expect(row).toHaveCount(1);

    // Seleccionarla: tiradores de vértice, de esquina y de rotación
    await page.keyboard.press('v');
    await row.click();
    await expect(overlaySvg.locator('[data-testid^="control-point-"]')).toHaveCount(4);
    await expect(overlaySvg.locator('[data-testid^="scale-handle-"]')).toHaveCount(4);
    const rot = (await overlaySvg.locator('[data-testid="rotate-handle"]').boundingBox())!;
    const before = await overlaySvg.locator('[data-testid="control-point-0"]').boundingBox();
    await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2);
    await page.mouse.down();
    await page.mouse.move(rot.x + 80, rot.y + 40, { steps: 6 });
    await page.mouse.up();
    const after = await overlaySvg.locator('[data-testid="control-point-0"]').boundingBox();
    expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)).toBeGreaterThan(5); // giró

    // Barra de propiedades: con la nube seleccionada, edita la selección
    await expect(page.locator('[data-testid="ribbon-group-style"]')).toContainText('1 selected');
    await expect(page.locator('[data-testid="ribbon-font-bold"]')).toBeEnabled();
  });

  test('Nube de Revu, tipos de línea con patrón y tamaño de nube en la barra (ADR-0041)', async ({ page }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });

    // Herramienta Nube: Size 3 e Invert desde la barra, como en Revu
    await page.locator('header').click();
    await page.keyboard.press('c');
    await expect(page.locator('[data-testid="ribbon-line-style"]')).toHaveAttribute('data-value', 'cloud');
    await page.locator('[data-testid="ribbon-cloud-style"]').click();
    await page.locator('[data-testid="ribbon-cloud-size"]').fill('3');
    await page.locator('[data-testid="ribbon-cloud-size"]').press('Enter');
    await page.locator('header').click(); // cierra el desplegable sin cambiar de herramienta
    const a = at(0.6, 0.15);
    const b = at(0.85, 0.35);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    const row = page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Cloud' });
    await expect(row).toHaveCount(1);

    // Seleccionada: la caja azul rodea los lóbulos, separada de los vértices amarillos
    await page.keyboard.press('v');
    await row.click();
    const corner = (await overlaySvg.locator('[data-testid="scale-handle-0"]').boundingBox())!;
    const vertex = (await overlaySvg.locator('[data-testid="control-point-0"]').boundingBox())!;
    expect(vertex.x - corner.x).toBeGreaterThan(20);
    expect(vertex.y - corner.y).toBeGreaterThan(20);

    // Tipo de línea Tracks a la nube seleccionada: deja de ser nube y se dibuja con carriles y traviesas
    await page.locator('[data-testid="ribbon-line-style"]').click();
    await expect(page.locator('[data-testid="ribbon-line-style-list"]')).toContainText('Fenceline Square');
    await page.locator('[data-testid="ribbon-line-style-option-tracks"]').click();
    await expect(page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Rectangle' })).toHaveCount(2);
    await expect(page.locator('[data-testid="ribbon-line-style"]')).toHaveAttribute('data-value', 'tracks');
  });

  test('Callout de Revu: se suelta donde va el codo y mover la caja deja la punta fija (ADR-0042)', async ({ page }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"]')).toHaveCount(1);
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });

    // Clic en la punta, arrastrar y soltar donde va el codo; vista previa con el dibujo final
    await page.locator('button[title*="Callout (Q)"]').click();
    const tip = at(0.62, 0.4);
    const knee = at(0.72, 0.2);
    await page.mouse.move(tip.x, tip.y);
    await page.mouse.down();
    await page.mouse.move(knee.x, knee.y, { steps: 5 });
    await expect(overlaySvg.locator('[data-testid="callout-preview"]')).toHaveCount(1);
    await page.mouse.up();
    const editor = page.locator('[data-testid="inline-text-editor-input"]');
    await editor.fill('Hola');
    await page.keyboard.press('Enter');
    await expect(editor).toHaveCount(0);

    // Seleccionado: punta y codo (círculos), esquinas (círculos) y lados (cuadros) de la caja
    await page.locator('button[title*="Select (V)"]').click();
    const row = page.locator('[data-testid="markups-list-panel"] tbody tr').filter({ hasText: 'Callout' });
    await row.click();
    const tipHandle = overlaySvg.locator('[data-testid="callout-anchor-handle-0"]');
    const kneeHandle = overlaySvg.locator('[data-testid="callout-knee-handle-0"]');
    await expect(kneeHandle).toHaveCount(1);
    await expect(overlaySvg.locator('rect[data-testid^="control-point-"]')).toHaveCount(4);
    const kneeBox = (await kneeHandle.boundingBox())!;
    expect(Math.abs(kneeBox.x + kneeBox.width / 2 - knee.x)).toBeLessThan(3); // el codo queda donde se soltó
    const tip0 = (await tipHandle.boundingBox())!;

    // Arrastrar el texto: la caja y el codo se mueven, la punta no
    const text = overlaySvg.locator('text', { hasText: 'Hola' });
    const t0 = (await text.boundingBox())!;
    await page.mouse.move(t0.x + t0.width / 2, t0.y + t0.height / 2);
    await page.mouse.down();
    await page.mouse.move(t0.x + t0.width / 2 + 60, t0.y + t0.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    const t1 = (await text.boundingBox())!;
    expect(t1.x - t0.x).toBeGreaterThan(40);
    const tip1 = (await tipHandle.boundingBox())!;
    expect(Math.abs(tip1.x - tip0.x) + Math.abs(tip1.y - tip0.y)).toBeLessThan(1);
  });

  test('Al seleccionar una marca se abre su panel de propiedades, y se puede apagar en View (ADR-0043)', async ({ page }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    const props = page.locator('[data-testid="properties-inspector-panel"]');
    await expect(props).toHaveAttribute('data-collapsed', 'true');
    // Clic en una zona vacía del plano con la herramienta de selección: nada seleccionado
    const deselect = async () => {
      await page.locator('header').click();
      await page.keyboard.press('v');
      const box = (await overlaySvg.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.06);
      await expect(page.locator('[data-testid="markup-g-calibration-markup-1"] [data-testid="selection-bbox"]')).toHaveCount(0);
    };

    // Activar View ▸ Open Panel on Selection
    await page.locator('[data-testid="menu-ver"]').click();
    await page.locator('[data-testid="menu-view-auto-panels"]').click();

    // Seleccionar el rectángulo de control: se abre Properties sin pedirlo
    await deselect();
    // Clic en la columna Type de la fila (el centro cae en el desplegable de estado)
    await page.locator('[data-testid="markup-row-calibration-markup-1"]').click({ position: { x: 70, y: 12 } });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"] [data-testid="selection-bbox"]')).toHaveCount(1);
    await expect(props).not.toHaveAttribute('data-collapsed', 'true');

    // Apagado: plegar el panel y volver a seleccionar no lo abre
    await page.locator('[data-testid="menu-ver"]').click();
    await page.locator('[data-testid="menu-view-auto-panels"]').click();
    await page.locator('[data-testid="collapse-properties-btn"]').click();
    await expect(props).toHaveAttribute('data-collapsed', 'true');
    await deselect();
    await page.locator('[data-testid="markup-row-calibration-markup-1"]').click({ position: { x: 70, y: 12 } });
    await expect(page.locator('[data-testid="markup-g-calibration-markup-1"] [data-testid="selection-bbox"]')).toHaveCount(1);
    await expect(props).toHaveAttribute('data-collapsed', 'true');
  });

  test('Sellos de Revu y Foxit desde el selector de la pestaña Insert (ADR-0045)', async ({ page }) => {
    await page.goto('/');
    const overlaySvg = page.locator('[data-testid="markup-overlay-svg"]');
    await expect(overlaySvg).toBeVisible({ timeout: 15000 });
    const box = (await overlaySvg.boundingBox())!;
    const at = (nx: number, ny: number) => ({ x: box.x + box.width * nx, y: box.y + box.height * ny });
    const stamps = overlaySvg.locator('g[data-testid^="markup-stamp-"]');

    // Foxit estándar: caja azul con icono y texto blanco
    await page.locator('[data-testid="ribbon-tab-insert"]').click();
    await page.locator('[data-testid="ribbon-stamp-picker"]').click();
    await expect(page.locator('[data-testid="ribbon-stamp-picker-group-sign-here"]')).toContainText('Sign Here');
    await page.locator('[data-testid="ribbon-stamp-picker-option-std-approved"]').click();
    await expect(page.locator('[data-testid="tool-stamp"]')).toHaveAttribute('aria-pressed', 'true');
    const a = at(0.75, 0.12);
    await page.mouse.click(a.x, a.y);
    await expect(stamps).toHaveCount(1);
    await expect(stamps.first()).toContainText('APPROVED');
    await expect(stamps.first().locator('path').first()).toHaveAttribute('fill', '#2a69ad');

    // Revu For Review: texto verde y línea de fecha
    await page.locator('[data-testid="ribbon-stamp-picker"]').click();
    await page.locator('[data-testid="ribbon-stamp-picker-option-rv-for-review"]').click();
    const b = at(0.75, 0.2);
    await page.mouse.click(b.x, b.y);
    await expect(stamps).toHaveCount(2);
    await expect(stamps.nth(1)).toContainText('For Review');
    await expect(stamps.nth(1)).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} (am|pm)/);
  });
});
