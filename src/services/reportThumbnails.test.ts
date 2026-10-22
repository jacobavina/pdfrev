import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildPdfReportContent } from './exportService';
import { pagesWithMarkups, REPORT_THUMBNAIL_MAX_PAGES } from './reportThumbnails';
import type { Markup } from '../types/markup';

const PNG_1X1 = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
);

const mk = (id: string, pageIndex: number): Markup => ({
  id,
  type: 'rectangle',
  pageIndex,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.5, y: 0.6 },
  ],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
  status: 'pending',
  text: 'Check',
});

const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');

describe('Informe de marcas con miniaturas de las hojas (ADR-0096)', () => {
  it('genera informes ejecutivos en PDF con miniaturas del plano, con las marcas dibujadas sobre cada hoja', async () => {
    const markups = [mk('a', 0), mk('b', 0), mk('c', 2)];
    const plain = await buildPdfReportContent('Plano.pdf', markups);
    const withThumbs = await buildPdfReportContent('Plano.pdf', markups, {
      thumbnails: [
        { pageIndex: 0, png: PNG_1X1, width: 4, height: 3 },
        { pageIndex: 2, png: PNG_1X1, width: 4, height: 3 },
      ],
    });
    expect(latin1(plain)).not.toContain('/Subtype /Image');
    expect(latin1(withThumbs)).toContain('/Subtype /Image');
    // El informe sigue siendo un PDF válido y conserva su tabla
    const doc = await PDFDocument.load(withThumbs);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(withThumbs.length).toBeGreaterThan(plain.length);
  });

  it('muchas hojas desbordan a páginas nuevas del informe sin perder la tabla de marcas', async () => {
    const markups = Array.from({ length: 12 }, (_, i) => mk(`m${i}`, i));
    const thumbnails = markups.map((m) => ({ pageIndex: m.pageIndex, png: PNG_1X1, width: 3, height: 4 }));
    const bytes = await buildPdfReportContent('Set.pdf', markups, { thumbnails });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it('solo se rasterizan las hojas con marcas, en orden y hasta un máximo', () => {
    expect(pagesWithMarkups([{ pageIndex: 3 }, { pageIndex: 1 }, { pageIndex: 3 }])).toEqual([1, 3]);
    const many = Array.from({ length: 40 }, (_, i) => ({ pageIndex: i }));
    expect(pagesWithMarkups(many)).toHaveLength(REPORT_THUMBNAIL_MAX_PAGES);
  });
});
