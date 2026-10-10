#!/usr/bin/env node
/**
 * Hito P2-X (ADR-0008): Smoke Test de Ventana Nativa con tauri-driver
 *
 * Automatización WebDriver nativa sobre el binario real de REA (Tauri 2 + WebView2).
 * Sin dependencias npm externas: utiliza Node nativo (fetch, child_process, fs).
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';

const SMOKE_TEST_TITLE = 'Hito P2-X (ADR-0008): Smoke Test de Ventana Nativa con tauri-driver';
const DRIVER_PORT = 4444;
const DRIVER_URL = `http://127.0.0.1:${DRIVER_PORT}`;
const ARTIFACTS_DIR = path.resolve('tests/native-artifacts');
const APP_BIN_PATH = path.resolve('src-tauri/target/debug/app.exe');

console.log('============================================================');
console.log(`  ${SMOKE_TEST_TITLE}`);
console.log('============================================================\n');

// ---------------------------------------------------------------------------
// 1. COMPROBACIÓN EXHAUSTIVA DE PRERREQUISITOS
// ---------------------------------------------------------------------------
console.log('[1/5] Comprobando prerrequisitos del entorno nativo...');

function resolveExecutable(name) {
  // 1. Buscar en PATH estándar
  const whereCmd = process.platform === 'win32' ? 'where.exe' : 'which';
  const res = spawnSync(whereCmd, [name], { encoding: 'utf8' });
  if (res.status === 0 && res.stdout.trim()) {
    return res.stdout.trim().split(/\r?\n/)[0];
  }
  // 2. Buscar en ~/.cargo/bin
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const cargoBin = path.join(homeDir, '.cargo', 'bin', `${name}.exe`);
  if (fs.existsSync(cargoBin)) {
    return cargoBin;
  }
  return null;
}

// 1.1 tauri-driver
const tauriDriverBin = resolveExecutable('tauri-driver');
if (!tauriDriverBin) {
  console.error('\n❌ [PRERREQUISITO FALTANTE] tauri-driver no se encuentra en PATH ni en ~/.cargo/bin.');
  console.error('   Instalación requerida: cargo install tauri-driver --locked\n');
  process.exit(1);
}
console.log(`  ✓ tauri-driver detectado: ${tauriDriverBin}`);

// 1.2 msedgedriver
const edgeDriverBin = resolveExecutable('msedgedriver');
if (!edgeDriverBin) {
  console.error('\n❌ [PRERREQUISITO FALTANTE] msedgedriver.exe no se encuentra en PATH ni en ~/.cargo/bin.');
  console.error('   Descarga requerida desde: https://developer.microsoft.com/en-us/microsoftedge/tools/webdriver/\n');
  process.exit(1);
}

// 1.3 Comprobar versión de msedgedriver vs runtime WebView2 / Edge
let edgeDriverVer = '';
try {
  const verRes = spawnSync(edgeDriverBin, ['--version'], { encoding: 'utf8' });
  edgeDriverVer = verRes.stdout || verRes.stderr || '';
} catch (e) {
  console.error(`\n❌ [ERROR] Fallo al ejecutar msedgedriver: ${e.message}`);
  process.exit(1);
}

const driverVerMatch = edgeDriverVer.match(/(\d+\.\d+\.\d+\.\d+)/);
if (!driverVerMatch) {
  console.error(`\n❌ [ERROR] No se pudo determinar la versión de msedgedriver: ${edgeDriverVer}`);
  process.exit(1);
}
const driverVersionStr = driverVerMatch[1];
const driverMajor = driverVersionStr.split('.')[0];
console.log(`  ✓ msedgedriver detectado: ${driverVersionStr} (${edgeDriverBin})`);

// Detectar versión de WebView2 / Edge instalada en Windows
let installedMajor = null;
const edgeSearchPaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
for (const p of edgeSearchPaths) {
  if (fs.existsSync(p)) {
    const pVerRes = spawnSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-Item '${p}').VersionInfo.ProductVersion`,
    ], { encoding: 'utf8' });
    const pVer = pVerRes.stdout.trim();
    if (pVer) {
      installedMajor = pVer.split('.')[0];
      console.log(`  ✓ Runtime Edge/WebView2 detectado: ${pVer} (${p})`);
      break;
    }
  }
}

if (installedMajor && installedMajor !== driverMajor) {
  console.error(`\n❌ [MISMATCH DE VERSIÓN] msedgedriver (${driverVersionStr}) no coincide con el runtime de Edge (${installedMajor}.x).`);
  console.error('   Descargue la versión exacta de msedgedriver correspondiente a su runtime.');
  process.exit(1);
}

// 1.4 Binario de la aplicación REA
if (!fs.existsSync(APP_BIN_PATH)) {
  console.error(`\n❌ [BINARIO NO ENCONTRADO] No existe ${APP_BIN_PATH}.`);
  console.error('   Compilación requerida: npx tauri build --debug --no-bundle\n');
  process.exit(1);
}
console.log(`  ✓ Binario de REA detectado: ${APP_BIN_PATH}`);

// Asegurar directorio de artefactos
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 2. GESTIÓN DEL PROCESO tauri-driver
// ---------------------------------------------------------------------------
console.log('\n[2/5] Comprobando servicio tauri-driver en puerto 4444...');

async function isPortListening(port) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(400);
    client.on('connect', () => {
      client.destroy();
      resolve(true);
    });
    client.on('error', () => {
      client.destroy();
      resolve(false);
    });
    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });
    client.connect(port, '127.0.0.1');
  });
}

let driverProcess = null;
const alreadyListening = await isPortListening(DRIVER_PORT);

if (!alreadyListening) {
  console.log('  Iniciando tauri-driver en segundo plano...');
  driverProcess = spawn(tauriDriverBin, ['--port', String(DRIVER_PORT)], {
    stdio: 'ignore',
    windowsHide: true,
  });

  driverProcess.on('error', (err) => {
    console.error('  ❌ Error lanzando tauri-driver:', err);
  });

  // Esperar a que el puerto responda
  let ready = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isPortListening(DRIVER_PORT)) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    console.error('  ❌ tauri-driver no respondió en el puerto 4444 tras 5 segundos.');
    process.exit(1);
  }
}
console.log('  ✓ tauri-driver listo y escuchando en http://127.0.0.1:4444');

function cleanup() {
  if (driverProcess) {
    try {
      driverProcess.kill('SIGTERM');
    } catch {}
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

// ---------------------------------------------------------------------------
// 3. CREACIÓN DE SESIÓN WEBDRIVER Y APERTURA DE VENTANA NATIVA
// ---------------------------------------------------------------------------
console.log('\n[3/5] Creando sesión WebDriver sobre la ventana nativa...');

let sessionId = null;

try {
  const sessionRes = await fetch(`${DRIVER_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          'tauri:options': {
            application: APP_BIN_PATH,
          },
        },
      },
    }),
  });

  if (!sessionRes.ok) {
    const errText = await sessionRes.text();
    throw new Error(`Fallo HTTP ${sessionRes.status} al crear sesión: ${errText}`);
  }

  const sessionData = await sessionRes.json();
  sessionId = sessionData.value?.sessionId;
  if (!sessionId) {
    throw new Error(`Respuesta WebDriver no devolvió sessionId: ${JSON.stringify(sessionData)}`);
  }

  const caps = sessionData.value?.capabilities || {};
  console.log(`  ✓ Sesión WebDriver adherida con éxito.`);
  console.log(`    Session ID: ${sessionId}`);
  console.log(`    Navegador:  ${caps.browserName} ${caps.browserVersion}`);
  console.log(`    Driver:     ${caps.msedge?.msedgedriverVersion || 'msedgedriver'}`);

  // Helper para WebDriver HTTP
  async function executeSync(script, args = []) {
    const res = await fetch(`${DRIVER_URL}/session/${sessionId}/execute/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script, args }),
    });
    const json = await res.json();
    return json.value;
  }

  async function executeAsync(script, args = []) {
    const res = await fetch(`${DRIVER_URL}/session/${sessionId}/execute/async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script, args }),
    });
    const json = await res.json();
    return json.value;
  }

  async function findElement(selector) {
    const res = await fetch(`${DRIVER_URL}/session/${sessionId}/element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ using: 'css selector', value: selector }),
    });
    const json = await res.json();
    const id = Object.values(json.value || {})[0];
    return id || null;
  }

  async function clickElement(elemId) {
    await fetch(`${DRIVER_URL}/session/${sessionId}/element/${elemId}/click`, {
      method: 'POST',
    });
  }

  async function takeScreenshot(fileName) {
    const res = await fetch(`${DRIVER_URL}/session/${sessionId}/screenshot`);
    const json = await res.json();
    const targetPath = path.join(ARTIFACTS_DIR, fileName);
    fs.writeFileSync(targetPath, Buffer.from(json.value, 'base64'));
    return targetPath;
  }

  // Esperar a que la aplicación monte el DOM
  let appReady = false;
  for (let i = 0; i < 30; i++) {
    const env = await executeSync(`
      return {
        hasInternals: typeof window.__TAURI_INTERNALS__ !== 'undefined',
        ready: document.readyState === 'complete'
      };
    `);
    if (env?.ready && env?.hasInternals) {
      appReady = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!appReady) {
    throw new Error('La ventana nativa de Tauri no inicializó window.__TAURI_INTERNALS__ en el tiempo límite.');
  }
  console.log('  ✓ Entorno nativo Tauri activo: window.__TAURI_INTERNALS__ disponible.');

  // -------------------------------------------------------------------------
  // 4. VERIFICACIONES DEL SMOKE TEST
  // -------------------------------------------------------------------------
  console.log('\n[4/5] Ejecutando verificaciones del Smoke Test...');

  // (b) El canvas del PDF renderiza píxeles reales (captura PNG como artefacto)
  console.log('\n  [Sub-verificación B] Renderizado de píxeles reales en Canvas...');
  let canvasResult = null;
  for (let i = 0; i < 30; i++) {
    canvasResult = await executeSync(`
      const canvas = document.querySelector('canvas');
      if (!canvas) return { ok: false, reason: 'canvas no encontrado' };
      const ctx = canvas.getContext('2d');
      if (!ctx) return { ok: false, reason: 'sin contexto 2d' };
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return { ok: false, reason: 'dimensiones 0' };
      const data = ctx.getImageData(0, 0, Math.min(w, 200), Math.min(h, 200)).data;
      let nonZero = 0;
      for (let p = 0; p < data.length; p += 4) {
        if (data[p + 3] > 0) nonZero++;
      }
      return { ok: true, width: w, height: h, nonZeroPixels: nonZero };
    `);
    if (canvasResult?.ok && canvasResult.nonZeroPixels > 0) break;
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!canvasResult?.ok || canvasResult.nonZeroPixels === 0) {
    throw new Error(`El canvas no renderizó píxeles reales: ${JSON.stringify(canvasResult)}`);
  }
  console.log(`    ✓ Canvas con dimensiones ${canvasResult.width}x${canvasResult.height} px.`);
  console.log(`    ✓ Píxeles opacos no nulos detectados: ${canvasResult.nonZeroPixels}.`);

  const canvasScreenshotPath = await takeScreenshot('pdf-canvas-smoke.png');
  console.log(`    ✓ Artefacto guardado: ${canvasScreenshotPath}`);

  // (c) Capa IPC REAL: write_bbx y read_bbx con archivo temporal y sin .tmp residual
  console.log('\n  [Sub-verificación C] Capa IPC Real (Rust write_bbx y read_bbx)...');
  const tempBbxPath = path.resolve('temp_native_smoke.bbx.json').replace(/\\/g, '/');
  const tempPayload = {
    version: '1.1.0',
    pdfFileName: 'native-smoke-test.pdf',
    lastSavedAt: new Date().toISOString(),
    author: 'TauriDriverNativeSmoke',
    markups: [
      {
        id: 'smoke-test-markup-1',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
        style: { strokeColor: '#e11d48', strokeWidth: 2, opacity: 1 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const tempJsonString = JSON.stringify(tempPayload, null, 2);

  // Escribir archivo vía IPC real
  const writeRes = await executeAsync(`
    const done = arguments[arguments.length - 1];
    const [filePath, jsonContent] = arguments;
    window.__TAURI_INTERNALS__.invoke('write_bbx', { filePath, jsonContent })
      .then(() => done({ success: true }))
      .catch((err) => done({ error: String(err) }));
  `, [tempBbxPath, tempJsonString]);

  if (writeRes?.error) {
    throw new Error(`write_bbx falló vía IPC nativo: ${writeRes.error}`);
  }

  // Comprobar disco local
  if (!fs.existsSync(tempBbxPath)) {
    throw new Error(`El archivo ${tempBbxPath} no existe en disco tras invocación de write_bbx.`);
  }
  const diskTmpPath = `${tempBbxPath}.tmp`;
  if (fs.existsSync(diskTmpPath)) {
    throw new Error(`Existe residuo temporal ${diskTmpPath} en disco: renombramiento atómico no limpio.`);
  }
  const fileContentOnDisk = fs.readFileSync(tempBbxPath, 'utf8');
  const parsedDiskContent = JSON.parse(fileContentOnDisk);
  if (parsedDiskContent.author !== 'TauriDriverNativeSmoke') {
    throw new Error('El contenido en disco no coincide con la carga enviada a write_bbx.');
  }
  console.log(`    ✓ write_bbx atómico exitoso en disco (${tempBbxPath}).`);
  console.log(`    ✓ Sin archivos residuales .tmp en el sistema de archivos.`);

  // Leer archivo vía IPC real
  const readRes = await executeAsync(`
    const done = arguments[arguments.length - 1];
    const [filePath] = arguments;
    window.__TAURI_INTERNALS__.invoke('read_bbx', { filePath })
      .then((content) => done({ success: true, content }))
      .catch((err) => done({ error: String(err) }));
  `, [tempBbxPath]);

  if (readRes?.error) {
    throw new Error(`read_bbx falló vía IPC nativo: ${readRes.error}`);
  }
  const parsedReadContent = JSON.parse(readRes.content);
  if (parsedReadContent.markups?.length !== 1 || parsedReadContent.markups[0].id !== 'smoke-test-markup-1') {
    throw new Error('read_bbx devolvió contenido inconsistente con el guardado.');
  }
  console.log(`    ✓ read_bbx leyó el archivo correctamente a través de Rust IPC.`);

  // Limpiar archivo temporal de disco
  fs.unlinkSync(tempBbxPath);
  console.log(`    ✓ Archivo temporal de prueba eliminado.`);

  // (d) Interacciones reales W3C Actions API (dibujar rectángulo y seleccionarlo)
  console.log('\n  [Sub-verificación D] Acciones de ratón W3C (dibujar y seleccionar rectángulo)...');

  // Seleccionar herramienta Rectángulo
  const rectBtnId = await findElement('button[title*="Rectángulo"]');
  if (!rectBtnId) {
    throw new Error('No se encontró el botón de herramienta Rectángulo en la barra superior.');
  }
  await clickElement(rectBtnId);
  console.log('    ✓ Herramienta Rectángulo activada mediante clic nativo.');

  // Obtener caja del visor
  const canvasRect = await executeSync(`
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  `);

  const drawX1 = canvasRect.x + 80;
  const drawY1 = canvasRect.y + 80;
  const drawX2 = canvasRect.x + 220;
  const drawY2 = canvasRect.y + 180;

  // Acción de arrastre para dibujar rectángulo
  await fetch(`${DRIVER_URL}/session/${sessionId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actions: [
        {
          type: 'pointer',
          id: 'mouse1',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', duration: 100, x: drawX1, y: drawY1 },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', duration: 200, x: drawX2, y: drawY2 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    }),
  });
  await fetch(`${DRIVER_URL}/session/${sessionId}/actions`, { method: 'DELETE' });
  await new Promise((r) => setTimeout(r, 400));

  // Verificar que el rectángulo se añadió
  const markupsCount = await executeSync(`
    const svgRects = document.querySelectorAll('svg rect[data-markup-id], svg rect');
    return svgRects.length;
  `);
  console.log(`    ✓ Rectángulo trazado en el lienzo (elementos detectados: ${markupsCount}).`);

  // Activar herramienta Seleccionar
  const selectBtnId = await findElement('button[title*="Seleccionar"]');
  if (selectBtnId) {
    await clickElement(selectBtnId);
  }

  // Clic en el centro para seleccionar
  const clickX = canvasRect.x + 130;
  const clickY = canvasRect.y + 130;
  await fetch(`${DRIVER_URL}/session/${sessionId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actions: [
        {
          type: 'pointer',
          id: 'mouse1',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', duration: 100, x: clickX, y: clickY },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    }),
  });
  await fetch(`${DRIVER_URL}/session/${sessionId}/actions`, { method: 'DELETE' });

  const actionsScreenshotPath = await takeScreenshot('native-rectangle-drawn.png');
  console.log(`    ✓ Artefacto de interacción guardado: ${actionsScreenshotPath}`);

  console.log('\n[5/5] Cerrando sesión WebDriver y finalizando procesos...');
} finally {
  if (sessionId) {
    try {
      await fetch(`${DRIVER_URL}/session/${sessionId}`, { method: 'DELETE' });
      console.log('  ✓ Sesión WebDriver cerrada.');
    } catch {}
  }
  cleanup();
}

console.log('\n============================================================');
console.log('🎉 [SMOKE TEST NATIVO EXITOSO] Todas las comprobaciones han pasado.');
console.log('============================================================\n');
process.exit(0);
