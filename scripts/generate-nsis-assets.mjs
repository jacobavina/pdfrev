import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

const ROOT = 'C:/dev/rea';
const TMP_DIR = path.join(ROOT, 'dist-nsis-tmp');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const SIDEBAR_WIDTH = 492;
const SIDEBAR_HEIGHT = 942;
const HEADER_WIDTH = 450;
const HEADER_HEIGHT = 171;

const sidebarHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${SIDEBAR_WIDTH}px;
    height: ${SIDEBAR_HEIGHT}px;
    background: linear-gradient(175deg, #070B14 0%, #0F172A 55%, #131E36 100%);
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    color: #F8FAFC;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 24px;
  }

  /* Radial glow behind icon */
  .glow {
    position: absolute;
    width: 320px;
    height: 320px;
    top: 140px;
    left: 86px;
    background: radial-gradient(circle, rgba(14, 165, 233, 0.28) 0%, rgba(2, 132, 199, 0.08) 50%, transparent 70%);
    pointer-events: none;
    z-index: 1;
  }

  /* Subtle technical CAD frame */
  .cad-border {
    position: absolute;
    top: 20px;
    left: 20px;
    right: 20px;
    bottom: 20px;
    border: 1px solid rgba(56, 189, 248, 0.15);
    pointer-events: none;
    z-index: 2;
  }
  .corner-tl { position: absolute; top: 14px; left: 14px; width: 14px; height: 14px; border-top: 2px solid #38BDF8; border-left: 2px solid #38BDF8; }
  .corner-tr { position: absolute; top: 14px; right: 14px; width: 14px; height: 14px; border-top: 2px solid #38BDF8; border-right: 2px solid #38BDF8; }
  .corner-bl { position: absolute; bottom: 14px; left: 14px; width: 14px; height: 14px; border-bottom: 2px solid #38BDF8; border-left: 2px solid #38BDF8; }
  .corner-br { position: absolute; bottom: 14px; right: 14px; width: 14px; height: 14px; border-bottom: 2px solid #38BDF8; border-right: 2px solid #38BDF8; }

  .content {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .icon-wrapper {
    width: 170px;
    height: 170px;
    margin-bottom: 32px;
    filter: drop-shadow(0 16px 30px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 24px rgba(56, 189, 248, 0.35));
  }

  .brand-title {
    font-size: 58px;
    font-weight: 800;
    letter-spacing: -0.5px;
    line-height: 1.1;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
  }
  .brand-pdf { color: #FFFFFF; }
  .brand-rev { color: #38BDF8; }

  .brand-divider {
    width: 64px;
    height: 3px;
    background: #0284C7;
    border-radius: 2px;
    margin-bottom: 18px;
  }

  .brand-sub {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #94A3B8;
    text-transform: uppercase;
    margin-bottom: 40px;
  }

  .badges {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 260px;
  }

  .badge-item {
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid rgba(56, 189, 248, 0.22);
    border-radius: 20px;
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: #E2E8F0;
    text-transform: uppercase;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="cad-border"></div>
  <div class="corner-tl"></div>
  <div class="corner-tr"></div>
  <div class="corner-bl"></div>
  <div class="corner-br"></div>

  <div class="content">
    <div class="icon-wrapper">
      <svg viewBox="0 0 512 512" width="170" height="170" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" rx="112" fill="#0B132B"/>
        <rect x="24" y="24" width="464" height="464" rx="96" stroke="#38BDF8" stroke-opacity="0.3" stroke-width="4"/>
        <!-- Sheet body -->
        <path d="M128 96 H312 L392 176 V416 H128 Z" fill="#0F172A" stroke="#38BDF8" stroke-width="14" stroke-linejoin="round"/>
        <!-- Folded corner -->
        <path d="M312 96 V176 H392 Z" fill="#38BDF8" stroke="#38BDF8" stroke-width="8" stroke-linejoin="round"/>
        <!-- P glyph -->
        <text x="210" y="325" font-family="'Segoe UI', system-ui, sans-serif" font-weight="900" font-size="190" fill="#7DD3FC" text-anchor="middle">P</text>
        <!-- Takeoff dimension line -->
        <line x1="280" y1="365" x2="365" y2="365" stroke="#38BDF8" stroke-width="10" stroke-linecap="round"/>
        <line x1="280" y1="350" x2="280" y2="380" stroke="#38BDF8" stroke-width="10" stroke-linecap="round"/>
        <line x1="365" y1="350" x2="365" y2="380" stroke="#38BDF8" stroke-width="10" stroke-linecap="round"/>
      </svg>
    </div>

    <div class="brand-title">
      <span class="brand-pdf">Pdf</span><span class="brand-rev">Rev</span>
    </div>
    <div class="brand-divider"></div>
    <div class="brand-sub">CAD Takeoff &amp; Review</div>

    <div class="badges">
      <div class="badge-item">Local-First</div>
      <div class="badge-item">Zero Telemetry</div>
      <div class="badge-item">Headless AI CLI</div>
    </div>
  </div>
</body>
</html>`;

const headerHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${HEADER_WIDTH}px;
    height: ${HEADER_HEIGHT}px;
    background: #FFFFFF;
    overflow: hidden;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 28px;
  }
  .icon-wrapper {
    width: 120px;
    height: 120px;
    filter: drop-shadow(0 6px 14px rgba(15, 23, 42, 0.18));
  }
</style>
</head>
<body>
  <div class="icon-wrapper">
    <svg viewBox="0 0 512 512" width="120" height="120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="112" fill="#0B132B"/>
      <rect x="24" y="24" width="464" height="464" rx="96" stroke="#38BDF8" stroke-opacity="0.35" stroke-width="4"/>
      <!-- Sheet body -->
      <path d="M128 96 H312 L392 176 V416 H128 Z" fill="#0F172A" stroke="#38BDF8" stroke-width="14" stroke-linejoin="round"/>
      <!-- Folded corner -->
      <path d="M312 96 V176 H392 Z" fill="#38BDF8" stroke="#38BDF8" stroke-width="8" stroke-linejoin="round"/>
      <!-- P glyph -->
      <text x="210" y="325" font-family="'Segoe UI', system-ui, sans-serif" font-weight="900" font-size="190" fill="#7DD3FC" text-anchor="middle">P</text>
      <!-- Takeoff dimension line -->
      <line x1="280" y1="365" x2="365" y2="365" stroke="#38BDF8" stroke-width="10" stroke-linecap="round"/>
      <line x1="280" y1="350" x2="280" y2="380" stroke="#38BDF8" stroke-width="10" stroke-linecap="round"/>
      <line x1="365" y1="350" x2="365" y2="380" stroke="#38BDF8" stroke-width="10" stroke-linecap="round"/>
    </svg>
  </div>
</body>
</html>`;

async function main() {
  console.log('[NSIS] Launching Playwright Chromium...');
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();

  // 1. Render Sidebar
  console.log('[NSIS] Rendering 3x Sidebar (492x942)...');
  await page.setViewportSize({ width: SIDEBAR_WIDTH, height: SIDEBAR_HEIGHT });
  await page.setContent(sidebarHtml, { waitUntil: 'networkidle' });
  const sidebarPng = path.join(TMP_DIR, 'sidebar.png');
  await page.screenshot({ path: sidebarPng, type: 'png' });

  // 2. Render Header
  console.log('[NSIS] Rendering 3x Header (450x171)...');
  await page.setViewportSize({ width: HEADER_WIDTH, height: HEADER_HEIGHT });
  await page.setContent(headerHtml, { waitUntil: 'networkidle' });
  const headerPng = path.join(TMP_DIR, 'header.png');
  await page.screenshot({ path: headerPng, type: 'png' });

  await browser.close();

  // 3. Convert PNGs to 24-bit uncompressed BMPs using PowerShell System.Drawing
  console.log('[NSIS] Converting PNGs to 24-bit BMPs...');
  const destSidebarBmp = path.join(ROOT, 'src-tauri/nsis-sidebar.bmp');
  const destHeaderBmp = path.join(ROOT, 'src-tauri/nsis-header.bmp');

  const psScript = `
    Add-Type -AssemblyName System.Drawing
    $b1 = [System.Drawing.Image]::FromFile('${sidebarPng.replace(/\\/g, '/')}')
    $b1.Save('${destSidebarBmp.replace(/\\/g, '/')}', [System.Drawing.Imaging.ImageFormat]::Bmp)
    $b1.Dispose()

    $b2 = [System.Drawing.Image]::FromFile('${headerPng.replace(/\\/g, '/')}')
    $b2.Save('${destHeaderBmp.replace(/\\/g, '/')}', [System.Drawing.Imaging.ImageFormat]::Bmp)
    $b2.Dispose()
  `;

  execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, '; ')}"`, { stdio: 'inherit' });

  // 4. Update ATTRIBUTION.md hashes
  const sidebarBytes = fs.readFileSync(destSidebarBmp);
  const headerBytes = fs.readFileSync(destHeaderBmp);
  const sidebarHash = crypto.createHash('sha256').update(sidebarBytes).digest('hex');
  const headerHash = crypto.createHash('sha256').update(headerBytes).digest('hex');

  console.log(`[NSIS] New Sidebar Hash: ${sidebarHash}`);
  console.log(`[NSIS] New Header Hash:  ${headerHash}`);

  // Cleanup tmp dir
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('[NSIS] Successfully generated high-definition NSIS assets!');
}

main().catch((err) => {
  console.error('[NSIS] Error:', err);
  process.exit(1);
});
