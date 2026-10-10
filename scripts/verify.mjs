#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const withE2E = process.argv.includes('--with-e2e');

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

const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const cargoCmd = 'cargo';

console.log(`============================================================`);
console.log(`  REA — PUERTA DE CALIDAD AUTOMATIZADA`);
console.log(`  Plataforma: ${process.platform} | Modo E2E: ${withE2E ? 'Activado (3 pasadas)' : 'Omitido'}`);
console.log(`============================================================`);

// 1. Pruebas Unitarias Vitest
run('Paso 1/3: Pruebas Unitarias (npm test)', npmCmd, ['test']);

// 2. Compilación y Build (TypeScript + Vite)
run('Paso 2/3: Compilación TypeScript y Vite Build (npm run build)', npmCmd, ['run', 'build']);

// 3. Pruebas Nativas Rust
run('Paso 3/3: Pruebas Unitarias de Rust (cargo test)', cargoCmd, [
  'test',
  '--manifest-path',
  'src-tauri/Cargo.toml',
]);

// 4. Pruebas E2E (si --with-e2e está presente, 3 pasadas consecutivas)
if (withE2E) {
  console.log(`\n============================================================`);
  console.log(`  INICIANDO 3 PASADAS CONSECUTIVAS DE PLAYWRIGHT E2E`);
  console.log(`============================================================\n`);

  for (let i = 1; i <= 3; i++) {
    run(`Paso E2E (${i}/3): Playwright Suite`, npmCmd, ['run', 'test:e2e']);
  }
}

console.log(`\n============================================================`);
console.log(`🎉 [VERIFY EXITOSO] Todas las puertas de calidad han pasado en verde.`);
console.log(`============================================================\n`);
process.exit(0);
