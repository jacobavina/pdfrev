import { chromium } from '@playwright/test';

/**
 * Calienta el servidor de desarrollo (ADR-0092): la primera carga de Vite optimiza dependencias y compila la app, y
 * la primera prueba de cada pasada (con 5 s de espera por aserción) fallaba de forma intermitente por eso. Se carga
 * la aplicación una vez, hasta que el visor pinta, antes de empezar.
 */
export default async function globalSetup() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:1421/');
    await page.locator('[data-testid="markup-overlay-svg"]').waitFor({ timeout: 90000 });
    await page.waitForTimeout(1500);
  } finally {
    await browser.close();
  }
}
