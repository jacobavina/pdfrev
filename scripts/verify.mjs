#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

const isWindows = process.platform === 'win32';

// Parse arguments
let withE2E = process.argv.includes('--with-e2e');
let e2eLoopCount = 3;
const loopIdx = process.argv.indexOf('--e2e-loop');
if (loopIdx !== -1 && process.argv[loopIdx + 1]) {
  const parsed = parseInt(process.argv[loopIdx + 1], 10);
  if (!Number.isNaN(parsed) && parsed > 0) {
    e2eLoopCount = parsed;
    withE2E = true;
  }
}

let logDir = null;
const logDirIdx = process.argv.indexOf('--log-dir');
if (logDirIdx !== -1 && process.argv[logDirIdx + 1]) {
  logDir = process.argv[logDirIdx + 1];
} else if (withE2E) {
  logDir = 'tests/e2e-logs';
}

const withNative = process.argv.includes('--with-native');

function run(commandDesc, bin, args) {
  console.log(`\n============================================================`);
  console.log(`[VERIFY] ${commandDesc}`);
  console.log(`[COMANDO] ${bin} ${args.join(' ')}`);
  console.log(`============================================================\n`);

  let res;
  if (isWindows && bin.endsWith('.cmd')) {
    res = spawnSync('cmd.exe', ['/d', '/s', '/c', bin, ...args], {
      stdio: 'inherit',
      env: process.env,
    });
  } else {
    res = spawnSync(bin, args, {
      stdio: 'inherit',
      env: process.env,
    });
  }

  if (res.error) {
    console.error(`\n❌ [ERROR VERIFY] No se pudo ejecutar '${bin}': ${res.error.message}`);
    process.exit(1);
  }

  const exitCode = res.status ?? (res.signal ? 1 : 0);
  if (exitCode !== 0) {
    console.error(`\n❌ [ERROR VERIFY] '${commandDesc}' falló con código de salida ${exitCode}.\n`);
    process.exit(exitCode);
  }

  console.log(`\n✅ [OK VERIFY] '${commandDesc}' finalizado con éxito.\n`);
}

function runE2EWithLog(i, total, bin, args, targetLogDir) {
  const logFile = targetLogDir ? path.join(targetLogDir, `pass-${i}.log`) : null;
  if (targetLogDir) {
    fs.mkdirSync(targetLogDir, { recursive: true });
  }

  console.log(`\n============================================================`);
  console.log(`[VERIFY] Paso E2E (${i}/${total}): Playwright Suite`);
  console.log(`[COMANDO] ${bin} ${args.join(' ')}`);
  if (logFile) {
    console.log(`[LOG] Guardando evidencia en: ${logFile}`);
  }
  console.log(`============================================================\n`);

  let res;
  if (isWindows && bin.endsWith('.cmd')) {
    res = spawnSync('cmd.exe', ['/d', '/s', '/c', bin, ...args], {
      stdio: logFile ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
      encoding: 'utf-8',
    });
  } else {
    res = spawnSync(bin, args, {
      stdio: logFile ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
      encoding: 'utf-8',
    });
  }

  if (logFile && res) {
    const combinedOutput = (res.stdout || '') + (res.stderr || '');
    process.stdout.write(res.stdout || '');
    process.stderr.write(res.stderr || '');
    fs.writeFileSync(logFile, combinedOutput, 'utf-8');
  }

  if (res.error) {
    console.error(`\n❌ [ERROR VERIFY] No se pudo ejecutar '${bin}': ${res.error.message}`);
    process.exit(1);
  }

  const exitCode = res.status ?? (res.signal ? 1 : 0);
  if (exitCode !== 0) {
    console.error(`\n❌ [ERROR VERIFY] Paso E2E (${i}/${total}) falló con código de salida ${exitCode}.\n`);
    if (logFile) {
      console.error(`Log completo disponible en: ${logFile}\n`);
    }
    process.exit(exitCode);
  }

  console.log(`\n✅ [OK VERIFY] Paso E2E (${i}/${total}) finalizado con éxito.\n`);
}

const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const cargoCmd = 'cargo';
const nodeCmd = process.execPath || 'node';

console.log(`============================================================`);
console.log(`  pdfrev — PUERTA DE CALIDAD AUTOMATIZADA`);
console.log(
  `  Plataforma: ${process.platform} | Modo E2E: ${
    withE2E ? `Activado (${e2eLoopCount} pasadas)` : 'Omitido'
  } | Modo Nativo: ${withNative ? 'Activado' : 'Omitido'}`
);
if (withE2E && logDir) {
  console.log(`  Directorio de logs E2E: ${logDir}`);
}
console.log(`============================================================`);

