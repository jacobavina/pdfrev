import { describe, it, expect } from 'vitest';
import {
  fitsInSingleCanvas,
  maxRegionCss,
  regionAround,
  regionCovers,
  visibleRectOfPage,
  MAX_CANVAS_DIM_PX,
} from './tilePlan';

describe('Plan de renderizado por región (ADR-0090)', () => {
  it('una hoja E-size a 600% de zoom no cabe en un canvas pero a 100% sí', () => {
    expect(fitsInSingleCanvas(3600 * 6, 2400 * 6, 1)).toBe(false);
    expect(fitsInSingleCanvas(3600, 2400, 2)).toBe(true);
    expect(fitsInSingleCanvas(3600 * 5, 2400 * 5, 1)).toBe(false);
  });

  it('la región visible con sobreexploración nunca supera los límites del canvas ni sale de la hoja', () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      const r = regionAround({ x: 9000, y: 6000, width: 1600, height: 900 }, 21600, 14400, dpr);
      expect(r.width * dpr).toBeLessThanOrEqual(MAX_CANVAS_DIM_PX);
      expect(r.height * dpr).toBeLessThanOrEqual(MAX_CANVAS_DIM_PX);
      expect(r.width).toBeLessThanOrEqual(maxRegionCss(dpr));
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(21600);
      expect(r.y + r.height).toBeLessThanOrEqual(14400);
      expect(regionCovers(r, { x: 9000, y: 6000, width: 1600, height: 900 })).toBe(true);
    }
  });

  it('en los bordes de la hoja la región se recorta a la hoja y sigue cubriendo lo visible', () => {
    const visible = { x: 20000, y: 13500, width: 1600, height: 900 };
    const r = regionAround(visible, 21600, 14400, 1);
    expect(r.x + r.width).toBe(21600);
    expect(r.y + r.height).toBe(14400);
    expect(regionCovers(r, visible)).toBe(true);
    const corner = regionAround({ x: 0, y: 0, width: 800, height: 600 }, 21600, 14400, 1);
    expect(corner).toMatchObject({ x: 0, y: 0 });
  });

  it('un desplazamiento corto sigue dentro de la región y uno largo obliga a renderizar de nuevo', () => {
    const r = regionAround({ x: 5000, y: 5000, width: 1600, height: 900 }, 21600, 14400, 1);
    expect(regionCovers(r, { x: 5200, y: 5100, width: 1600, height: 900 })).toBe(true);
    expect(regionCovers(r, { x: 9000, y: 5000, width: 1600, height: 900 })).toBe(false);
  });

  it('lo visible de una hoja se mide dentro de la hoja aunque esta asome por arriba o a la izquierda', () => {
    const page = { x: -1000, y: -400, width: 3000, height: 2000 };
    const view = { x: 0, y: 0, width: 1200, height: 800 };
    expect(visibleRectOfPage(page, view)).toEqual({ x: 1000, y: 400, width: 1200, height: 800 });
    expect(visibleRectOfPage({ x: 5000, y: 0, width: 100, height: 100 }, view).width).toBe(0);
  });
});
