import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfViewports, importPdfCalibrations } from './pdfScale';
import { calculateLength } from '../measurements/calculate';
import { findMatchingViewport, getEffectiveCalibrationForPoints } from '../measurements/viewports';
import { remeasureMarkup } from '../measurements/remeasure';
import { MeasurementViewport, PageCalibration, Markup } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

describe('Escalas múltiples por hoja (Viewports en /VP, ADR-0076)', () => {
  it('una medición dentro de un viewport usa la escala de esa región y se guarda en el array /VP de la página', async () => {
    // 1. Escala base de la página: 1 mm de papel = 100 mm reales (1:100)
    const pageCal: PageCalibration = {
      scale: 100,
      unit: 'mm',
      precision: 2,
    };

    // 2. Viewport regional: detalle arquitectónico en la esquina inferior izquierda con escala 1:20 (5 veces mayor)
    const viewportCal: PageCalibration = {
      scale: 20,
      unit: 'mm',
      precision: 2,
    };

    const regionalViewport: MeasurementViewport = {
      id: 'vp-detail-1',
      name: 'Detail A - Foundation',
      pageIndex: 0,
      bounds: {
        x: 0.05,
        y: 0.05,
        width: 0.35,
        height: 0.35,
      },
      calibration: viewportCal,
    };

    const viewports = [regionalViewport];
    const pageDimsPt = { width: 800, height: 600 };

    // 3. Medición fuera del viewport (en x=0.6, y=0.6): debe usar la escala de página
    const outsidePoints = [
      { x: 0.5, y: 0.5 },
      { x: 0.7, y: 0.5 },
    ];
    const effectiveOutsideCal = getEffectiveCalibrationForPoints(pageCal, outsidePoints, viewports);
    expect(effectiveOutsideCal).toEqual(pageCal);
    const measureOutside = calculateLength(outsidePoints, pageDimsPt, effectiveOutsideCal);

    // 4. Medición dentro del viewport (en x=0.15, y=0.15): debe usar la escala regional
    const insidePoints = [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.1 },
    ];
    const effectiveInsideCal = getEffectiveCalibrationForPoints(pageCal, insidePoints, viewports);
    expect(effectiveInsideCal).toEqual(viewportCal);
    const measureInside = calculateLength(insidePoints, pageDimsPt, effectiveInsideCal);

    // Con la misma distancia normalizada (dx = 0.2), la medida en 1:20 debe ser 1/5 de la medida en 1:100
    expect(measureInside.value).toBeCloseTo(measureOutside.value / 5, 2);

    // 5. Guardado incremental en PDF: persistencia en el array /VP estándar de la página
    const saved = await saveIncrementalMarkups(
      blueprint,
      [],
      {},
      {
        calibrations: { 0: pageCal },
        viewports: { 0: [regionalViewport] },
      }
    );

    // Comprobar que los bytes originales del PDF siguen intactos como prefijo
    expect(Buffer.from(saved.slice(0, blueprint.length)).equals(Buffer.from(blueprint))).toBe(true);

    const pdfText = new TextDecoder('latin1').decode(saved.slice(blueprint.length));
    expect(pdfText).toContain('/Type /Viewport');
    expect(pdfText).toContain('/BBox');
    expect(pdfText).toContain('/Measure');
    expect(pdfText).toContain('Detail A - Foundation');
    expect(pdfText).toContain('/REAId (vp-detail-1)');

    // 6. Lectura e interoperabilidad: recuperar viewports del archivo PDF guardado
    const loadedViewports = await importPdfViewports(saved);
    expect(loadedViewports[0]).toBeDefined();
    expect(loadedViewports[0].length).toBe(1);

    const loadedVp = loadedViewports[0][0];
    expect(loadedVp.id).toBe('vp-detail-1');
    expect(loadedVp.name).toBe('Detail A - Foundation');
    expect(loadedVp.pageIndex).toBe(0);
    expect(loadedVp.calibration.scale).toBeCloseTo(20, 2);
    expect(loadedVp.bounds.x).toBeCloseTo(0.05, 3);
    expect(loadedVp.bounds.y).toBeCloseTo(0.05, 3);
    expect(loadedVp.bounds.width).toBeCloseTo(0.35, 3);
    expect(loadedVp.bounds.height).toBeCloseTo(0.35, 3);

    // También se recupera la escala global de página
    const loadedCalibs = await importPdfCalibrations(saved);
    expect(loadedCalibs[0].scale).toBeCloseTo(100, 2);
  });

  it('soporta múltiples viewports por página y selecciona el de menor área en caso de solapamiento', () => {
    const vpOuter: MeasurementViewport = {
      id: 'vp-outer',
      name: 'Outer Viewport',
      pageIndex: 0,
      bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      calibration: { scale: 50, unit: 'mm' },
    };
    const vpInner: MeasurementViewport = {
      id: 'vp-inner',
      name: 'Inner Detail',
      pageIndex: 0,
      bounds: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
      calibration: { scale: 10, unit: 'mm' },
    };

    const vps = [vpOuter, vpInner];

    // Punto en (0.25, 0.25): está dentro de ambos, pero vpInner tiene menor área (más específico)
    const matchInner = findMatchingViewport([{ x: 0.25, y: 0.25 }], vps);
    expect(matchInner?.id).toBe('vp-inner');

    // Punto en (0.6, 0.6): está solo dentro de vpOuter
    const matchOuter = findMatchingViewport([{ x: 0.6, y: 0.6 }], vps);
    expect(matchOuter?.id).toBe('vp-outer');

    // Punto en (0.05, 0.05): fuera de ambos
    const matchNone = findMatchingViewport([{ x: 0.05, y: 0.05 }], vps);
    expect(matchNone).toBeNull();
  });

  it('recalcula mediciones en cascada cuando cambia la calibración de un viewport', () => {
    const calibA: PageCalibration = { scale: 50, unit: 'm', precision: 2 };
    const calibB: PageCalibration = { scale: 25, unit: 'm', precision: 2 };

    const markup: Markup = {
      id: 'm-vp-test',
      type: 'length',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.2 },
      ],
      style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
      measurement: {
        value: 10000,
        unit: 'm',
        formatted: '10000.00 m',
      },
    };

    const dims = { width: 1000, height: 800 };
    const remeasured = remeasureMarkup(markup, markup.points, dims, calibB, calibA);

    expect(remeasured.measurement).toBeDefined();
    expect(remeasured.measurement!.value).toBeCloseTo(5000, 2);
    expect(remeasured.text).toBe(remeasured.measurement!.formatted);
  });
});
