import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCalibrationStore } from '../store/useCalibrationStore';

const W = 400;
const H = 300;
const data = new Uint8ClampedArray(W * H * 4).fill(255);
const ink = (x0: number, y0: number, w: number, h: number) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
};
ink(96, 56, 208, 4);
ink(96, 240, 208, 4);
ink(96, 56, 4, 188);
ink(300, 56, 4, 188);

vi.mock('./pageRaster', () => ({
  rasterizePage: vi.fn(async () => ({ raster: { data, width: W, height: H }, aspect: W / H })),
}));
const toasts: string[] = [];
vi.mock('./toastService', () => ({ showToast: (m: string) => toasts.push(m) }));

import { dynamicFillArea } from './dynamicFillService';

const base = {
  pdfBytes: new Uint8Array([1]),
  pageIndex: 0,
  pageDimsPt: { width: 800, height: 600 },
  style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  gap: 3,
};

describe('Relleno dinámico: marca de área desde un clic (ADR-0095)', () => {
  beforeEach(() => {
    toasts.length = 0;
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
  });

  it('un clic dentro del recinto crea una medición de área con el contorno del recinto', async () => {
    const m = await dynamicFillArea({ ...base, seed: { x: 200 / W, y: 150 / H } });
    expect(m).not.toBeNull();
    expect(m).toMatchObject({ type: 'area', pageIndex: 0, author: 'Ana' });
    expect(m!.points.length).toBeGreaterThanOrEqual(3);
    // El interior es 200 × 180 px de una hoja de 400 × 300 px a 800 × 600 pt: 4 pt² por px²
    const area = m!.measurement!.value;
    expect(area).toBeGreaterThan(0);
    // Sin calibrar la unidad es el milímetro de papel: 200 × 180 × 4 pt² × (25.4 / 72)² mm²/pt²
    const expected = 200 * 180 * 4 * (25.4 / 72) ** 2;
    expect(Math.abs(area - expected) / expected).toBeLessThan(0.08);
    expect(m!.style.fillColor).not.toBe('transparent');
  });

  it('un clic sobre un muro o fuera de un recinto cerrado avisa y no crea nada', async () => {
    expect(await dynamicFillArea({ ...base, seed: { x: 98 / W, y: 150 / H } })).toBeNull();
    expect(toasts.at(-1)).toMatch(/not on a line/);
    expect(await dynamicFillArea({ ...base, seed: { x: 20 / W, y: 20 / H } })).toBeNull();
    expect(toasts.at(-1)).toMatch(/not closed/);
  });
});
