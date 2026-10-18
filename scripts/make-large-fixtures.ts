import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  generateLargeBlueprintPdf,
  generateSyntheticMarkups,
  E_SIZE_WIDTH_PT,
  E_SIZE_HEIGHT_PT,
} from '../src/core/perf/largeBlueprintGenerator';
import { BbxDocumentFile } from '../src/types/markup';

export interface LargeFixtureMeta {
  name: string;
  pageCount: number;
  pageSize: { width: number; height: number };
  markupCount: number;
  seed: number;
  fileSizeBytes: number;
  sha256: string;
  generatedAt: string;
}

export async function createLargeFixture(
  outputDir = path.resolve(process.cwd(), 'fixtures'),
  markupCount = 5000,
  seed = 42
): Promise<LargeFixtureMeta> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pdfFileName = 'large-blueprint-e-size.pdf';
  const metaFileName = 'large-blueprint-e-size.meta.json';
  const bbxFileName = 'large-blueprint-e-size.bbx.json';

  const pdfPath = path.join(outputDir, pdfFileName);
  const metaPath = path.join(outputDir, metaFileName);
  const bbxPath = path.join(outputDir, bbxFileName);

  console.log(`[LargeFixture] Generating E-Size PDF (${E_SIZE_WIDTH_PT} x ${E_SIZE_HEIGHT_PT} pt)...`);
  const pdfBytes = await generateLargeBlueprintPdf({
    width: E_SIZE_WIDTH_PT,
    height: E_SIZE_HEIGHT_PT,
    seed,
  });

  fs.writeFileSync(pdfPath, pdfBytes);

  const hash = crypto.createHash('sha256').update(pdfBytes).digest('hex');

  console.log(`[LargeFixture] Generating ${markupCount} synthetic markups (seed=${seed})...`);
  const markups = generateSyntheticMarkups(markupCount, { seed, pageIndex: 0 });

  const bbxContent: BbxDocumentFile = {
    version: '1.1.0',
    pdfFileName,
    pdfFileSize: pdfBytes.length,
    lastSavedAt: '2026-10-17T12:00:00.000Z',
    author: 'Synthetic Harness',
    markups,
  };

  fs.writeFileSync(bbxPath, JSON.stringify(bbxContent, null, 2), 'utf8');

  const meta: LargeFixtureMeta = {
    name: pdfFileName,
    pageCount: 1,
    pageSize: { width: E_SIZE_WIDTH_PT, height: E_SIZE_HEIGHT_PT },
    markupCount,
    seed,
    fileSizeBytes: pdfBytes.length,
    sha256: hash,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  console.log(`[LargeFixture] Done!`);
  console.log(`  PDF:  ${pdfPath} (${(pdfBytes.length / 1024).toFixed(1)} KB)`);
  console.log(`  BBX:  ${bbxPath} (${(fs.statSync(bbxPath).size / 1024).toFixed(1)} KB)`);
  console.log(`  SHA:  ${hash}`);

  return meta;
}

// Ejecución directa por CLI
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('make-large-fixtures.ts')) {
  void createLargeFixture().catch((err) => {
    console.error('[LargeFixture] Error creating fixture:', err);
    process.exit(1);
  });
}
