import {
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObject,
  PDFRef,
  PDFStream,
  PDFString,
} from 'pdf-lib';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import type { Markup } from '../../types/markup';
import type { ToolChestTool } from '../../types/toolChest';
import { BTX_TYPE_PREFIX, BtxItem, randomBtxName } from './btx';
import { BTX_PAGE_H, BTX_PAGE_W } from './btxRefine';

/**
 * De herramientas de REA a Tool Set de Revu (ADR-0101): cada herramienta se escribe como anotación en una hoja
 * temporal con el escritor de PDF de REA, se toma su diccionario, se coloca en el origen y se limpia de lo que Revu no
 * guarda en una herramienta (página, apariencia, autor, fechas).
 */

/** Tipo de anotación de Revu para cada tipo de marca de REA. */
const BTX_TYPE_OF: Partial<Record<Markup['type'], string>> = {
  freehand: 'AnnotationInk',
  highlightVector: 'AnnotationInk',
  highlight: 'AnnotationInk',
  line: 'AnnotationLine',
  length: 'AnnotationLine',
  dimension: 'AnnotationLine',
  rectangle: 'AnnotationSquare',
  circle: 'AnnotationCircle',
  polygon: 'AnnotationPolygon',
  cloud: 'AnnotationPolygon',
  cloudPlus: 'AnnotationPolygon',
  polyLine: 'AnnotationPolyLine',
  text: 'AnnotationFreeText',
  typewriter: 'AnnotationFreeText',
  callout: 'AnnotationFreeText',
  area: 'AnnotationMeasureArea',
  perimeter: 'AnnotationMeasurePerimeter',
  polylineMeasure: 'AnnotationMeasurePolylength',
  count: 'AnnotationMeasureCount',
  radius: 'AnnotationMeasureRadius',
  diameter: 'AnnotationMeasureDiameter',
  angle: 'AnnotationMeasureAngle',
};

