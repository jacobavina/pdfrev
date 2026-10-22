import { describe, it, expect } from 'vitest';
import { detectEnclosure, ringArea, dilate } from './dynamicFill';

const W = 400;
const H = 300;
const blank = () => new Uint8ClampedArray(W * H * 4).fill(255);
const ink = (img: Uint8ClampedArray, x0: number, y0: number, w: number, h: number) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
};
/** Habitación con muros de 4 px: interior 100..299 × 60..239 (200 × 180 px). */
const room = (gapAt?: { x: number; y: number; w: number; h: number }) => {
  const img = blank();
  ink(img, 96, 56, 208, 4); // arriba
  ink(img, 96, 240, 208, 4); // abajo
  ink(img, 96, 56, 4, 188); // izquierda
  ink(img, 300, 56, 4, 188); // derecha
  if (gapAt) for (let y = gapAt.y; y < gapAt.y + gapAt.h; y++) for (let x = gapAt.x; x < gapAt.x + gapAt.w; x++) img.fill(255, (y * W + x) * 4, (y * W + x) * 4 + 3);
  return img;
};

describe('Relleno dinámico de áreas (ADR-0095)', () => {
  it('detecta por flood-fill el polígono interior de un recinto con umbral de vanos y genera su medición de área', () => {
    const r = detectEnclosure(room(), W, H, { x: 200, y: 150 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const xs = r.points.map((p) => p.x * W);
    const ys = r.points.map((p) => p.y * H);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(99);
    expect(Math.max(...xs)).toBeLessThanOrEqual(301);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(59);
    expect(Math.max(...ys)).toBeLessThanOrEqual(241);
    // El área del polígono coincide con el interior (200 × 180) con un 3 % de margen
    expect(r.areaPx / (200 * 180)).toBeGreaterThan(0.97);
    expect(r.areaPx / (200 * 180)).toBeLessThan(1.03);
    expect(ringArea(r.points.map((p) => ({ x: p.x * W, y: p.y * H }))) / (200 * 180)).toBeGreaterThan(0.95);
    // Un rectángulo se simplifica a pocos vértices
    expect(r.points.length).toBeLessThanOrEqual(8);
  });

  it('un hueco menor que el umbral se cierra y uno mayor deja el recinto abierto', () => {
    const smallGap = { x: 298, y: 140, w: 8, h: 6 }; // vano de 6 px en el muro derecho
    expect(detectEnclosure(room(smallGap), W, H, { x: 200, y: 150 }, { gap: 4 }).ok).toBe(true);
    const bigGap = { x: 298, y: 120, w: 8, h: 40 };
    const open = detectEnclosure(room(bigGap), W, H, { x: 200, y: 150 }, { gap: 4 });
    expect(open).toEqual({ ok: false, reason: 'open' });
  });

  it('un clic sobre un muro no genera recinto', () => {
    expect(detectEnclosure(room(), W, H, { x: 98, y: 150 })).toEqual({ ok: false, reason: 'on-line' });
  });

  it('un obstáculo dentro del recinto no cambia su contorno exterior', () => {
    const img = room();
    ink(img, 180, 120, 30, 30); // pilar
    const r = detectEnclosure(img, W, H, { x: 120, y: 80 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.areaPx / (200 * 180)).toBeGreaterThan(0.95);
  });

  it('la dilatación engrosa un píxel en todas direcciones', () => {
    const m = new Uint8Array(25);
    m[12] = 1;
    const d = dilate(m, 5, 5, 1);
    expect(d.reduce((s, v) => s + v, 0)).toBe(9);
  });
});
