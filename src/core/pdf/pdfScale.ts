import { PDFArray, PDFDict, PDFName, PDFNumber, PDFString, PDFHexString } from 'pdf-lib';
import { MeasurementUnit, PageCalibration, VALID_MEASUREMENT_UNITS } from '../../types/markup';
import { describeCalibration } from '../measurements/scale';

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

/** Diccionario /VP (array con un viewport de página completa) para la calibración dada. */
export function viewportArrayFor(
  calibration: PageCalibration,
  pageBox: [number, number, number, number],
  rotation: 0 | 90 | 180 | 270
): string {
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
  const reaJson = JSON.stringify(calibration);
  return `[<< /Type /Viewport /Name ${escapeLiteral(REA_VP_NAME)} /BBox [${pageBox.map((n) => n.toFixed(2)).join(' ')}] /Measure << /Type /Measure /Subtype /RL /R ${escapeLiteral(
    describeCalibration(calibration)
  )} /X ${xFormats}${yEntry} /D [${numberFormat(isFtIn ? 'ft' : unit, 1, den)}] /A [${numberFormat(
    areaUnit,
    1,
    den
  )}] >> /REACal ${escapeLiteral(reaJson)} >>]`;
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
      const x = measure.lookup(PDFName.of('X'));
      const first = x instanceof PDFArray ? x.lookup(0) : null;
      if (!(first instanceof PDFDict)) continue;
      const c = first.lookup(PDFName.of('C'));
      const unit = normalizeUnit(text(first.lookup(PDFName.of('U'))));
      if (!(c instanceof PDFNumber) || !unit || !(c.asNumber() > 0)) continue;
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
      cal = {
        scale: sx,
        ...(sy !== undefined ? { scaleY: sy } : {}),
        unit,
        precision: 2,
        ...(isFtIn ? { format: 'ftin' as const, fractionDenominator: 16 } : {}),
      };
    }
    if (cal && (!best || area > best.area)) best = { cal, area };
  }
  return best?.cal ?? null;
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
