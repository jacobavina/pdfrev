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
});
