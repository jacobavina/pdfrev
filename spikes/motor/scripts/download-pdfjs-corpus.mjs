import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const ROOT_DIR = path.resolve('.');
const CORPUS_DIR = path.join(ROOT_DIR, 'corpus', 'pdfjs');
const MANIFEST_PATH = path.join(ROOT_DIR, 'spikes', 'motor', 'corpus-manifest.json');
const PDFJS_REPO = 'https://github.com/mozilla/pdf.js.git';
const FIXED_COMMIT = '881eb97f9413f57104dd43b55fa1cc5457fb54fe';
const REPO_LICENSE = 'Apache-2.0';

export async function syncPdfJsCorpus() {
  console.log(`[CORPUS] Sincronizando corpus de mozilla/pdf.js en commit ${FIXED_COMMIT}...`);

  fs.mkdirSync(CORPUS_DIR, { recursive: true });

  const tempDir = path.join(ROOT_DIR, 'corpus_temp');
  if (!fs.existsSync(path.join(tempDir, 'test', 'pdfs'))) {
    console.log('[CORPUS] Clonando sparse de pdf.js...');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    execSync(`git clone --depth 1 --filter=blob:none --sparse ${PDFJS_REPO} corpus_temp`, { stdio: 'inherit' });
    execSync(`git -C corpus_temp checkout ${FIXED_COMMIT}`, { stdio: 'inherit' });
    execSync(`git -C corpus_temp sparse-checkout set test/pdfs`, { stdio: 'inherit' });
  }

  const sourceDir = path.join(tempDir, 'test', 'pdfs');
  const sourceFiles = fs.readdirSync(sourceDir);

  const manifest = {
    repository: 'https://github.com/mozilla/pdf.js',
    commit: FIXED_COMMIT,
    license: REPO_LICENSE,
    generatedAt: new Date().toISOString(),
    totalFiles: 0,
    encryptedCount: 0,
    files: []
  };

  let count = 0;
  for (const file of sourceFiles) {
    if (!file.endsWith('.pdf')) continue; // Excluye .link u otros
    const srcPath = path.join(sourceDir, file);
    const destPath = path.join(CORPUS_DIR, file);

    const buf = fs.readFileSync(srcPath);
    if (!fs.existsSync(destPath) || fs.statSync(destPath).size !== buf.length) {
      fs.writeFileSync(destPath, buf);
    }

    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    
    // Detección simple de /Encrypt en trailer/cuerpo
    const textSnippet = buf.toString('latin1');
    const isEncrypted = /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(textSnippet);

    manifest.files.push({
      name: file,
      relativePath: `corpus/pdfjs/${file}`,
      size: buf.length,
      sha256: hash,
      encrypted: isEncrypted
    });

    if (isEncrypted) {
      manifest.encryptedCount++;
    }
    count++;
  }

  manifest.totalFiles = count;

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[CORPUS] Finalizado: ${count} archivos copiados a corpus/pdfjs/. Manifiesto escrito en ${MANIFEST_PATH}`);
  console.log(`[CORPUS] Archivos detectados con cifrado (/Encrypt): ${manifest.encryptedCount}`);

  // Limpiar temporal
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('[CORPUS] Carpeta temporal corpus_temp eliminada.');
  }

  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('./spikes/motor/scripts/download-pdfjs-corpus.mjs')) {
  syncPdfJsCorpus().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