/** Forma de muestra de las herramientas que no guardan puntos, en coordenadas normalizadas de la hoja temporal. */
function sampleShape(type: Markup['type']): { x: number; y: number }[] {
  switch (type) {
    case 'polygon':
    case 'cloud':
    case 'cloudPlus':
    case 'area':
    case 'perimeter':
      return [
        { x: 0.3, y: 0.4 },
        { x: 0.5, y: 0.4 },
        { x: 0.5, y: 0.5 },
        { x: 0.3, y: 0.5 },
      ];
    case 'polyLine':
    case 'polylineMeasure':
      return [
        { x: 0.3, y: 0.4 },
        { x: 0.4, y: 0.45 },
        { x: 0.5, y: 0.4 },
      ];
    case 'angle':
      return [
        { x: 0.4, y: 0.4 },
        { x: 0.3, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ];
    case 'dimension':
      return [
        { x: 0.3, y: 0.45 },
        { x: 0.5, y: 0.45 },
        { x: 0.4, y: 0.4 },
      ];
    default:
      return [
        { x: 0.3, y: 0.4 },
        { x: 0.5, y: 0.45 },
      ];
  }
}

const COORD_KEYS = ['L', 'Vertices', 'InkList', 'CL', 'QuadPoints'];
const DROP_KEYS = ['Type', 'P', 'AP', 'Popup', 'Parent', 'NM', 'IRT', 'RT', 'M', 'CreationDate', 'T', 'StateModel', 'State', 'REA', 'Subj'];
/** Separación entre el dibujo y el borde del rectángulo de la herramienta, en pt. */
const BTX_INSET_PT = 6;

/** Serializa un objeto PDF en línea (las referencias se resuelven), con la sintaxis de los diccionarios de Revu. */
function serialize(obj: PDFObject | undefined, ctx: PDFContext, depth = 0): string {
  if (!obj || depth > 12) return 'null';
  if (obj instanceof PDFRef) return serialize(ctx.lookup(obj), ctx, depth + 1);
  if (obj instanceof PDFStream) return 'null';
  if (obj instanceof PDFDict) {
    return `<<${obj
      .entries()
      .map(([k, v]) => {
        const value = serialize(v, ctx, depth + 1);
        // Un número pegado al nombre se leería como parte de él: "/F 4", no "/F4"
        return `${k.toString()}${/^[\d.+-]/.test(value) ? ' ' : ''}${value}`;
      })
      .join('')}>>`;
  }
  if (obj instanceof PDFArray) return `[${obj.asArray().map((o) => serialize(o, ctx, depth + 1)).join(' ')}]`;
  if (obj instanceof PDFName || obj instanceof PDFNumber || obj instanceof PDFBool) return obj.toString();
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.toString();
  if (obj === PDFNull) return 'null';
  return 'null';
}

const numsOf = (arr: PDFObject | undefined): number[] =>
  arr instanceof PDFArray ? arr.asArray().map((o) => (o instanceof PDFNumber ? o.asNumber() : 0)) : [];

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Mueve las coordenadas de la anotación para que su rectángulo empiece en el origen, como las de Revu. */
function relocate(dict: PDFDict, inset: number): { x: number; y: number } {
  const rect = numsOf(dict.get(PDFName.of('Rect')));
  if (rect.length < 4) return { x: 0, y: 0 };
  const dx = inset - Math.min(rect[0], rect[2]);
  const dy = inset - Math.min(rect[1], rect[3]);
  const move = (a: PDFArray) => {
    a.asArray().forEach((o, i) => {
      if (o instanceof PDFArray) move(o);
      else if (o instanceof PDFNumber) a.set(i, PDFNumber.of(round5(o.asNumber() + (i % 2 === 0 ? dx : dy))));
    });
  };
  for (const key of COORD_KEYS) {
    const v = dict.get(PDFName.of(key));
    if (v instanceof PDFArray) move(v);
  }
  const w = Math.abs(rect[2] - rect[0]) + 2 * inset;
  const h = Math.abs(rect[3] - rect[1]) + 2 * inset;
  dict.set(PDFName.of('Rect'), dict.context.obj([0, 0, round5(w), round5(h)]));
  return { x: inset, y: inset };
}

export interface BtxExportResult {
  items: BtxItem[];
  skipped: { name: string; reason: string }[];
}

/** Convierte las herramientas de una paleta de REA en las de un Tool Set de Revu. */
export async function toolsToBtxItems(tools: ToolChestTool[]): Promise<BtxExportResult> {
  const items: BtxItem[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const supported = tools.filter((t) => {
    if (BTX_TYPE_OF[t.type]) return true;
    skipped.push({ name: t.name, reason: `REA "${t.type}" tools have no Revu equivalent.` });
    return false;
  });
  if (supported.length === 0) return { items, skipped };

  const blank = await PDFDocument.create();
  blank.addPage([BTX_PAGE_W, BTX_PAGE_H]);
  const now = new Date().toISOString();
  const markups: Markup[] = supported.map((t, i) => ({
    id: `tool-${i}`,
    type: t.type,
    pageIndex: 0,
    points: t.points && t.points.length >= 2 ? t.points.map((p) => ({ ...p })) : sampleShape(t.type),
    style: { ...t.style },
    text: t.text,
    textFormat: t.textFormat,
    subject: t.subject || t.name,
    layer: t.layer,
    unitPrice: t.unitPrice,
    customFields: t.customFields ? { ...t.customFields } : undefined,
    measurement: t.measurement,
    ...(t.type === 'callout' ? { leaders: [[{ x: 0.2, y: 0.5 }]] } : {}),
    author: 'REA',
    createdAt: now,
    updatedAt: now,
    status: 'pending' as const,
  }));
  const saved = await saveIncrementalMarkups(await blank.save(), markups);
  const doc = await PDFDocument.load(saved);
  const annots = doc.getPage(0).node.Annots();
  const byId = new Map<string, PDFDict>();
  for (let i = 0; annots && i < annots.size(); i++) {
    const d = annots.lookup(i, PDFDict);
    const nm = d.get(PDFName.of('NM'));
    if (nm instanceof PDFString || nm instanceof PDFHexString) byId.set(nm.decodeText(), d);
  }
  supported.forEach((tool, i) => {
    const dict = byId.get(`tool-${i}`);
    if (!dict) {
      skipped.push({ name: tool.name, reason: 'The annotation could not be written.' });
      return;
    }
    const { x, y } = relocate(dict, BTX_INSET_PT);
    for (const k of DROP_KEYS) dict.delete(PDFName.of(k));
    // El nombre de la herramienta es el /Subj, como en Revu
    dict.set(PDFName.of('Subj'), PDFString.of(tool.subject || tool.name));
    dict.set(PDFName.of('F'), PDFNumber.of(4));
    items.push({
      name: randomBtxName(),
      type: BTX_TYPE_PREFIX + BTX_TYPE_OF[tool.type]!,
      dict: serialize(dict, doc.context),
      x,
      y,
      index: i,
      mode: tool.mode,
    });
  });
  return { items, skipped };
}
