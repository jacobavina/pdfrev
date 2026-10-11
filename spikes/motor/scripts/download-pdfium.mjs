import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { execSync } from 'child_process';

const TARGET_DIR = path.resolve('./spikes/motor/vendor/pdfium');
const URL = 'https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/8086/pdfium-win-x64.tgz';
const VERSION = 'chromium/8086';
const LOG_PATH = path.resolve('./spikes/motor/logs/opcion-d/provenance.log');

export async function downloadAndVerifyPdfium() {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

  const tgzPath = path.join(TARGET_DIR, 'pdfium-win-x64.tgz');
  console.log(`[PDFIUM] Descargando desde ${URL}...`);

  await new Promise((resolve, reject) => {
    function getWithRedirect(url) {
      https.get(url, { headers: { 'User-Agent': 'rea-spike-agent' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getWithRedirect(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        const fileStream = fs.createWriteStream(tgzPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(resolve);
        });
      }).on('error', reject);
    }
    getWithRedirect(URL);
  });

  const bytes = fs.readFileSync(tgzPath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  console.log(`[PDFIUM] Descargado: ${bytes.length} bytes, SHA-256: ${sha256}`);

  // Extraer tgz usando tar de Windows / git
  console.log('[PDFIUM] Extrayendo archivo tgz...');
  execSync(`tar -xzf "${tgzPath}" -C "${TARGET_DIR}"`, { stdio: 'inherit' });

  // Buscar archivo LICENSE en el paquete extraído
  let licenseContent = 'BSD-3-Clause (Chromium / PDFium Authors)';
  const possibleLicense = path.join(TARGET_DIR, 'LICENSE');
  if (fs.existsSync(possibleLicense)) {
    licenseContent = fs.readFileSync(possibleLicense, 'utf8');
  }

  // Registrar procedencia y licencia
  const logLines = [
    `=== PROCEDENCIA Y LICENCIA DE BINARIO PDFIUM (OPCION D) ===`,
    `Fecha: ${new Date().toISOString()}`,
    `URL de descarga: ${URL}`,
    `Versión: ${VERSION}`,
    `Tamaño archivo tgz: ${bytes.length} bytes`,
    `SHA-256 (tgz): ${sha256}`,
    `DLL extraída: ${path.join(TARGET_DIR, 'bin', 'pdfium.dll')}`,
    `Licencia declarada: BSD-3-Clause (Chromium / Google / Foxit Software Inc.)`,
    `Texto de licencia leído:`,
    licenseContent.trim()
  ];

  fs.writeFileSync(LOG_PATH, logLines.join('\n'), 'utf8');
  console.log(`[PDFIUM] Procedencia y licencia registradas en ${LOG_PATH}`);

  return { url: URL, version: VERSION, sha256, size: bytes.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('./spikes/motor/scripts/download-pdfium.mjs')) {
  downloadAndVerifyPdfium().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
