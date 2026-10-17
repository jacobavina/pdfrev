import { PDFArray, PDFDict, PDFName, PDFNumber, PDFString, PDFHexString } from 'pdf-lib';
import { MeasurementUnit, PageCalibration, MeasurementViewport, VALID_MEASUREMENT_UNITS } from '../../types/markup';
import { describeCalibration } from '../measurements/scale';
import { normalizedToPdfCoordinates, pdfToNormalizedCoordinates, PageTransformInfo } from './operators';

/**
 * Escala de página en el PDF (ADR-0025, ISO 32000-1 §12.9): diccionario /VP (viewport) con /Measure /RL, el mismo
 * que escriben Revu y Acrobat al calibrar. /X[0]/C es el factor "unidades por punto" de la unidad /U. REA añade
 * /REACal con su calibración completa (pies-pulgadas, fracciones, escala Y, preset) para una ida y vuelta exacta.
 */

const REA_VP_NAME = 'REA Scale';

const escapeLiteral = (s: string) => `(${s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;

function numberFormat(unit: string, factor: number, denominator: number, fraction = false): string {
  return `<< /Type /NumberFormat /U ${escapeLiteral(unit)} /C ${factor.toPrecision(10)} /D ${denominator}${
    fraction ? ' /F /F' : ''
  } /RT () /SS () >>`;
}

/**
 * Diccionario /Measure /RL de una calibración (ISO 32000-1 §12.9.2). Lo usan el viewport de la página y cada
 * medición (ADR-0030), que así lleva su propia escala como las de Revu y Acrobat.
 */
export function measureDictFor(calibration: PageCalibration, rotation: 0 | 90 | 180 | 270): string {
  const sx = calibration.scale;
  const sy = calibration.scaleY ?? calibration.scale;
  // En páginas giradas 90/270 el eje X de la vista es el eje Y del PDF
  const [pdfX, pdfY] = rotation === 90 || rotation === 270 ? [sy, sx] : [sx, sy];
  const unit = calibration.unit;
  const isFtIn = calibration.format === 'ftin' && unit === 'ft';
  const den = calibration.fractionDenominator ?? 10 ** (calibration.precision ?? 2);
  const xFormats = isFtIn
    ? `[${numberFormat('ft', pdfX, 1)} ${numberFormat('in', 12, calibration.fractionDenominator ?? 16, true)}]`
    : `[${numberFormat(unit, pdfX, den, calibration.format === 'fraction')}]`;
  const yEntry =
    Math.abs(pdfY - pdfX) > 1e-12 ? ` /Y [${numberFormat(isFtIn ? 'ft' : unit, pdfY / pdfX, den)}]` : '';
  const areaUnit = isFtIn ? 'sq ft' : `sq ${unit}`;
  return `<< /Type /Measure /Subtype /RL /R ${escapeLiteral(describeCalibration(calibration))} /X ${xFormats}${yEntry} /D [${numberFormat(
    isFtIn ? 'ft' : unit,
    1,
    den
  )}] /A [${numberFormat(areaUnit, 1, den)}] >>`;
}

/**
 * Convierte un rectángulo normalizado [x, y, w, h] al BBox nativo de PDF [minX, minY, maxX, maxY].
 */
export function normalizedBoundsToPdfBBox(
  bounds: { x: number; y: number; width: number; height: number },
  pageBox: [number, number, number, number],
  rotation: 0 | 90 | 180 | 270
): [number, number, number, number] {
  const [origX, origY, maxX, maxY] = pageBox;
  const pageW = maxX - origX;
  const pageH = maxY - origY;

  const transform: PageTransformInfo = {
    rotation,
    widthPt: pageW,
    heightPt: pageH,
    originX: origX,
    originY: origY,
  };

  const p1 = normalizedToPdfCoordinates({ x: bounds.x, y: bounds.y }, transform);
  const p2 = normalizedToPdfCoordinates({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, transform);

  return [
    Math.min(p1.x, p2.x),
    Math.min(p1.y, p2.y),
    Math.max(p1.x, p2.x),
    Math.max(p1.y, p2.y),
  ];
}

/**
 * Convierte un BBox nativo de PDF [minX, minY, maxX, maxY] a coordenadas normalizadas [x, y, width, height].
 */
export function pdfBBoxToNormalizedBounds(
  bbox: [number, number, number, number],
  pageBox: [number, number, number, number],
  rotation: 0 | 90 | 180 | 270
): { x: number; y: number; width: number; height: number } {
  const [origX, origY, maxX, maxY] = pageBox;
  const pageW = maxX - origX;
  const pageH = maxY - origY;

  const transform: PageTransformInfo = {
    rotation,
    widthPt: pageW,
    heightPt: pageH,
    originX: origX,
    originY: origY,
  };

  const [minX, minY, pMaxX, pMaxY] = bbox;
  const c1 = pdfToNormalizedCoordinates({ x: minX, y: minY }, transform);
  const c2 = pdfToNormalizedCoordinates({ x: pMaxX, y: pMaxY }, transform);

  const uMin = Math.max(0, Math.min(c1.x, c2.x));
  const vMin = Math.max(0, Math.min(c1.y, c2.y));
  const uMax = Math.min(1, Math.max(c1.x, c2.x));
  const vMax = Math.min(1, Math.max(c1.y, c2.y));

  return {
    x: uMin,
    y: vMin,
    width: Math.max(0.001, uMax - uMin),
    height: Math.max(0.001, vMax - vMin),
  };
}

/** Diccionario /VP (array con un viewport de página completa y viewports regionales opcionales) para la calibración dada. */
export function viewportArrayFor(
  calibration: PageCalibration,
  pageBox: [number, number, number, number],
  rotation: 0 | 90 | 180 | 270,
  regionalViewports?: MeasurementViewport[]
): string {
  const reaJson = JSON.stringify(calibration);
  const mainVp = `<< /Type /Viewport /Name ${escapeLiteral(REA_VP_NAME)} /BBox [${pageBox
    .map((n) => n.toFixed(2))
    .join(' ')}] /Measure ${measureDictFor(calibration, rotation)} /REACal ${escapeLiteral(reaJson)} >>`;

  if (!regionalViewports || regionalViewports.length === 0) {
    return `[${mainVp}]`;
  }

  const extraVps = regionalViewports.map((vp) => {
    const bbox = normalizedBoundsToPdfBBox(vp.bounds, pageBox, rotation);
    const vpCalJson = JSON.stringify(vp.calibration);
    return `<< /Type /Viewport /Name ${escapeLiteral(vp.name || 'Viewport')} /BBox [${bbox
      .map((n) => n.toFixed(2))
      .join(' ')}] /Measure ${measureDictFor(
      vp.calibration,
      rotation
    )} /REACal ${escapeLiteral(vpCalJson)} /REAId ${escapeLiteral(vp.id)} /REABounds [${vp.bounds.x.toFixed(
      4
    )} ${vp.bounds.y.toFixed(4)} ${vp.bounds.width.toFixed(4)} ${vp.bounds.height.toFixed(4)}] >>`;
  });

  return `[${[mainVp, ...extraVps].join(' ')}]`;
}

function text(obj: unknown): string | undefined {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
  return undefined;
}

function normalizeUnit(u: string | undefined): MeasurementUnit | null {
  if (!u) return null;
  const t = u.trim().toLowerCase().replace(/\.$/, '');
  const map: Record<string, MeasurementUnit> = {
    mm: 'mm', millimeter: 'mm', millimeters: 'mm',
    cm: 'cm', centimeter: 'cm', centimeters: 'cm',
    m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
    in: 'in', inch: 'in', inches: 'in', '"': 'in',
    ft: 'ft', foot: 'ft', feet: 'ft', "'": 'ft',
  };
  return map[t] ?? ((VALID_MEASUREMENT_UNITS as readonly string[]).includes(t) ? (t as MeasurementUnit) : null);
}

function validCalibration(c: unknown): c is PageCalibration {
  if (!c || typeof c !== 'object') return false;
  const o = c as PageCalibration;
  return (
    Number.isFinite(o.scale) &&
    o.scale > 0 &&
    (VALID_MEASUREMENT_UNITS as readonly string[]).includes(o.unit) &&
    (o.scaleY === undefined || (Number.isFinite(o.scaleY) && o.scaleY > 0))
  );
}

/**
 * Calibración de una página a partir de su /VP: la de REA si está, o la de otro programa (Revu, Acrobat) leída de
 * /Measure. Si hay varios viewports se toma el de mayor superficie. null si la página no tiene escala.
 */
export function readPageCalibration(pageNode: PDFDict, rotation: 0 | 90 | 180 | 270): PageCalibration | null {
  const vp = pageNode.lookup(PDFName.of('VP'));
  if (!(vp instanceof PDFArray)) return null;
  let best: { cal: PageCalibration; area: number } | null = null;
  for (let i = 0; i < vp.size(); i++) {
    const v = vp.lookup(i);
    if (!(v instanceof PDFDict)) continue;
    let area = 0;
    const bbox = v.lookup(PDFName.of('BBox'));
    if (bbox instanceof PDFArray && bbox.size() === 4) {
      const n = [0, 1, 2, 3].map((k) => (bbox.lookup(k) instanceof PDFNumber ? (bbox.lookup(k) as PDFNumber).asNumber() : 0));
      area = Math.abs((n[2] - n[0]) * (n[3] - n[1]));
    }
    let cal: PageCalibration | null = null;
    const rea = text(v.lookup(PDFName.of('REACal')));
    if (rea) {
      try {
        const parsed = JSON.parse(rea);
        if (validCalibration(parsed)) cal = parsed;
      } catch {
        cal = null;
      }
    }
    if (!cal) {
      const measure = v.lookup(PDFName.of('Measure'));
      if (!(measure instanceof PDFDict)) continue;
      cal = calibrationFromMeasure(measure, rotation);
    }
    if (cal && (!best || area > best.area)) best = { cal, area };
  }
  return best?.cal ?? null;
}

/**
 * Calibración a partir de un diccionario /Measure /RL (de una página o de una medición de Revu/Acrobat):
 * /X[0]/C es el factor "unidades por punto" de la unidad /U. null si no se puede interpretar.
 */
export function calibrationFromMeasure(measure: PDFDict, rotation: 0 | 90 | 180 | 270): PageCalibration | null {
  const x = measure.lookup(PDFName.of('X'));
  const first = x instanceof PDFArray ? x.lookup(0) : null;
  if (!(first instanceof PDFDict)) return null;
  const c = first.lookup(PDFName.of('C'));
  const unit = normalizeUnit(text(first.lookup(PDFName.of('U'))));
  if (!(c instanceof PDFNumber) || !unit || !(c.asNumber() > 0)) return null;
  let scaleY: number | undefined;
  const y = measure.lookup(PDFName.of('Y'));
  const yFirst = y instanceof PDFArray ? y.lookup(0) : null;
  if (yFirst instanceof PDFDict) {
    const yc = yFirst.lookup(PDFName.of('C'));
    if (yc instanceof PDFNumber && yc.asNumber() > 0) scaleY = c.asNumber() * yc.asNumber();
  }
  let sx = c.asNumber();
  let sy = scaleY;
  if (sy !== undefined && (rotation === 90 || rotation === 270)) [sx, sy] = [sy, sx];
  // Compuesto pies + pulgadas (como lo escribe Acrobat/Revu): se presenta en pies-pulgadas
  const second = x instanceof PDFArray ? x.lookup(1) : null;
  const isFtIn = unit === 'ft' && second instanceof PDFDict && normalizeUnit(text(second.lookup(PDFName.of('U')))) === 'in';
  return {
    scale: sx,
    ...(sy !== undefined ? { scaleY: sy } : {}),
    unit,
    precision: 2,
    ...(isFtIn ? { format: 'ftin' as const, fractionDenominator: 16 } : {}),
  };
}

/** Escalas de todas las páginas de un PDF (las que tengan /VP con /Measure). */
export async function importPdfCalibrations(bytes: Uint8Array): Promise<Record<number, PageCalibration>> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out: Record<number, PageCalibration> = {};
  doc.getPages().forEach((page, i) => {
    const rot = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const cal = readPageCalibration(page.node, rot);
    if (cal) out[i] = cal;
  });
  return out;
}

/**
 * Lee los viewports de una página a partir de su /VP.
 * Devuelve la lista de viewports regionales (con exclusión del viewport global de página completa si no tiene id/nombre regional).
 */
export function readPageViewports(
  pageNode: PDFDict,
  rotation: 0 | 90 | 180 | 270,
  pageBox: [number, number, number, number],
  pageIndex = 0
): MeasurementViewport[] {
  const vp = pageNode.lookup(PDFName.of('VP'));
  if (!(vp instanceof PDFArray)) return [];
  const [origX, origY, maxX, maxY] = pageBox;
  const pageArea = Math.abs((maxX - origX) * (maxY - origY));

  const list: MeasurementViewport[] = [];
  for (let i = 0; i < vp.size(); i++) {
    const v = vp.lookup(i);
    if (!(v instanceof PDFDict)) continue;

    const vpName = text(v.lookup(PDFName.of('Name'))) ?? `Viewport ${i + 1}`;
    const bboxNode = v.lookup(PDFName.of('BBox'));
    let bboxPt: [number, number, number, number] | null = null;
    let areaPt = 0;
    if (bboxNode instanceof PDFArray && bboxNode.size() === 4) {
      const n = [0, 1, 2, 3].map((k) =>
        bboxNode.lookup(k) instanceof PDFNumber ? (bboxNode.lookup(k) as PDFNumber).asNumber() : 0
      );
      bboxPt = [n[0], n[1], n[2], n[3]];
      areaPt = Math.abs((n[2] - n[0]) * (n[3] - n[1]));
    }

    const reaId = text(v.lookup(PDFName.of('REAId')));
    const isFullPageRea = (vpName === REA_VP_NAME || !reaId) && areaPt >= pageArea * 0.95;
    if (isFullPageRea && i === 0 && vp.size() > 1) {
      continue;
    }

    let cal: PageCalibration | null = null;
    const rea = text(v.lookup(PDFName.of('REACal')));
    if (rea) {
      try {
        const parsed = JSON.parse(rea);
        if (validCalibration(parsed)) cal = parsed;
      } catch {
        cal = null;
      }
    }
    if (!cal) {
      const measure = v.lookup(PDFName.of('Measure'));
      if (measure instanceof PDFDict) {
        cal = calibrationFromMeasure(measure, rotation);
      }
    }
    if (!cal) continue;

    const id = reaId ?? `vp-${pageIndex}-${i}-${Date.now()}`;
    let bounds: { x: number; y: number; width: number; height: number };

    const reaBounds = v.lookup(PDFName.of('REABounds'));
    if (reaBounds instanceof PDFArray && reaBounds.size() === 4) {
      const bVals = [0, 1, 2, 3].map((k) =>
        reaBounds.lookup(k) instanceof PDFNumber ? (reaBounds.lookup(k) as PDFNumber).asNumber() : 0
      );
      bounds = { x: bVals[0], y: bVals[1], width: bVals[2], height: bVals[3] };
    } else if (bboxPt) {
      bounds = pdfBBoxToNormalizedBounds(bboxPt, pageBox, rotation);
    } else {
      bounds = { x: 0, y: 0, width: 1, height: 1 };
    }

    if (!isFullPageRea || reaId) {
      list.push({
        id,
        name: vpName,
        pageIndex,
        bounds,
        calibration: cal,
      });
    }
  }
  return list;
}

/** Lee todos los viewports regionales de todas las páginas del PDF. */
export async function importPdfViewports(bytes: Uint8Array): Promise<Record<number, MeasurementViewport[]>> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out: Record<number, MeasurementViewport[]> = {};
  doc.getPages().forEach((page, i) => {
    const rot = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const mb = page.getMediaBox();
    const vps = readPageViewports(page.node, rot, [mb.x, mb.y, mb.x + mb.width, mb.y + mb.height], i);
    if (vps.length > 0) out[i] = vps;
  });
  return out;
}