function checkBundleSize() {
  const distDir = path.resolve('dist');
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.error(`\n❌ [ERROR VERIFY] No se encontró dist/index.html tras el build.`);
    process.exit(1);
  }
  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');
  const match = htmlContent.match(/src="\/assets\/(index-[^"]+\.js)"/);
  let mainChunkName = match ? match[1] : null;
  let mainChunkPath = mainChunkName ? path.join(distDir, 'assets', mainChunkName) : null;

  if (!mainChunkPath || !fs.existsSync(mainChunkPath)) {
    const assetsDir = path.join(distDir, 'assets');
    const files = fs.existsSync(assetsDir)
      ? fs.readdirSync(assetsDir).filter((f) => f.startsWith('index-') && f.endsWith('.js'))
      : [];
    if (files.length === 0) {
      console.error(`\n❌ [ERROR VERIFY] No se encontró el chunk principal en dist/assets.`);
      process.exit(1);
    }
    files.sort(
      (a, b) =>
        fs.statSync(path.join(assetsDir, b)).size - fs.statSync(path.join(assetsDir, a)).size
    );
    mainChunkName = files[0];
    mainChunkPath = path.join(assetsDir, mainChunkName);
  }

  const stat = fs.statSync(mainChunkPath);
  const sizeBytes = stat.size;
  const sizeKB = sizeBytes / 1024;
  const sizeKBStr = sizeKB.toFixed(2);
  const MAX_BUNDLE_KB = 800; // Umbral estricto: el chunk principal no debe superar 800 kB

  console.log(`\n============================================================`);
  console.log(`[VERIFY] Puerta de Calidad: Medición de Tamaño de Bundle (dist/assets)`);
  console.log(`  Chunk principal: ${mainChunkName}`);
  console.log(`  Tamaño medido:   ${sizeKBStr} kB (${sizeBytes.toLocaleString()} bytes)`);
  console.log(`  Umbral máximo:   ${MAX_BUNDLE_KB.toFixed(2)} kB`);
  console.log(`============================================================\n`);

  if (sizeKB > MAX_BUNDLE_KB) {
    console.error(
      `❌ [ERROR VERIFY] El tamaño del chunk principal (${sizeKBStr} kB) supera el umbral máximo de ${MAX_BUNDLE_KB} kB.\n`
    );
    process.exit(1);
  }

  console.log(
    `✅ [OK VERIFY] Tamaño de bundle principal dentro del umbral (${sizeKBStr} kB <= ${MAX_BUNDLE_KB} kB).\n`
  );
}

// 1. Pruebas Unitarias Vitest
run('Paso 1/5: Pruebas Unitarias (npm test)', npmCmd, ['test']);

// 2. Auditoría Literal de Paridad (PARITY.md) previo al build
run('Paso 2/5: Auditoría Literal de Paridad (PARITY.md)', nodeCmd, ['scripts/parity-check.mjs']);

// 3. Compilación y Build (TypeScript + Vite)
run('Paso 3/5: Compilación TypeScript y Vite Build (npm run build)', npmCmd, ['run', 'build']);

// 4. Puerta de Calidad: Medición y verificación de tamaño del bundle
checkBundleSize();

// 5. Pruebas Nativas Rust
run('Paso 5/5: Pruebas Unitarias de Rust (cargo test)', cargoCmd, [
  'test',
  '--manifest-path',
  'src-tauri/Cargo.toml',
]);

// 5. Pruebas E2E (si --with-e2e o --e2e-loop está presente)
if (withE2E) {
  console.log(`\n============================================================`);
  console.log(`  INICIANDO ${e2eLoopCount} PASADAS CONSECUTIVAS DE PLAYWRIGHT E2E`);
  console.log(`============================================================\n`);

  for (let i = 1; i <= e2eLoopCount; i++) {
    runE2EWithLog(i, e2eLoopCount, npmCmd, ['run', 'test:e2e'], logDir);
  }
}

// 6. Smoke Test Nativo (SOLO si --with-native está presente)
if (withNative) {
  run('Paso Opcional: Smoke Test de Ventana Nativa (tauri-driver)', npmCmd, [
    'run',
    'test:native',
  ]);
}

console.log(`\n============================================================`);
console.log(`🎉 [VERIFY EXITOSO] Todas las puertas de calidad han pasado en verde.`);
console.log(`============================================================\n`);
process.exit(0);
