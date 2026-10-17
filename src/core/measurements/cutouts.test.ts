import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFArray } from 'pdf-lib';
import { calculateArea, calculateVolume, PageDimensionsPt } from './calculate';
import { getMarkupSvgDescriptor } from '../markup/render';
import { emitMarkupOperators, PageTransformInfo } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { useMarkupStore, markupHistory } from '../../store/useMarkupStore';
import { Markup, MarkupPoint, PageCalibration } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
const transform: PageTransformInfo = { rotation: 0, widthPt: 600, heightPt: 800, originX: 0, originY: 0 };
const pageSize: PageDimensionsPt = { width: 600, height: 800 };

const calibration: PageCalibration = {
  scale: 0.01, // 1 pt = 0.01 m -> 1 pt^2 = 0.0001 m^2
  unit: 'm',
  precision: 2,
};

describe('Recortes (Cutouts) en Mediciones de Área y Volumen (ADR-0075 / Hito B.1)', () => {
  beforeEach(() => {
    markupHistory.clear();
    useMarkupStore.getState().setMarkups([]);
    useMarkupStore.getState().deselectAll();
    useMarkupStore.getState().markAsClean();
  });

  it('resta el área de los huecos interiores, suma el perímetro y dibuja el recorte con regla par-impar en /AP', async () => {
    // 1. Polígono exterior de 200 x 200 pt (desde x=100 a 300, y=100 a 300)
    // Coordenadas normalizadas [0, 1] en página de 600x800:
    const outerPoints: MarkupPoint[] = [
      { x: 100 / 600, y: 100 / 800 },
      { x: 300 / 600, y: 100 / 800 },
      { x: 300 / 600, y: 300 / 800 },
      { x: 100 / 600, y: 300 / 800 },
    ];
    // Hueco interior 1: 50 x 50 pt (desde x=120 a 170, y=120 a 170)
    const hole1: MarkupPoint[] = [
      { x: 120 / 600, y: 120 / 800 },
      { x: 170 / 600, y: 120 / 800 },
      { x: 170 / 600, y: 170 / 800 },
      { x: 120 / 600, y: 170 / 800 },
    ];
    // Hueco interior 2: 40 x 50 pt (desde x=200 a 240, y=200 a 250)
    const hole2: MarkupPoint[] = [
      { x: 200 / 600, y: 200 / 800 },
      { x: 240 / 600, y: 200 / 800 },
      { x: 240 / 600, y: 250 / 800 },
      { x: 200 / 600, y: 250 / 800 },
    ];

    // Área exterior bruta = 200 pt * 200 pt * 0.0001 = 4.00 m²
    // Perímetro exterior = 200 * 4 * 0.01 = 8.00 m
    const grossArea = calculateArea(outerPoints, pageSize, calibration);
    expect(grossArea.value).toBeCloseTo(4.0, 4);

    // Hueco 1 = 50 * 50 * 0.0001 = 0.25 m², perímetro = 2.00 m
    // Hueco 2 = 40 * 50 * 0.0001 = 0.20 m², perímetro = 1.80 m
    // Área neta = 4.00 - 0.25 - 0.20 = 3.55 m²
    // Perímetro total con huecos = 8.00 + 2.00 + 1.80 = 11.80 m
    const netArea = calculateArea(outerPoints, pageSize, calibration, false, [hole1, hole2]);
    expect(netArea.value).toBeCloseTo(3.55, 3);
    expect(netArea.formatted).toBe('3.55 m²');
    expect(netArea.perimeter).toBeCloseTo(11.80, 2);

    // 2. Volumen con recortes: profundidad = 2 m
    // Volumen neto = 3.55 m² * 2 m = 7.10 m³
    const netVolume = calculateVolume(outerPoints, pageSize, calibration, 2, [hole1, hole2]);
    expect(netVolume.value).toBeCloseTo(7.1, 3);
    expect(netVolume.formatted).toBe('7.10 m³');

    // 3. Renderizado SVG con fill-rule="evenodd"
    const areaMarkup: Markup = {
      id: 'area-cutout-1',
      type: 'area',
      pageIndex: 0,
      points: outerPoints,
      cutouts: [hole1, hole2],
      style: {
        strokeColor: '#0284c7',
        fillColor: '#38bdf8',
        strokeWidth: 2,
        opacity: 0.8,
      },
      author: 'Estimator',
      createdAt: '2026-10-17T00:00:00Z',
      updatedAt: '2026-10-17T00:00:00Z',
      status: 'accepted',
      measurement: netArea,
    };

    const desc = getMarkupSvgDescriptor(areaMarkup, {
      width: 600,
      height: 800,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    });
    expect(desc.tag).toBe('g');
    const shapeDesc = desc.children?.[0];
    expect(shapeDesc?.tag).toBe('path');
    expect(shapeDesc?.attrs.fillRule).toBe('evenodd');
    // Debe contener el sub-trazado principal y los de los huecos (M ... Z M ... Z)
    const pathD = String(shapeDesc?.attrs.d || '');
    const moveToCount = (pathD.match(/M /g) || []).length;
    const closePathCount = (pathD.match(/Z/g) || []).length;
    expect(moveToCount).toBe(3);
    expect(closePathCount).toBe(3);

    // 4. Operadores PDF /AP con regla par-impar (operador B* o f*)
    const pdfOps = emitMarkupOperators(areaMarkup, transform);
    expect(pdfOps.operators).toMatch(/(?:^|\s)(B\*|f\*)(?:\s|$)/);

    // 5. Persistencia PDF incremental y lectura bidireccional
    const savedPdfBytes = await saveIncrementalMarkups(blueprint, [areaMarkup]);
    expect(savedPdfBytes.byteLength).toBeGreaterThan(blueprint.byteLength);

    // Verificar en el AST de pdf-lib que la anotación tiene /REA /cutouts y /Cutouts
    const loadedDoc = await PDFDocument.load(savedPdfBytes);
    const pageAnnots = loadedDoc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
    expect(pageAnnots).toBeDefined();

    const annotDict = pageAnnots
      .asArray()
      .map((ref) => loadedDoc.context.lookup(ref, PDFDict))
      .find((d) => d.get(PDFName.of('NM'))?.toString() === '(area-cutout-1)');

    expect(annotDict).toBeDefined();
    // /REA dictionary debe contener /cutouts
    const reaDict = annotDict?.get(PDFName.of('REA')) as PDFDict;
    expect(reaDict).toBeDefined();
    const reaCutouts = reaDict.get(PDFName.of('cutouts')) as PDFArray;
    expect(reaCutouts).toBeDefined();
    expect(reaCutouts.size()).toBe(2);

    // /Cutouts estándar de Revu/Acrobat
    const standardCutouts = annotDict?.get(PDFName.of('Cutouts')) as PDFArray;
    expect(standardCutouts).toBeDefined();
    expect(standardCutouts.size()).toBe(2);

    // 6. Importar anotaciones con annotationReader y verificar preservación y recálculo
    const { markups: importedMarkups } = await importPdfAnnotations(savedPdfBytes);
    const importedArea = importedMarkups.find((m) => m.id === 'area-cutout-1');
    expect(importedArea).toBeDefined();
    expect(importedArea?.cutouts).toBeDefined();
    expect(importedArea?.cutouts?.length).toBe(2);
    expect(importedArea?.measurement?.value).toBeCloseTo(3.55, 2);

    // 7. Store useMarkupStore: addCutout, clearCutouts y Undo/Redo
    useMarkupStore.getState().addMarkup(areaMarkup);
    expect(useMarkupStore.getState().markups[0].cutouts?.length).toBe(2);

    // Agregar un tercer hueco via store
    const hole3: MarkupPoint[] = [
      { x: 150 / 600, y: 150 / 800 },
      { x: 160 / 600, y: 150 / 800 },
      { x: 160 / 600, y: 160 / 800 },
      { x: 150 / 600, y: 160 / 800 },
    ];
    useMarkupStore.getState().addCutout('area-cutout-1', hole3, pageSize, calibration);
    expect(useMarkupStore.getState().markups[0].cutouts?.length).toBe(3);

    // Deshacer agregado de hueco
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups[0].cutouts?.length).toBe(2);

    // Rehacer agregado de hueco
    useMarkupStore.getState().redo();
    expect(useMarkupStore.getState().markups[0].cutouts?.length).toBe(3);

    // Limpiar huecos
    useMarkupStore.getState().clearCutouts('area-cutout-1', pageSize, calibration);
    expect(useMarkupStore.getState().markups[0].cutouts).toBeUndefined();
    // Al limpiar huecos, el área vuelve a ser la bruta (4.00 m²)
    expect(useMarkupStore.getState().markups[0].measurement?.value).toBeCloseTo(4.0, 3);

    // Deshacer limpieza de huecos
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups[0].cutouts?.length).toBe(3);

    // 8. deleteCutout: eliminar un hueco específico manteniendo los otros (Paridad Revu)
    // Inicialmente con 3 huecos, eliminamos el hueco en el índice 1
    useMarkupStore.getState().deleteCutout('area-cutout-1', 1, pageSize, calibration);
    expect(useMarkupStore.getState().markups[0].cutouts?.length).toBe(2);

    // Deshacer eliminación individual
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups[0].cutouts?.length).toBe(3);

    // Rehacer eliminación individual
    useMarkupStore.getState().redo();
    expect(useMarkupStore.getState().markups[0].cutouts?.length).toBe(2);
  });
});

