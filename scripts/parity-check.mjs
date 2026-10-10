#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const parityPath = path.join(rootDir, 'PARITY.md');

if (!fs.existsSync(parityPath)) {
  console.error(`[ERROR PARITY] No se encontró el archivo PARITY.md en ${parityPath}`);
  process.exit(1);
}

const parityContent = fs.readFileSync(parityPath, 'utf8');
const lines = parityContent.split(/\r?\n/);

const mismatches = [];
let shippedCount = 0;
let todoCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  // Solo procesar líneas de tabla de markdown que inicien con '|'
  if (!line.startsWith('|') || line.startsWith('|---')) {
    continue;
  }

  const columns = line.split('|').map((col) => col.trim());
  // En formato markdown: '| col1 | col2 | col3 | col4 | col5 |' -> [' ', col1, col2, col3, col4, col5, ' ']
  if (columns.length < 6) {
    continue;
  }

  const capability = columns[1];
  const status = columns[2].replace(/`/g, '');
  const testFileRaw = columns[3].replace(/`/g, '').trim();
  const testNameRaw = columns[4].replace(/`/g, '').trim();
  const nativeVerificationRaw = columns[5]?.trim() ?? '';

  // Ignorar cabecera de tabla
  if (capability.toLowerCase().includes('capacidad') || capability.startsWith('---')) {
    continue;
  }

  // Validación de Columna 5: Verificación en Ventana Nativa (Usuario)
  if (!nativeVerificationRaw || nativeVerificationRaw === '-') {
    mismatches.push({
      line: i + 1,
      capability,
      status,
      file: testFileRaw,
      testName: testNameRaw,
      reason: `Columna 5 vacía o sin declarar: debe incluir confirmación de validación nativa o 'No aplica (...)'`,
    });
  }

  if (status === 'shipped') {
    shippedCount++;
    const testFilePath = path.join(rootDir, testFileRaw);
    if (!fs.existsSync(testFilePath)) {
      mismatches.push({
        line: i + 1,
        capability,
        status,
        file: testFileRaw,
        testName: testNameRaw,
        reason: `El archivo de prueba no existe: ${testFileRaw}`,
      });
      continue;
    }

    if (!testNameRaw || testNameRaw === '-') {
      mismatches.push({
        line: i + 1,
        capability,
        status,
        file: testFileRaw,
        testName: testNameRaw,
        reason: `Fila 'shipped' sin nombre de prueba específico`,
      });
      continue;
    }

    const testFileContent = fs.readFileSync(testFilePath, 'utf8');
    if (!testFileContent.includes(testNameRaw)) {
      mismatches.push({
        line: i + 1,
        capability,
        status,
        file: testFileRaw,
        testName: testNameRaw,
        reason: `El nombre de la prueba no aparece literalmente en ${testFileRaw}`,
      });
    }

    // Regla de verificación nativa para filas 'shipped':
    // Debe certificar validación del usuario ('usuario' o 'ventana nativa'),
    // justificar no aplicabilidad ('No aplica (...)'),
    // o declarar explícitamente revisión pendiente ('pendiente de verificación nativa').
    const isValidNativeVerification =
      /usuario|ventana nativa/i.test(nativeVerificationRaw) ||
      /^no aplica\s*\([^)]+\)/i.test(nativeVerificationRaw) ||
      /pendiente.*nativ/i.test(nativeVerificationRaw);

    if (!isValidNativeVerification) {
      mismatches.push({
        line: i + 1,
        capability,
        status,
        file: testFileRaw,
        testName: testNameRaw,
        reason: `Columna 5 de verificación nativa inválida: '${nativeVerificationRaw}'. Debe certificar validación por el usuario, justificar 'No aplica (...)' o declarar 'pendiente de verificación nativa'`,
      });
    }
  } else if (status === 'todo') {
    todoCount++;
    // En estado todo, el archivo no debe citar un archivo real como si existiera: debe ser '-'
    if (testFileRaw !== '-') {
      mismatches.push({
        line: i + 1,
        capability,
        status,
        file: testFileRaw,
        testName: testNameRaw,
        reason: `Fila 'todo' cita archivo de test '${testFileRaw}' en vez de un guion '-'`,
      });
    }

    const isTodoValid = /pendiente|no forma parte/i.test(nativeVerificationRaw);
    if (!isTodoValid) {
      mismatches.push({
        line: i + 1,
        capability,
        status,
        file: testFileRaw,
        testName: testNameRaw,
        reason: `Fila 'todo' debe declarar 'Pendiente de implementación' o 'No forma parte de la Fase 2' en columna 5`,
      });
    }
  }
}

if (mismatches.length > 0) {
  console.error('\n============================================================');
  console.error(`❌ [ERROR PARITY] Se encontraron ${mismatches.length} discrepancias en PARITY.md:`);
  console.error('============================================================\n');
  for (const m of mismatches) {
    console.error(`Línea ${m.line}: ${m.capability} [${m.status}]`);
    console.error(`  Archivo citado: ${m.file}`);
    console.error(`  Prueba citada:  ${m.testName}`);
    console.error(`  Motivo fallo:   ${m.reason}\n`);
  }
  console.error('Regla del repositorio: el nombre del test se copia y pega del archivo de test, nunca se escribe de memoria.\n');
  process.exit(1);
}

console.log(`[OK PARITY] Auditoría de PARITY.md superada con éxito (${shippedCount} shipped verificadas literalmente, ${todoCount} todo con guion).`);
process.exit(0);
