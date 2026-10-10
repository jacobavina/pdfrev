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

    // 3. Esperar a que el canvas de PDF.js aparezca y tenga dimensiones renderizadas
    const canvas = page.locator('[data-testid="pdf-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="pdf-canvas"]') as HTMLCanvasElement;
        return el && el.width > 400 && el.height > 300;
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
  });
});
