import { describe, it, expect, beforeEach } from 'vitest';
import { getBbxPath, saveBbxForPdf, loadBbxForPdf } from './bbxPersistenceService';
import { Markup } from '../types/markup';

describe('BBX Persistence Service (.bbx.json)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates correct .bbx.json paths alongside the PDF', () => {
    expect(getBbxPath('C:/blueprints/planta_baja.pdf')).toBe('C:/blueprints/planta_baja.bbx.json');
    expect(getBbxPath('/docs/electrical-plan.PDF')).toBe('/docs/electrical-plan.bbx.json');
    expect(getBbxPath('archivo_sin_extension')).toBe('archivo_sin_extension.bbx.json');
  });

  it('saves and loads markups to and from .bbx.json format', async () => {
    const pdfPath = '/proyectos/estructural.pdf';
    const mockMarkups: Markup[] = [
      {
        id: 'bbx-test-1',
        type: 'rectangle',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.4 },
        ],
        style: {
          strokeColor: '#e02424',
          strokeWidth: 2,
          opacity: 1,
        },
        text: 'Viga reforzada requerida',
        author: 'Ing. Supervisor',
        createdAt: '2026-10-09T20:00:00.000Z',
        updatedAt: '2026-10-09T20:00:00.000Z',
        status: 'accepted',
      },
    ];

    const saved = await saveBbxForPdf(pdfPath, mockMarkups, 'Ing. Supervisor');
    expect(saved).toBe(true);

    const loaded = await loadBbxForPdf(pdfPath);
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe('1.1.0');
    expect(loaded?.pdfFileName).toBe('estructural.pdf');
    expect(loaded?.author).toBe('Ing. Supervisor');
    expect(loaded?.markups).toHaveLength(1);
    expect(loaded?.markups[0].id).toBe('bbx-test-1');
    expect(loaded?.markups[0].status).toBe('accepted');
  });

  it('returns null if .bbx.json does not exist', async () => {
    const loaded = await loadBbxForPdf('/inexistente/plano.pdf');
    expect(loaded).toBeNull();
  });
});
