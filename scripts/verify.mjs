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
console.log(`  REA — PUERTA DE CALIDAD AUTOMATIZADA`);
console.log(
  `  Plataforma: ${process.platform} | Modo E2E: ${
    withE2E ? `Activado (${e2eLoopCount} pasadas)` : 'Omitido'
  } | Modo Nativo: ${withNative ? 'Activado' : 'Omitido'}`
);
if (withE2E && logDir) {
  console.log(`  Directorio de logs E2E: ${logDir}`);
}
console.log(`============================================================`);

// 1. Pruebas Unitarias Vitest
run('Paso 1/4: Pruebas Unitarias (npm test)', npmCmd, ['test']);

// 2. Auditoría Literal de Paridad (PARITY.md) previo al build
run('Paso 2/4: Auditoría Literal de Paridad (PARITY.md)', nodeCmd, ['scripts/parity-check.mjs']);

// 3. Compilación y Build (TypeScript + Vite)
run('Paso 3/4: Compilación TypeScript y Vite Build (npm run build)', npmCmd, ['run', 'build']);

// 4. Pruebas Nativas Rust
run('Paso 4/4: Pruebas Unitarias de Rust (cargo test)', cargoCmd, [
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
