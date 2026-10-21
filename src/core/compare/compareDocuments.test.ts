import { describe, it, expect } from 'vitest';
import { compareRasters, diffMask, connectedBoxes } from './compareDocuments';

const W = 400;
const H = 300;
const blank = () => new Uint8ClampedArray(W * H * 4).fill(255);
const fillRect = (img: Uint8ClampedArray, x0: number, y0: number, w: number, h: number, v = 0) => {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * W + x) * 4;
      img[i] = img[i + 1] = img[i + 2] = v;
    }
  }
};

describe('Comparación de dos revisiones de una página (ADR-0091)', () => {
  it('detecta las regiones que cambiaron entre la revisión A y la revisión B y crea nubes de revisión en esas coordenadas', () => {
    const a = blank();
    const b = blank();
    // Elemento común a ambas revisiones: no es un cambio
    fillRect(a, 20, 20, 60, 10);
    fillRect(b, 20, 20, 60, 10);
    // Cambio 1: una cota nueva en B
    fillRect(b, 200, 60, 80, 20);
    // Cambio 2: un muro que desaparece de A a B
    fillRect(a, 100, 200, 30, 70);
    const rects = compareRasters(a, b, W, H);
    expect(rects).toHaveLength(2);
    const [first, second] = rects;
    // Cada nube rodea su cambio y deja fuera el elemento común
    expect(first.x).toBeLessThanOrEqual(200 / W);
    expect(first.x + first.width).toBeGreaterThanOrEqual(280 / W);
    expect(first.y).toBeLessThanOrEqual(60 / H);
    expect(first.y + first.height).toBeGreaterThanOrEqual(80 / H);
    expect(second.x).toBeLessThanOrEqual(100 / W);
    expect(second.x + second.width).toBeGreaterThanOrEqual(130 / W);
    expect(second.y + second.height).toBeGreaterThanOrEqual(270 / H);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(1);
      expect(r.y + r.height).toBeLessThanOrEqual(1);
    }
  });

  it('dos revisiones iguales no producen diferencias y el ruido de un píxel se descarta', () => {
    const a = blank();
    const b = blank();
    expect(compareRasters(a, b, W, H)).toEqual([]);
    fillRect(b, 50, 50, 1, 1);
    expect(compareRasters(a, b, W, H)).toEqual([]);
  });

  it('los trazos cercanos de un mismo cambio se agrupan en una sola nube y los lejanos no', () => {
    const a = blank();
    const b = blank();
    fillRect(b, 100, 100, 10, 40);
    fillRect(b, 120, 100, 10, 40);
    fillRect(b, 330, 250, 30, 30);
    expect(compareRasters(a, b, W, H)).toHaveLength(2);
  });

  it('la máscara marca solo las celdas con cambios y las componentes conexas se cuentan por separado', () => {
    const a = blank();
    const b = blank();
    fillRect(b, 0, 0, 16, 16);
    const { mask, cols, rows } = diffMask(a, b, W, H, { cell: 8 });
    expect(mask.reduce((s, v) => s + v, 0)).toBe(4);
    expect(connectedBoxes(mask, cols, rows)).toEqual([{ x0: 0, y0: 0, x1: 1, y1: 1, cells: 4 }]);
  });
});
