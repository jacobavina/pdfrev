import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import type { Markup } from '../../types/markup';
import {
  cropPdfPages,
  markupsOutsideRect,
  marginsToViewRect,
  pdfBoxToViewRect,
  readPageGeometry,
  remapMarkupsToRect,
  remapPoint,
  remapViewportsToRect,
  viewRectToPdfBox,
  viewSize,
} from './pageBoxes';

const mk = (id: string, points: { x: number; y: number }[], extra: Partial<Markup> = {}): Markup =>
  ({ id, type: 'rectangle', pageIndex: 0, points, style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending', ...extra }) as Markup;

const pdfWith = async (rotation: 0 | 90 | 180 | 270) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  page.setRotation(degrees(rotation));
  return doc.save();
};

describe('Crop Pages: geometría del recorte (ADR-0113)', () => {
  it('los márgenes dan el rectángulo visible y uno que deja la página casi vacía se rechaza', () => {
    const size = { width: 600, height: 400 };
    expect(marginsToViewRect(size, { top: 40, right: 60, bottom: 40, left: 60 })).toEqual({ u1: 0.1, v1: 0.1, u2: 0.9, v2: 0.9 });
    expect(marginsToViewRect(size, { top: 0, right: 0, bottom: 0, left: 590 })).toBeNull();
    expect(marginsToViewRect(size, { top: 200, right: 0, bottom: 200, left: 0 })).toBeNull();
  });

  it('con la página sin rotar el CropBox es el rectángulo visible en puntos nativos', async () => {
    const [g] = await readPageGeometry(await pdfWith(0));
    const r = marginsToViewRect(viewSize(g.transform), { top: 40, right: 60, bottom: 40, left: 60 })!;
    const box = viewRectToPdfBox(r, g.transform);
    expect([box.x, box.y, box.width, box.height].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([60, 40, 480, 320]);
  });

  it('con la página rotada 90° los márgenes siguen siendo los de lo que se ve', async () => {
    const [g] = await readPageGeometry(await pdfWith(90));
    // Vista de 400 de ancho por 600 de alto; margen izquierdo de 50 y superior de 100
    expect(viewSize(g.transform)).toEqual({ width: 400, height: 600 });
    const r = marginsToViewRect(viewSize(g.transform), { top: 100, right: 0, bottom: 0, left: 50 })!;
    const box = viewRectToPdfBox(r, g.transform);
    // El tamaño visible es 350×500; sin rotar, ancho y alto van intercambiados
    expect(box.width).toBeCloseTo(500, 6);
    expect(box.height).toBeCloseTo(350, 6);
    // Y volver de la caja al rectángulo visible da el mismo rectángulo
    const back = pdfBoxToViewRect(box, g.transform);
    expect([back.u1, back.v1, back.u2, back.v2].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([0.125, 1 / 6, 1, 1].map((n) => Math.round(n * 1e6) / 1e6));
  });

  it('recortar el PDF fija el CropBox, que pasa a ser la página que se ve, y la rotación se conserva', async () => {
    const bytes = await pdfWith(270);
    const [g] = await readPageGeometry(bytes);
    const r = marginsToViewRect(viewSize(g.transform), { top: 20, right: 30, bottom: 40, left: 10 })!;
    const out = await cropPdfPages(bytes, [{ pageIndex: 0, rect: r }]);
    const [after] = await readPageGeometry(out);
    expect(after.transform.rotation).toBe(270);
    const v = viewSize(after.transform);
    expect(v.width).toBeCloseTo(400 - 10 - 30, 6);
    expect(v.height).toBeCloseTo(600 - 20 - 40, 6);
    // El MediaBox sigue entero: el recorte es reversible
    expect(after.mediaBox).toEqual({ x: 0, y: 0, width: 600, height: 400 });
  });

  it('restaurar a la caja completa devuelve el rectángulo visible que contiene a la página recortada', async () => {
    const bytes = await pdfWith(0);
    const [g] = await readPageGeometry(bytes);
    const cropped = await cropPdfPages(bytes, [{ pageIndex: 0, rect: { u1: 0.1, v1: 0.1, u2: 0.9, v2: 0.9 } }]);
    const [after] = await readPageGeometry(cropped);
    const full = pdfBoxToViewRect(after.mediaBox, after.transform);
    expect(full.u1).toBeLessThan(0);
    expect(full.u2).toBeGreaterThan(1);
    // El punto del centro de la página recortada queda en el centro de la completa
    expect(remapPoint({ x: 0.5, y: 0.5 }, { u1: -0.125, v1: -0.125, u2: 1.125, v2: 1.125 })).toEqual({ x: 0.5 / 1.25 + 0.1, y: 0.5 / 1.25 + 0.1 });
    expect(g.mediaBox.width).toBe(600);
  });
});

describe('Crop Pages: marcas y viewports (ADR-0113)', () => {
  const rect = { u1: 0.1, v1: 0.2, u2: 0.9, v2: 0.8 };

  it('las marcas dentro del recorte pasan a las coordenadas de la página recortada', () => {
    const inside = mk('a', [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }], { leaders: [[{ x: 0.5, y: 0.5 }]], cutouts: [[{ x: 0.3, y: 0.4 }]] });
    const other = mk('b', [{ x: 0.5, y: 0.5 }], { pageIndex: 1 });
    const [out, untouched] = remapMarkupsToRect([inside, other], 0, rect);
    expect(out.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(out.leaders![0][0].x).toBeCloseTo(0.5, 9);
    expect(out.cutouts![0][0].x).toBeCloseTo(0.25, 9);
    expect(out.cutouts![0][0].y).toBeCloseTo(1 / 3, 9);
    expect(untouched).toBe(other);
  });

  it('detecta las marcas que quedarían fuera, solo de la página recortada', () => {
    const out = mk('fuera', [{ x: 0.05, y: 0.5 }, { x: 0.5, y: 0.5 }]);
    const ok = mk('dentro', [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.7 }]);
    const elsewhere = mk('otra', [{ x: 0.01, y: 0.01 }], { pageIndex: 3 });
    expect(markupsOutsideRect([out, ok, elsewhere], 0, rect)).toEqual(['fuera']);
  });

  it('los límites de un viewport de medición se reescalan al recorte', () => {
    const [vp] = remapViewportsToRect(
      [{ id: 'v', name: 'v', pageIndex: 0, bounds: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 }, calibration: { scale: 1, unit: 'm' } }],
      rect
    );
    expect(vp.bounds.x).toBeCloseTo(0, 9);
    expect(vp.bounds.y).toBeCloseTo(0, 9);
    expect(vp.bounds.width).toBeCloseTo(0.5, 9);
    expect(vp.bounds.height).toBeCloseTo(0.5, 9);
  });
});
