import { describe, it, expect } from 'vitest';
import { buildPrintCss, effectiveDpi, MAX_PRINT_PIXELS, MAX_PRINT_SIDE_PX, printPixels } from './printLayout';

describe('Print: resolución y hoja de estilos (ADR-0115)', () => {
  it('una página normal se rasteriza a la resolución pedida', () => {
    const letter = { widthPt: 612, heightPt: 792 };
    expect(effectiveDpi(letter, 150)).toBe(150);
    expect(printPixels(letter, 150)).toEqual({ width: 1275, height: 1650, dpi: 150 });
    expect(printPixels({ widthPt: 842, heightPt: 595 }, 300).dpi).toBe(300);
  });

  it('un plano grande baja la resolución para no pasar del lado ni del área máximos', () => {
    const a0 = { widthPt: 3370, heightPt: 2384 }; // 46.8 × 33.1 in
    const px = printPixels(a0, 300);
    expect(Math.max(px.width, px.height)).toBeLessThanOrEqual(MAX_PRINT_SIDE_PX);
    expect(px.width * px.height).toBeLessThanOrEqual(MAX_PRINT_PIXELS);
    expect(px.dpi).toBeLessThan(300);
    expect(px.dpi).toBeGreaterThan(100);
    // La proporción de la página se conserva
    expect(px.width / px.height).toBeCloseTo(3370 / 2384, 2);
  });

  it('nunca baja de 36 ppp ni da una imagen vacía, aunque la página sea enorme', () => {
    const huge = { widthPt: 200000, heightPt: 200000 };
    expect(effectiveDpi(huge, 300)).toBe(36);
    expect(printPixels({ widthPt: 1, heightPt: 1 }, 100).width).toBeGreaterThanOrEqual(1);
  });

  it('tamaño real: cada página lleva su hoja con su tamaño en puntos', () => {
    const css = buildPrintCss([{ widthPt: 612, heightPt: 792 }, { widthPt: 1224, heightPt: 792 }], 'actual', false);
    expect(css).toContain('@page p0 { size: 612pt 792pt; margin: 0; }');
    expect(css).toContain('@page p1 { size: 1224pt 792pt; margin: 0; }');
    expect(css).toContain('.rea-print-p1 { page: p1; width: 1224pt; height: 792pt; }');
  });

  it('ajustar al papel: solo se indica la orientación de cada página y la imagen se ajusta sin deformarse', () => {
    const css = buildPrintCss([{ widthPt: 612, heightPt: 792 }, { widthPt: 1224, heightPt: 792 }], 'fit', false);
    expect(css).toContain('@page p0 { size: portrait; margin: 0; }');
    expect(css).toContain('@page p1 { size: landscape; margin: 0; }');
    expect(css).toContain('object-fit: contain');
    expect(css).not.toContain('612pt');
  });

  it('solo la impresión ve el contenedor; en pantalla está oculto y el resto de la aplicación se oculta al imprimir', () => {
    const css = buildPrintCss([{ widthPt: 100, heightPt: 100 }], 'fit', false);
    expect(css).toContain('@media screen { #rea-print-root { display: none !important; } }');
    expect(css).toContain('body > *:not(#rea-print-root) { display: none !important; }');
  });

  it('blanco y negro aplica un filtro de grises a las imágenes', () => {
    expect(buildPrintCss([{ widthPt: 100, heightPt: 100 }], 'fit', true)).toContain('filter: grayscale(1)');
    expect(buildPrintCss([{ widthPt: 100, heightPt: 100 }], 'fit', false)).not.toContain('grayscale');
  });
});
