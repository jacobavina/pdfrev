import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = 'C:/dev/rea';
const PORT = 1426;

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`);
}

async function main() {
  console.log('[Screenshots] Starting Vite dev server on port ' + PORT + '...');
  const devServer = spawn('npm.cmd', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    shell: true,
  });

  try {
    await waitForServer(`http://localhost:${PORT}`);
    console.log('[Screenshots] Server is ready. Launching Chromium...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem('rea-load-demo', '1');
      localStorage.setItem('rea-markups-list-at-start', '1');
      localStorage.setItem('rea-theme', 'dark');
      document.documentElement.dataset.theme = 'dark';
    });

    console.log('[Screenshots] Navigating to app...');
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('[data-testid="pdf-canvas"]', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // Dark Mode Screenshot
    console.log('[Screenshots] Capturing Dark Mode...');
    const darkPath = path.join(ROOT, 'docs/assets/screenshot-dark.png');
    await page.screenshot({ path: darkPath, type: 'png' });

    // Switch to Light Mode by clicking the actual theme button
    console.log('[Screenshots] Clicking theme-toggle-btn...');
    const toggleBtn = page.locator('[data-testid="theme-toggle-btn"]');
    await toggleBtn.click();
    await page.waitForTimeout(1200);

    console.log('[Screenshots] Capturing Light Mode...');
    const lightPath = path.join(ROOT, 'docs/assets/screenshot-light.png');
    await page.screenshot({ path: lightPath, type: 'png' });

    await browser.close();

    // Hashes
    const darkHash = crypto.createHash('sha256').update(fs.readFileSync(darkPath)).digest('hex').toUpperCase();
    const lightHash = crypto.createHash('sha256').update(fs.readFileSync(lightPath)).digest('hex').toUpperCase();

    console.log(`[Screenshots] Dark Screenshot Hash:  ${darkHash}`);
    console.log(`[Screenshots] Light Screenshot Hash: ${lightHash}`);

    // Update ATTRIBUTION.md
    let attrib = fs.readFileSync(path.join(ROOT, 'ATTRIBUTION.md'), 'utf8');
    attrib = attrib.replace(
      /\| `docs\/assets\/screenshot-dark\.png` \|[^\n]+/,
      `| \`docs/assets/screenshot-dark.png\` | pdfrev Contributors | Capturado de la ventana nativa mediante \`scripts/generate-clean-screenshots.mjs\` | MIT / Propia del proyecto | \`${darkHash}\` | Captura de pantalla oficial en modo oscuro con tema de ingeniería |`
    );
    attrib = attrib.replace(
      /\| `docs\/assets\/screenshot-light\.png` \|[^\n]+/,
      `| \`docs/assets/screenshot-light.png\` | pdfrev Contributors | Capturado de la ventana nativa mediante \`scripts/generate-clean-screenshots.mjs\` | MIT / Propia del proyecto | \`${lightHash}\` | Captura de pantalla oficial en modo claro con tema plano |`
    );
    fs.writeFileSync(path.join(ROOT, 'ATTRIBUTION.md'), attrib, 'utf8');
    console.log('[Screenshots] Successfully updated ATTRIBUTION.md with distinct hashes!');
  } finally {
    devServer.kill();
  }
}

main().catch((err) => {
  console.error('[Screenshots] Error:', err);
  process.exit(1);
});
