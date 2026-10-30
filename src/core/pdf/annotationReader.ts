import { countMeasurement } from '../markup/countSymbols';
import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  PDFString,
  PDFHexString,
  PDFNumber,
  PDFRef,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import {
  Markup,
  MarkupPoint,
  MarkupReply,
  MarkupStatus,
  MarkupStatusTransition,
  MarkupType,
  LineEndingStyle,
} from '../../types/markup';
import { getPageTransformFromPdfLib, pdfToNormalizedCoordinates } from './operators';
import { calibrationFromMeasure, readPageCalibration } from './pdfScale';
import {
  DEFAULT_PAGE_CALIBRATION,
  calculateArea,
  calculateLength,
  calculatePerimeter,
  calculatePolylineLength,
  calculateAngle,
  calculateCount,
  calculateVolume,
} from '../measurements/calculate';
import { STAMPS, stampSubtitle } from '../markup/stamps';
import { translucentFill } from '../markup/typeLabels';

/** Mediciones cuyo valor se recalcula de la geometría del PDF si esta cambió fuera de REA (ADR-0030/0053). */
const RECOMPUTED_MEASURES = new Set<MarkupType>([
  'length',
  'polylineMeasure',
  'perimeter',
  'area',
  'volume',
  'angle',
  'radius',
  'diameter',
]);

export interface ImportAnnotationsResult {
  markups: Markup[];
  foreignUnsupportedCount: number;
  /** Adjuntos embebidos de las marcas de REA, por `attachmentKey` (ADR-0027). */
  attachments: Record<string, { name: string; mime: string; bytes: Uint8Array }>;
  /** Capas de marcas que el PDF trae apagadas en /OCProperties /D /OFF (ADR-0046/0053). */
  hiddenLayers?: string[];
}

/**
 * Extrae texto legible de un objeto de texto de pdf-lib (PDFString o PDFHexString).
 */
function extractPdfStringValue(obj: unknown): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    // decodeText resuelve escapes, PDFDocEncoding y UTF-16BE con BOM (acentos, ñ)
    return obj.decodeText();
  }
  return '';
}

/**
 * Decodifica un nombre PDF (`/Coste#20unitario` → `Coste unitario`): quita la barra y resuelve las
 * secuencias #xx como bytes UTF-8 (inverso de `toPdfName` del escritor).
 */
function decodePdfName(raw: string): string {
  const body = raw.replace(/^\//, '');
  if (!body.includes('#')) return body;
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '#' && /^[0-9A-Fa-f]{2}$/.test(body.slice(i + 1, i + 3))) {
      bytes.push(parseInt(body.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(body.charCodeAt(i) & 0xff);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Identificador estable de una anotación: su /NM o, si no tiene, su referencia de objeto.
 * Debe coincidir con `annotationKeyFor` del escritor incremental para no duplicar al guardar.
 */
function annotationIdFor(dict: PDFDict, ref: unknown, fallback: string): string {
  const nm = extractPdfStringValue(dict.get(PDFName.of('NM')));
  if (nm) return nm;
  if (ref instanceof PDFRef) return `pdfobj-${ref.objectNumber}-${ref.generationNumber}`;
  return fallback;
}

import { parsePdfDateToIso } from '../../utils/dateUtils';
export { parsePdfDateToIso };

/**
 * Resuelve la anotación raíz de una cadena /IRT (respuestas anidadas o estados de revisión encadenados),
 * ignorando relaciones de agrupación (/RT /Group).
 */
function resolveRootParentId(dict: PDFDict, pdfDoc: PDFDocument): string {
  let curDict: PDFDict = dict;
  let curRef: PDFRef | undefined;
  const visited = new Set<string>();
  for (let depth = 0; depth < 32; depth++) {
    const irt = curDict.get(PDFName.of('IRT'));
    const rt = curDict.get(PDFName.of('RT'));
    if (!(irt instanceof PDFRef) || rt?.toString() === '/Group') break;
    const key = `${irt.objectNumber}:${irt.generationNumber}`;
    if (visited.has(key)) break;
    visited.add(key);
    const parent = pdfDoc.context.lookup(irt);
    if (!(parent instanceof PDFDict)) break;
    curDict = parent;
    curRef = irt;
  }
  return curRef ? annotationIdFor(curDict, curRef, '') : '';
}

function rgb01ToHex(r01: number, g01: number, b01: number): string {
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(clamp(r01))}${toHex(clamp(g01))}${toHex(clamp(b01))}`;
}

/**
 * Convierte un array de color PDF (DeviceGray [g], DeviceRGB [r, g, b] o DeviceCMYK [c, m, y, k]) a #rrggbb.
 */
function pdfColorArrayToHex(arr: unknown): string | undefined {
  if (!(arr instanceof PDFArray)) return undefined;
  const nums: number[] = [];
  for (let i = 0; i < arr.size(); i++) {
    const v = arr.get(i);
    if (!(v instanceof PDFNumber) || !Number.isFinite(v.asNumber())) return undefined;
    nums.push(v.asNumber());
  }
  if (nums.length === 1) {
    return rgb01ToHex(nums[0], nums[0], nums[0]);
  }
  if (nums.length === 3) {
    return rgb01ToHex(nums[0], nums[1], nums[2]);
  }
  if (nums.length === 4) {
    const [c, m, y, k] = nums.map((v) => Math.max(0, Math.min(1, v)));
    return rgb01ToHex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
  }
  return undefined;
}

function isCloudyAnnotation(annotDict: PDFDict, intent: string): boolean {
  if (intent === 'PolygonCloud') return true;
  const beObj = annotDict.lookup(PDFName.of('BE'));
  if (beObj instanceof PDFDict) {
    const sObj = beObj.get(PDFName.of('S'));
    if (sObj instanceof PDFName && sObj.asString() === '/C') return true;
  }
  return false;
}

function decodePdfStreamText(raw: string): string {
  return raw
    .replace(/\\([nrtbf()\\])/g, (_, ch: string) => {
      if (ch === 'n') return '\n';
      if (ch === 'r') return '\r';
      if (ch === 't') return '\t';
      return ch;
    })
    .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function extractForeignStampApInfo(annotDict: PDFDict): { texts: string[]; color?: string; hasStream: boolean } {
  const texts: string[] = [];
  let color: string | undefined;
  let fallbackColor: string | undefined;
  let hasStream = false;
  try {
    const apDict = annotDict.lookup(PDFName.of('AP'));
    const nObj = apDict instanceof PDFDict ? apDict.lookup(PDFName.of('N')) : null;
    const streams: PDFRawStream[] = [];
    if (nObj instanceof PDFRawStream) {
      streams.push(nObj);
    } else if (nObj instanceof PDFDict) {
      for (const [, val] of nObj.entries()) {
        const resolved = annotDict.context.lookup(val);
        if (resolved instanceof PDFRawStream) streams.push(resolved);
      }
    }
    for (let sIdx = 0; sIdx < streams.length; sIdx++) {
      const st = streams[sIdx];
      hasStream = true;
      const res = st.dict.lookup(PDFName.of('Resources'));
      const xobj = res instanceof PDFDict ? res.lookup(PDFName.of('XObject')) : null;
      if (xobj instanceof PDFDict && streams.length < 6) {
        for (const [, subRef] of xobj.entries()) {
          const sub = annotDict.context.lookup(subRef);
          if (sub instanceof PDFRawStream && sub.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') {
            streams.push(sub);
          }
        }
      }
      const ops = new TextDecoder('latin1').decode(decodePDFRawStream(st).decode());
      const tjRe = /\(((?:\\.|[^\\()])*)\)\s*Tj\b/g;
      let m: RegExpExecArray | null;
      while ((m = tjRe.exec(ops)) !== null) {
        const t = decodePdfStreamText(m[1]).trim();
        if (t && !texts.includes(t)) texts.push(t);
      }
      const tjArrRe = /\[((?:[^\]]|\n)*?)\]\s*TJ\b/g;
      while ((m = tjArrRe.exec(ops)) !== null) {
        const inner = m[1];
        const parts: string[] = [];
        const partRe = /\(((?:\\.|[^\\()])*)\)/g;
        let pm: RegExpExecArray | null;
        while ((pm = partRe.exec(inner)) !== null) {
          parts.push(decodePdfStreamText(pm[1]));
        }
        const joined = parts.join('').trim();
        if (joined && !texts.includes(joined)) texts.push(joined);
      }
      const rgbRe = /(?:^|\s)(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(?:RG|rg)\b/gm;
      while ((m = rgbRe.exec(ops)) !== null) {
        const r = Number(m[1]);
        const g = Number(m[2]);
        const b = Number(m[3]);
        const isWhite = r > 0.94 && g > 0.94 && b > 0.94;
        const isBlack = r < 0.08 && g < 0.08 && b < 0.08;
        if (!isWhite && !isBlack && !color) color = rgb01ToHex(r, g, b);
        else if (!isWhite && !fallbackColor) fallbackColor = rgb01ToHex(r, g, b);
      }
      const cmykRe = /(?:^|\s)(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(?:K|k)\b/gm;
      while ((m = cmykRe.exec(ops)) !== null) {
        const ck = Math.max(0, Math.min(1, Number(m[1])));
        const my = Math.max(0, Math.min(1, Number(m[2])));
        const yk = Math.max(0, Math.min(1, Number(m[3])));
        const kk = Math.max(0, Math.min(1, Number(m[4])));
        const hex = rgb01ToHex((1 - ck) * (1 - kk), (1 - my) * (1 - kk), (1 - yk) * (1 - kk));
        if (!color) color = hex;
      }
      const grayRe = /(?:^|\s)(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(?:G|g)\b/gm;
      while ((m = grayRe.exec(ops)) !== null) {
        const gr = Number(m[1]);
        if (gr > 0.08 && gr < 0.94 && !color) color = rgb01ToHex(gr, gr, gr);
      }
    }
  } catch {
    // Si un stream externo usa un filtro no estándar, degradar limpiamente a metadatos del diccionario
  }
  return { texts, color: color ?? fallbackColor, hasStream };
}

function humanizePdfStampName(rawName: string): string {
  const cleaned = rawName
    .replace(/^[#/]+/, '')
    .replace(/^(SB|SH|Revu|FX|Std|Dyn)/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return cleaned || 'STAMP';
}

function parsePdfTextAppearance(daStr: string, dsStr: string): {
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
} {
  const out: {
    fontSize?: number;
    fontFamily?: string;
    textColor?: string;
    bold?: boolean;
    italic?: boolean;
    align?: 'left' | 'center' | 'right';
  } = {};

  const tfMatch = /(?:\s|^)\/([^\s/]+)\s+([\d.]+)\s+Tf\b/.exec(daStr) ?? /([\d.]+)\s+Tf\b/.exec(daStr);
  let fontToken = '';
  if (tfMatch) {
    if (tfMatch.length >= 3) {
      fontToken = tfMatch[1];
      const sz = Number(tfMatch[2]);
      if (sz > 0) out.fontSize = sz;
    } else {
      const sz = Number(tfMatch[1]);
      if (sz > 0) out.fontSize = sz;
    }
  }
  if (!out.fontSize && dsStr) {
    const dsSize = /font-size\s*:\s*([\d.]+)/i.exec(dsStr) ?? /font\s*:[^;]*?\b([\d.]+)\s*pt\b/i.exec(dsStr);
    if (dsSize && Number(dsSize[1]) > 0) out.fontSize = Number(dsSize[1]);
  }

  const dsFont = /font-family\s*:\s*([^;]+)/i.exec(dsStr)?.[1] ?? /font\s*:([^;]+)/i.exec(dsStr)?.[1] ?? '';
  const combinedFont = `${fontToken} ${dsFont}`.toLowerCase();
  if (combinedFont.trim()) {
    if (/cour|mono|consolas/.test(combinedFont)) out.fontFamily = 'Courier';
    else if (/tiro|times|serif|georgia/.test(combinedFont)) out.fontFamily = 'Times';
    else if (/helv|arial|sans|hebo|heob/.test(combinedFont)) out.fontFamily = 'Helvetica';
  }
  if (/bold|bo\b|-bd/i.test(fontToken) || /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(dsStr) || /font\s*:[^;]*\bbold\b/i.test(dsStr)) {
    out.bold = true;
  }
  if (
    /italic|oblique|it\b|ob\b/i.test(fontToken) ||
    /font-style\s*:\s*(?:italic|oblique)/i.test(dsStr) ||
    /font\s*:[^;]*\b(?:italic|oblique)\b/i.test(dsStr)
  ) {
    out.italic = true;
  }

  const rgbMatch = /(?:^|\s)([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(?:rg|RG)\b/.exec(daStr);
  const cmykMatch = /(?:^|\s)([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(?:k|K)\b/.exec(daStr);
  const grayMatch = /(?:^|\s)([\d.]+)\s+(?:g|G)\b/.exec(daStr);
  if (rgbMatch) {
    out.textColor = rgb01ToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  } else if (cmykMatch) {
    const [c, m, y, k] = [1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, Number(cmykMatch[i]))));
    out.textColor = rgb01ToHex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
  } else if (grayMatch) {
    const g = Number(grayMatch[1]);
    out.textColor = rgb01ToHex(g, g, g);
  } else if (dsStr) {
    const dsColor = /(?:^|;|\s)color\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/i.exec(dsStr);
    if (dsColor) out.textColor = dsColor[1];
  }

  if (dsStr) {
    const dsAlign = /text-align\s*:\s*(left|center|right)/i.exec(dsStr);
    if (dsAlign) out.align = dsAlign[1].toLowerCase() as 'left' | 'center' | 'right';
  }

  return out;
}

/**
 * Importa y analiza las anotaciones PDF estándar de un archivo conforme a ISO 32000-1 y el esquema /REA.
 */
export async function importPdfAnnotations(
  pdfBytes: Uint8Array
): Promise<ImportAnnotationsResult> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const markups: Markup[] = [];
  let foreignUnsupportedCount = 0;
  const attachments: ImportAnnotationsResult['attachments'] = {};

  // Mapas para vincular estados de revisión (/StateModel Review) y respuestas (/IRT /RT /R) con su anotación raíz
  const reviewTransitionsByParentId = new Map<
    string,
    Array<MarkupStatusTransition & { order: number }>
  >();
  const repliesByParentId = new Map<string, Array<MarkupReply & { order: number }>>();

  // Primer pase: procesar todas las páginas
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const annotsObj = page.node.Annots();
    if (!(annotsObj instanceof PDFArray)) continue;

    const transform = getPageTransformFromPdfLib(page);
    const pageCalibration = readPageCalibration(page.node, transform.rotation);
    const isRotated = transform.rotation === 90 || transform.rotation === 270;
    const visualDims = {
      width: isRotated ? transform.heightPt : transform.widthPt,
      height: isRotated ? transform.widthPt : transform.heightPt,
    };

    for (let aIdx = 0; aIdx < annotsObj.size(); aIdx++) {
      const annotRefOrDict = annotsObj.get(aIdx);
      const annotDict =
        annotRefOrDict instanceof PDFRef
          ? pdfDoc.context.lookup(annotRefOrDict)
          : annotRefOrDict;

      if (!(annotDict instanceof PDFDict)) continue;

      const subtypeNameObj = annotDict.get(PDFName.of('Subtype'));
      const subtype = subtypeNameObj instanceof PDFName ? subtypeNameObj.asString().replace(/^\//, '') : '';

      // Identificar si es una anotación hija de estado de revisión (/StateModel Review / Marked)
      const stateModelObj = annotDict.get(PDFName.of('StateModel'));
      if (stateModelObj) {
        const stateModelStr = extractPdfStringValue(stateModelObj);
        if (stateModelStr.toLowerCase() === 'review') {
          const stateObj = annotDict.get(PDFName.of('State'));
          const stateStr = extractPdfStringValue(stateObj).toLowerCase();
          const parentId = resolveRootParentId(annotDict, pdfDoc);

          if (parentId) {
            let mappedStatus: MarkupStatus | undefined;
            if (stateStr === 'none') mappedStatus = 'pending';
            else if (stateStr === 'accepted') mappedStatus = 'accepted';
            else if (stateStr === 'rejected') mappedStatus = 'rejected';
            else if (stateStr === 'completed') mappedStatus = 'completed';
            else if (stateStr === 'cancelled') mappedStatus = 'cancelled';

            if (mappedStatus) {
              const rawDate =
                extractPdfStringValue(annotDict.get(PDFName.of('M'))) ||
                extractPdfStringValue(annotDict.get(PDFName.of('CreationDate')));
              const createdAt = parsePdfDateToIso(rawDate, new Date().toISOString());
              const stateAuthor =
                extractPdfStringValue(annotDict.get(PDFName.of('T'))) || 'External author';
              const list = reviewTransitionsByParentId.get(parentId) || [];
              list.push({
                status: mappedStatus,
                author: stateAuthor,
                createdAt,
                order: aIdx,
              });
              reviewTransitionsByParentId.set(parentId, list);
            }
          }
          continue; // Las anotaciones de estado no se agregan como marcas gráficas independientes
        }
        if (stateModelStr.toLowerCase() === 'marked') {
          continue;
        }
      }

      // Identificar si es una anotación hija de respuesta en hilo (/IRT con /RT /R o /RT ausente)
      const irtObj = annotDict.get(PDFName.of('IRT'));
      const rtObj = annotDict.get(PDFName.of('RT'));
      if (irtObj instanceof PDFRef && rtObj?.toString() !== '/Group') {
        const parentId = resolveRootParentId(annotDict, pdfDoc);
        if (parentId) {
          const replyId = annotationIdFor(
            annotDict,
            annotRefOrDict,
            `reply-${pageIdx}-${aIdx}`
          );
          const replyAuthor =
            extractPdfStringValue(annotDict.get(PDFName.of('T'))) || 'External author';
          const replyText = extractPdfStringValue(annotDict.get(PDFName.of('Contents')));
          const nowIso = new Date().toISOString();
          const rawCreation = extractPdfStringValue(annotDict.get(PDFName.of('CreationDate')));
          const rawMod = extractPdfStringValue(annotDict.get(PDFName.of('M')));
          const createdAt = parsePdfDateToIso(rawCreation || rawMod, nowIso);
          const updatedAt = parsePdfDateToIso(rawMod || rawCreation, createdAt);
          const list = repliesByParentId.get(parentId) || [];
          list.push({
            id: replyId,
            author: replyAuthor,
            text: replyText,
            createdAt,
            updatedAt,
            order: aIdx,
          });
          repliesByParentId.set(parentId, list);
          continue;
        }
      }

      // Metadatos REA
      const reaObj = annotDict.get(PDFName.of('REA'));
      const isRea = reaObj instanceof PDFDict;

      // Identificador único (/NM) o generado
      const id = annotationIdFor(annotDict, annotRefOrDict, `foreign-${pageIdx}-${aIdx}`);

      // Contenido y autor
      const contentsObj = annotDict.get(PDFName.of('Contents'));
      let text = extractPdfStringValue(contentsObj);

      const authorObj = annotDict.get(PDFName.of('T'));
      const author = extractPdfStringValue(authorObj) || 'External author';

      // Asunto (/Subj) y costes (B.3, ADR-0077)
      const subjObj = annotDict.get(PDFName.of('Subj'));
      let subject = extractPdfStringValue(subjObj);
      let unitPrice: number | undefined;
      let cost: number | undefined;

      // Filtrar artefactos del sistema de AutoCAD SHX Text (ADR-0137)
      const normAuthor = author.trim().toLowerCase();
      const normSubj = subject.trim().toLowerCase();
      if (
        !isRea &&
        (normAuthor === 'autocad shx text' || normSubj === 'autocad shx text')
      ) {
        continue;
      }

      // Filtrar anotaciones no-REA con banderas /F invisibles (Hidden = 2, NoView = 32)
      const flagsObj = annotDict.get(PDFName.of('F'));
      const flags = flagsObj instanceof PDFNumber ? flagsObj.asNumber() : 0;
      if (!isRea && ((flags & 2) !== 0 || (flags & 32) !== 0)) {
        continue;
      }

      // Colores y grosor
      let strokeColor = pdfColorArrayToHex(annotDict.lookup(PDFName.of('C'))) || '#000000';
      let fillColor = pdfColorArrayToHex(annotDict.lookup(PDFName.of('IC')));

      let strokeWidth = 1;
      let dashArray: number[] | undefined;
      const bsObj = annotDict.get(PDFName.of('BS'));
      if (bsObj instanceof PDFDict) {
        const wObj = bsObj.get(PDFName.of('W'));
        if (wObj instanceof PDFNumber) strokeWidth = wObj.asNumber();
        // Borde discontinuo (/S /D) con su patrón /D (ADR-0018)
        const sObj = bsObj.get(PDFName.of('S'));
        const dObj = bsObj.get(PDFName.of('D'));
        if (sObj instanceof PDFName && sObj.asString() === '/D' && dObj instanceof PDFArray) {
          const values: number[] = [];
          for (let i = 0; i < dObj.size(); i++) {
            const v = dObj.get(i);
            if (v instanceof PDFNumber && Number.isFinite(v.asNumber()) && v.asNumber() > 0) values.push(v.asNumber());
          }
          if (values.length > 0) dashArray = values;
        }
      } else {
        const borderObj = annotDict.get(PDFName.of('Border'));
        if (borderObj instanceof PDFArray && borderObj.size() >= 3) {
          const bw = borderObj.get(2);
          if (bw instanceof PDFNumber) strokeWidth = bw.asNumber();
        }
      }

      if (!isRea && (subtype === 'Square' || subtype === 'Circle') && strokeWidth <= 0 && !fillColor) {
        continue;
      }

      // Fechas
      const rawMod = extractPdfStringValue(annotDict.get(PDFName.of('M')));
      const rawCreation = extractPdfStringValue(annotDict.get(PDFName.of('CreationDate')));
      const nowIso = new Date().toISOString();
      let createdAt = parsePdfDateToIso(rawCreation || rawMod, nowIso);
      let updatedAt = parsePdfDateToIso(rawMod || rawCreation, createdAt);

      // Puntos y Geometría
      const points: MarkupPoint[] = [];
      let markupType: MarkupType = 'rectangle';
      const customFields: Record<string, string | number> = {};

      if (isRea && reaObj instanceof PDFDict) {
        const reaCreated = extractPdfStringValue(reaObj.get(PDFName.of('createdAt')));
        const reaUpdated = extractPdfStringValue(reaObj.get(PDFName.of('updatedAt')));
        if (reaCreated) createdAt = parsePdfDateToIso(reaCreated, createdAt);
        if (reaUpdated) updatedAt = parsePdfDateToIso(reaUpdated, updatedAt);

        const toolObj = reaObj.get(PDFName.of('tool'));
        if (toolObj) {
          const toolStr = extractPdfStringValue(toolObj);
          if (toolStr) markupType = toolStr as MarkupType;
        }
        const arcStepObj = reaObj.get(PDFName.of('arcStep'));
        if (arcStepObj instanceof PDFNumber) {
          customFields.arcStep = arcStepObj.asNumber();
        }
        const fieldsObj = reaObj.get(PDFName.of('fields'));
        if (fieldsObj instanceof PDFDict) {
          for (const [k, v] of fieldsObj.entries()) {
            const keyStr = decodePdfName(k.asString());
            if (keyStr === 'arcStep' && typeof customFields.arcStep === 'number') {
              continue;
            }
            customFields[keyStr] = v instanceof PDFNumber ? v.asNumber() : extractPdfStringValue(v);
          }
        }
      }

      let measurement: Markup['measurement'];
      if (isRea && reaObj instanceof PDFDict) {
        const measObj = reaObj.get(PDFName.of('measurement'));
        if (measObj instanceof PDFDict) {
          const valObj = measObj.get(PDFName.of('value'));
          const unitVal = extractPdfStringValue(measObj.get(PDFName.of('unit')));
          const fmtVal = extractPdfStringValue(measObj.get(PDFName.of('formatted')));
          const perimObj = measObj.get(PDFName.of('perimeter'));
          const cntObj = measObj.get(PDFName.of('countIndex'));

          const numVal = valObj instanceof PDFNumber ? valObj.asNumber() : 0;
          if (unitVal && fmtVal) {
            measurement = {
              value: numVal,
              unit: unitVal as any,
              formatted: fmtVal,
              ...(perimObj instanceof PDFNumber ? { perimeter: perimObj.asNumber() } : {}),
              ...(cntObj instanceof PDFNumber ? { countIndex: cntObj.asNumber() } : {}),
            };
          }
        }
        const reaSubj = reaObj.get(PDFName.of('subject'));
        if (reaSubj) {
          const s = extractPdfStringValue(reaSubj);
          if (s) subject = s;
        }
        const pObj = reaObj.get(PDFName.of('unitPrice'));
        if (pObj instanceof PDFNumber && Number.isFinite(pObj.asNumber())) {
          unitPrice = pObj.asNumber();
        }
        const cObj = reaObj.get(PDFName.of('cost'));
        if (cObj instanceof PDFNumber && Number.isFinite(cObj.asNumber())) {
          cost = cObj.asNumber();
        }
      }

      // Reconstruir puntos según /Subtype
      const rectObj = annotDict.get(PDFName.of('Rect'));
      if (rectObj instanceof PDFArray && rectObj.size() >= 4) {
        const r0 = rectObj.get(0);
        const r1 = rectObj.get(1);
        const r2 = rectObj.get(2);
        const r3 = rectObj.get(3);
        if (
          r0 instanceof PDFNumber &&
          r1 instanceof PDFNumber &&
          r2 instanceof PDFNumber &&
          r3 instanceof PDFNumber
        ) {
          const minX = r0.asNumber();
          const minY = r1.asNumber();
          const maxX = r2.asNumber();
          const maxY = r3.asNumber();

          const pt1 = pdfToNormalizedCoordinates({ x: minX, y: maxY }, transform);
          const pt2 = pdfToNormalizedCoordinates({ x: maxX, y: minY }, transform);
          points.push(pt1, pt2);
        }
      }

      const itObj = annotDict.get(PDFName.of('IT'));
      const intent = itObj instanceof PDFName ? itObj.asString().replace(/^\//, '') : '';
      const measureObj = annotDict.lookup(PDFName.of('Measure'));

      if (subtype === 'Line') {
        // Las marcas de REA conservan su tipo (longitud, cota); una /Line ajena con /LL es una cota y una
        // /LineDimension con /Measure sin /LL, una medición de distancia (Acrobat/Revu)
        const llObj = annotDict.get(PDFName.of('LL'));
        const ll = llObj instanceof PDFNumber ? llObj.asNumber() : 0;
        if (!isRea) {
          // Con /Measure es una medición de Acrobat/Revu (con o sin líneas de referencia, ADR-0033)
          markupType =
            intent === 'LineDimension' && measureObj instanceof PDFDict
              ? 'length'
              : Math.abs(ll) > 1e-6
                ? 'dimension'
                : 'line';
          // Dónde pone el valor el otro programa (/CP): dentro (por defecto) o encima de la línea (ADR-0032)
          const cp = annotDict.get(PDFName.of('CP'));
          if (markupType === 'length' && cp instanceof PDFName && cp.asString() === '/Top') customFields.captionStyle = 'top';
        }
        // Texto desplazado respecto de su sitio normal (/CO: a lo largo de la línea y perpendicular, ADR-0097)
        const coObj = annotDict.get(PDFName.of('CO'));
        if ((markupType === 'length' || markupType === 'dimension') && coObj instanceof PDFArray && coObj.size() >= 2) {
          const along = coObj.get(0);
          const up = coObj.get(1);
          if (along instanceof PDFNumber && Math.abs(along.asNumber()) > 1e-6) customFields.captionOffsetX = along.asNumber();
          if (up instanceof PDFNumber && Math.abs(up.asNumber()) > 1e-6) customFields.captionOffsetY = up.asNumber();
        }
        const lObj = annotDict.get(PDFName.of('L'));
        if (lObj instanceof PDFArray && lObj.size() >= 4) {
          const lx1 = lObj.get(0);
          const ly1 = lObj.get(1);
          const lx2 = lObj.get(2);
          const ly2 = lObj.get(3);
          if (
            lx1 instanceof PDFNumber &&
            ly1 instanceof PDFNumber &&
            lx2 instanceof PDFNumber &&
            ly2 instanceof PDFNumber
          ) {
            points.length = 0;
            points.push(
              pdfToNormalizedCoordinates({ x: lx1.asNumber(), y: ly1.asNumber() }, transform),
              pdfToNormalizedCoordinates({ x: lx2.asNumber(), y: ly2.asNumber() }, transform)
            );
            if (markupType === 'dimension' || (markupType === 'length' && Math.abs(ll) > 1e-6)) {
              // Punto de la línea de cota (o de medida desplazada) a partir de /LL (positivo = sentido horario recorriendo /L)
              const ax = lx1.asNumber();
              const ay = ly1.asNumber();
              const bx = lx2.asNumber();
              const by = ly2.asNumber();
              const len = Math.hypot(bx - ax, by - ay) || 1;
              const ux = (bx - ax) / len;
              const uy = (by - ay) / len;
              const offset = Math.abs(ll) > 1e-6 ? ll : -15;
              points.push(
                pdfToNormalizedCoordinates(
                  { x: (ax + bx) / 2 + uy * offset, y: (ay + by) / 2 - ux * offset },
                  transform
                )
              );
            }
          }
        }
      } else if (subtype === 'Polygon' || (!isRea && subtype === 'Square' && isCloudyAnnotation(annotDict, intent))) {
        // Volumen y conteo de Revu (ADR-0051) y nubes poligonales/rectangulares
        if (!isRea) {
          markupType =
            isCloudyAnnotation(annotDict, intent)
              ? 'cloud'
              : intent === 'PolygonDimension'
                ? 'area'
                : intent === 'PolygonVolume'
                  ? 'volume'
                  : intent === 'PolygonCount'
                    ? 'count'
                    : 'polygon';
        }
        const vObj = annotDict.get(PDFName.of('Vertices'));
        if (vObj instanceof PDFArray && vObj.size() >= 4) {
          points.length = 0;
          for (let i = 0; i < vObj.size(); i += 2) {
            const vx = vObj.get(i);
            const vy = vObj.get(i + 1);
            if (vx instanceof PDFNumber && vy instanceof PDFNumber) {
              points.push(
                pdfToNormalizedCoordinates({ x: vx.asNumber(), y: vy.asNumber() }, transform)
              );
            }
          }
        }
      } else if (subtype === 'PolyLine') {
        if (!isRea) markupType = intent === 'PolyLineDimension' ? 'polylineMeasure' : intent === 'PolyLineAngle' ? 'angle' : 'polyLine';
        const vObj = annotDict.get(PDFName.of('Vertices'));
        if (vObj instanceof PDFArray && vObj.size() >= 4) {
          points.length = 0;
          for (let i = 0; i < vObj.size(); i += 2) {
            const vx = vObj.get(i);
            const vy = vObj.get(i + 1);
            if (vx instanceof PDFNumber && vy instanceof PDFNumber) {
              points.push(
                pdfToNormalizedCoordinates({ x: vx.asNumber(), y: vy.asNumber() }, transform)
              );
            }
          }
        }
        // Polilínea de medida cerrada (el último vértice repite el primero) = perímetro, como en Acrobat
        const first = points[0];
        const last = points[points.length - 1];
        const closed =
          points.length >= 4 && Math.abs(first.x - last.x) < 1e-4 && Math.abs(first.y - last.y) < 1e-4;
        if (!isRea && markupType === 'polylineMeasure' && closed) markupType = 'perimeter';
        if (markupType === 'perimeter' && closed) points.pop();
      } else if (subtype === 'Circle') {
        // Conteo, radio y diámetro de Revu (ADR-0051/0053); si no, una elipse
        const mtObj = annotDict.get(PDFName.of('MeasurementTypes'));
        const mt = mtObj instanceof PDFNumber ? mtObj.asNumber() : 0;
        if (!isRea) {
          markupType =
            intent === 'PolygonCount' || mt === 128
              ? 'count'
              : mt === 384
                ? 'diameter'
                : intent === 'PolygonRadius'
                  ? 'radius'
                  : 'circle';
        }
      } else if (subtype === 'Text') {
        markupType = 'stickyNote';
      } else if (
        subtype === 'Highlight' ||
        subtype === 'Underline' ||
        subtype === 'StrikeOut' ||
        subtype === 'Squiggly'
      ) {
        if (!isRea) {
          markupType =
            subtype === 'Highlight'
              ? 'highlightVector'
              : subtype === 'Underline'
                ? 'underline'
                : subtype === 'StrikeOut'
                  ? 'strikeOut'
                  : 'squiggly';
          const qpObj = annotDict.get(PDFName.of('QuadPoints'));
          if (qpObj instanceof PDFArray && qpObj.size() >= 8) {
            let qMinX = Infinity;
            let qMinY = Infinity;
            let qMaxX = -Infinity;
            let qMaxY = -Infinity;
            for (let i = 0; i + 1 < qpObj.size(); i += 2) {
              const qx = qpObj.get(i);
              const qy = qpObj.get(i + 1);
              if (qx instanceof PDFNumber && qy instanceof PDFNumber) {
                qMinX = Math.min(qMinX, qx.asNumber());
                qMinY = Math.min(qMinY, qy.asNumber());
                qMaxX = Math.max(qMaxX, qx.asNumber());
                qMaxY = Math.max(qMaxY, qy.asNumber());
              }
            }
            if (qMinX < qMaxX && qMinY < qMaxY) {
              points.length = 0;
              points.push(
                pdfToNormalizedCoordinates({ x: qMinX, y: qMaxY }, transform),
                pdfToNormalizedCoordinates({ x: qMaxX, y: qMinY }, transform)
              );
            }
          }
        }
      } else if (subtype === 'FreeText') {
        if (!isRea) {
          const hasCl = annotDict.get(PDFName.of('CL')) instanceof PDFArray;
          markupType =
            intent === 'FreeTextCallout' || hasCl
              ? 'callout'
              : intent === 'FreeTextTypeWriter'
              ? 'typewriter'
              : 'text';
          // Cuadros de texto ajenos: si no hay /C explícito, borde transparente; si no hay /IC, relleno transparente
          if (!annotDict.lookup(PDFName.of('C'))) {
            strokeColor = 'transparent';
            strokeWidth = 0;
            customFields.boxBorder = 0;
          } else {
            customFields.boxBorder = 1;
          }
          if (!annotDict.lookup(PDFName.of('IC'))) {
            fillColor = 'transparent';
          }
        }
      } else if (subtype === 'Stamp') {
        if (!isRea) {
          markupType = 'stamp';
          const nameObj = annotDict.get(PDFName.of('Name'));
          const rawName = nameObj instanceof PDFName ? decodePdfName(nameObj.asString()) : '';
          const norm = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const matched = rawName
            ? STAMPS.find(
                (s) =>
                  s.pdfName?.toLowerCase() === rawName.toLowerCase() ||
                  `rea${s.id.replace(/[^a-z0-9]/gi, '').toLowerCase()}` === norm ||
                  s.id.replace(/[^a-z0-9]/gi, '').toLowerCase() === norm ||
                  s.label.replace(/[^a-z0-9]/gi, '').toLowerCase() === norm
              )
            : undefined;
          const apInfo = extractForeignStampApInfo(annotDict);
          if (matched) {
            customFields.stampId = matched.id;
            if (matched.dynamic === 'foxit' || matched.dynamic === 'revu') {
              customFields.stampSubtitle = stampSubtitle(author, createdAt);
            }
            if (!annotDict.lookup(PDFName.of('C'))) {
              strokeColor = apInfo.color || matched.color;
            }
          } else {
            // Sello ajeno o personalizado: preservar su título real y color sin sustituir por APPROVED ni forzar subtítulo inventado
            const candidateText =
              text ||
              subject ||
              (apInfo.texts.length > 0 ? apInfo.texts.join(' ') : undefined) ||
              (rawName ? humanizePdfStampName(rawName) : 'STAMP');
            text = candidateText;
            if (!annotDict.lookup(PDFName.of('C'))) {
              strokeColor = apInfo.color || '#1d4ed8';
            }
          }
        }
      } else if (subtype === 'Widget') {
        if (!isRea) {
          markupType = 'formField';
          const wInfo = importForeignWidget(annotDict, annotRefOrDict);
          Object.assign(customFields, wInfo.fields);
          if (!annotDict.lookup(PDFName.of('C')) && wInfo.strokeColor) strokeColor = wInfo.strokeColor;
          if (!annotDict.lookup(PDFName.of('IC')) && wInfo.fillColor) fillColor = wInfo.fillColor;
        }
      } else if (
        !isRea &&
        ![
          'Square',
          'Circle',
          'Line',
          'Polygon',
          'PolyLine',
          'FreeText',
          'Text',
          'Ink',
          'Highlight',
          'Underline',
          'StrikeOut',
          'Squiggly',
          'Stamp',
          'Widget',
        ].includes(subtype)
      ) {
        // Subtipo no soportado por REA. Enlaces y ventanas emergentes ajenos se conservan
        // intactos en el PDF (los enlaces se pueden seguir en el visor): no se cuentan como no editables.
        if (!['Link', 'Popup'].includes(subtype)) foreignUnsupportedCount++;
        continue;
      }

      // Geometría exacta de REA, si la anotación no se movió fuera de REA (su /Rect sigue siendo el escrito)
      let leaders: MarkupPoint[][] | undefined;
      let cutouts: MarkupPoint[][] | undefined;
      let groupId: string | undefined;
      let layer: string | undefined;
      let lineStyle: string | undefined;
      let hatch: string | undefined;
      let fontFamily: string | undefined;
      let textColor: string | undefined;
      let reaAlign: 'left' | 'center' | 'right' | undefined;
      let reaBold = false;
      let reaItalic = false;
      let exactGeometry = false;
      let hasReaFill = false;
      if (isRea && reaObj instanceof PDFDict) {
        const readPts = (arr: unknown): MarkupPoint[] | null => {
          if (!(arr instanceof PDFArray) || arr.size() < 2 || arr.size() % 2 !== 0) return null;
          const out: MarkupPoint[] = [];
          for (let i = 0; i < arr.size(); i += 2) {
            const x = arr.get(i);
            const y = arr.get(i + 1);
            if (!(x instanceof PDFNumber) || !(y instanceof PDFNumber)) return null;
            out.push({ x: x.asNumber(), y: y.asNumber() });
          }
          return out;
        };
        const numbersOf = (arr: unknown): number[] | null => {
          if (!(arr instanceof PDFArray)) return null;
          const out: number[] = [];
          for (let i = 0; i < arr.size(); i++) {
            const v = arr.get(i);
            if (!(v instanceof PDFNumber)) return null;
            out.push(v.asNumber());
          }
          return out;
        };
        const savedRect = numbersOf(reaObj.get(PDFName.of('rect')));
        const currentRect = numbersOf(annotDict.get(PDFName.of('Rect')));
        const unchanged =
          savedRect &&
          currentRect &&
          savedRect.length === 4 &&
          currentRect.length === 4 &&
          savedRect.every((v, i) => Math.abs(v - currentRect[i]) < 0.5);
        const exactPts = readPts(reaObj.get(PDFName.of('pts')));
        if (unchanged && exactPts) {
          exactGeometry = true;
          points.length = 0;
          points.push(...exactPts);
          const leadersObj = reaObj.get(PDFName.of('leaders'));
          if (leadersObj instanceof PDFArray) {
            const parsed: MarkupPoint[][] = [];
            for (let i = 0; i < leadersObj.size(); i++) {
              const l = readPts(leadersObj.get(i));
              if (l) parsed.push(l);
            }
            if (parsed.length > 0) leaders = parsed;
          }
          const cutoutsObj = reaObj.get(PDFName.of('cutouts'));
          if (cutoutsObj instanceof PDFArray) {
            const parsedCutouts: MarkupPoint[][] = [];
            for (let i = 0; i < cutoutsObj.size(); i++) {
              const c = readPts(cutoutsObj.get(i));
              if (c && c.length >= 2) parsedCutouts.push(c);
            }
            if (parsedCutouts.length > 0) cutouts = parsedCutouts;
          }
        } else if (markupType === 'count' && points.length === 2) {
          // Conteo sin geometría exacta: su centro es el centro de la caja
          points.splice(0, 2, { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
        }
        groupId = extractPdfStringValue(reaObj.get(PDFName.of('groupId'))) || undefined;
        layer = extractPdfStringValue(reaObj.get(PDFName.of('layer'))) || undefined;
        // Tipo de línea con patrón (ADR-0041)
        lineStyle = extractPdfStringValue(reaObj.get(PDFName.of('lineStyle'))) || undefined;
        // Hatch de formas cerradas (ADR-0057)
        hatch = extractPdfStringValue(reaObj.get(PDFName.of('hatch'))) || undefined;
        fontFamily = extractPdfStringValue(reaObj.get(PDFName.of('fontFamily'))) || undefined;
        textColor = extractPdfStringValue(reaObj.get(PDFName.of('textColor'))) || undefined;
        if (reaObj.get(PDFName.of('noFill')) instanceof PDFNumber && !fillColor) {
          fillColor = 'transparent';
          hasReaFill = true;
        } else {
          const reaFill = extractPdfStringValue(reaObj.get(PDFName.of('fillColor')));
          if (reaFill) {
            fillColor = reaFill;
            hasReaFill = true;
          }
        }
        const rawAlign = extractPdfStringValue(reaObj.get(PDFName.of('textAlign')));
        if (rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right') {
          reaAlign = rawAlign;
        }
        reaBold = reaObj.get(PDFName.of('bold')) instanceof PDFNumber;
        reaItalic = reaObj.get(PDFName.of('italic')) instanceof PDFNumber;
      }

      // Callout ajeno o movido en Revu/Acrobat (ADR-0042/0053): caja de texto desde /Rect - /RD y directriz desde /CL
      if (markupType === 'callout' && !exactGeometry) {
        const rdObj = annotDict.get(PDFName.of('RD'));
        if (
          rdObj instanceof PDFArray &&
          rdObj.size() >= 4 &&
          rectObj instanceof PDFArray &&
          rectObj.size() >= 4
        ) {
          const rNums = [0, 1, 2, 3].map((i) => rectObj.get(i));
          const dNums = [0, 1, 2, 3].map((i) => rdObj.get(i));
          if (rNums.every((n) => n instanceof PDFNumber) && dNums.every((n) => n instanceof PDFNumber)) {
            const [rx0, ry0, rx1, ry1] = rNums.map((n) => (n as PDFNumber).asNumber());
            const [dl, db, dr, dt] = dNums.map((n) => (n as PDFNumber).asNumber());
            const bx0 = Math.min(rx0, rx1) + Math.max(0, dl);
            const by0 = Math.min(ry0, ry1) + Math.max(0, db);
            const bx1 = Math.max(rx0, rx1) - Math.max(0, dr);
            const by1 = Math.max(ry0, ry1) - Math.max(0, dt);
            if (bx1 > bx0 && by1 > by0) {
              points.splice(
                0,
                points.length,
                pdfToNormalizedCoordinates({ x: bx0, y: by1 }, transform),
                pdfToNormalizedCoordinates({ x: bx1, y: by0 }, transform)
              );
            }
          }
        }
        const clObj = annotDict.get(PDFName.of('CL'));
        if (clObj instanceof PDFArray && clObj.size() >= 4) {
          const nums: number[] = [];
          for (let i = 0; i < clObj.size(); i++) {
            const v = clObj.get(i);
            if (v instanceof PDFNumber) nums.push(v.asNumber());
          }
          if (nums.length >= 6) {
            leaders = [
              [
                pdfToNormalizedCoordinates({ x: nums[0], y: nums[1] }, transform),
                pdfToNormalizedCoordinates({ x: nums[2], y: nums[3] }, transform),
              ],
            ];
          } else if (nums.length >= 4) {
            leaders = [[pdfToNormalizedCoordinates({ x: nums[0], y: nums[1] }, transform)]];
          }
        }
      }

      // Capa de una anotación ajena (o de REA sin capa): el /Name de su /OCG (ADR-0046)
      if (!layer) {
        const ocObj = annotDict.lookup(PDFName.of('OC'));
        if (ocObj instanceof PDFDict) layer = extractPdfStringValue(ocObj.get(PDFName.of('Name'))) || undefined;
      }

      // Conteo, radio y diámetro de Revu (o de REA movidos fuera) sin geometría exacta (ADR-0051/0053)
      // Count de Revu como polígono (ADR-0059): un vértice por clic, con el símbolo por defecto de Revu
      if (!isRea && markupType === 'count' && subtype === 'Polygon' && points.length >= 1) {
        customFields.countSymbol = 'check';
        measurement = countMeasurement(points.length);
      }
      if (!isRea && !exactGeometry && markupType === 'count' && subtype !== 'Polygon' && points.length >= 2) {
        const cx = points.reduce((t, p) => t + p.x, 0) / points.length;
        const cy = points.reduce((t, p) => t + p.y, 0) / points.length;
        points.splice(0, points.length, { x: cx, y: cy });
        measurement = calculateCount(1);
      }
      if (!exactGeometry && (markupType === 'radius' || markupType === 'diameter') && subtype === 'Circle' && points.length === 2) {
        const [a, b] = points;
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        points.splice(
          0,
          2,
          markupType === 'radius' ? c : { x: Math.min(a.x, b.x), y: c.y },
          { x: Math.max(a.x, b.x), y: c.y }
        );
      }
      // Profundidad del volumen de Revu (/Depth)
      if (!isRea && markupType === 'volume') {
        const depthObj = annotDict.get(PDFName.of('Depth'));
        if (depthObj instanceof PDFNumber && depthObj.asNumber() > 0) customFields.volumeDepth = depthObj.asNumber();
      }

      if (!cutouts) {
        const cutoutsObj = annotDict.get(PDFName.of('Cutouts'));
        if (cutoutsObj instanceof PDFArray) {
          const parsedCutouts: MarkupPoint[][] = [];
          for (let i = 0; i < cutoutsObj.size(); i++) {
            const item = cutoutsObj.get(i);
            if (item instanceof PDFArray && item.size() >= 4 && item.size() % 2 === 0) {
              const ring: MarkupPoint[] = [];
              for (let j = 0; j < item.size(); j += 2) {
                const rx = item.get(j);
                const ry = item.get(j + 1);
                if (rx instanceof PDFNumber && ry instanceof PDFNumber) {
                  ring.push(pdfToNormalizedCoordinates({ x: rx.asNumber(), y: ry.asNumber() }, transform));
                }
              }
              if (ring.length >= 2) parsedCutouts.push(ring);
            }
          }
          if (parsedCutouts.length > 0) cutouts = parsedCutouts;
        }
      }

      // Medición ajena, o de REA movida en otra aplicación: el valor sale de su geometría y de su /Measure (o de la
      // escala de la página), como lo calcularía Revu/Acrobat (ADR-0030)
      if (RECOMPUTED_MEASURES.has(markupType) && !exactGeometry && points.length >= 2) {
        const cal =
          (measureObj instanceof PDFDict ? calibrationFromMeasure(measureObj, transform.rotation) : null) ??
          pageCalibration ??
          DEFAULT_PAGE_CALIBRATION;
        if (markupType === 'length') measurement = calculateLength(points.slice(0, 2), visualDims, cal);
        else if (markupType === 'polylineMeasure') measurement = calculatePolylineLength(points, visualDims, cal);
        else if (markupType === 'perimeter') measurement = calculatePerimeter(points, visualDims, cal);
        else if (markupType === 'radius' || markupType === 'diameter') measurement = calculateLength(points.slice(0, 2), visualDims, cal);
        else if (markupType === 'angle') {
          if (points.length >= 3) measurement = calculateAngle(points.slice(0, 3), visualDims, cal);
        } else if (markupType === 'volume') {
          if (points.length >= 2) measurement = calculateVolume(points, visualDims, cal, Number(customFields.volumeDepth ?? 1), cutouts);
        } else if (markupType === 'area') {
          if (points.length >= 2) measurement = calculateArea(points, visualDims, cal, points.length === 2, cutouts);
        }
      }

      // Opacidad (/CA trazo/global, /ca relleno interior) y tamaño de fuente (/DA)
      let opacity = 1;
      const caObj = annotDict.get(PDFName.of('CA'));
      if (caObj instanceof PDFNumber && caObj.asNumber() > 0 && caObj.asNumber() <= 1 && subtype !== 'Highlight') {
        opacity = caObj.asNumber();
      }
      let fillOpacity: number | undefined;
      const caFillObj = annotDict.get(PDFName.of('ca'));
      if (caFillObj instanceof PDFNumber && caFillObj.asNumber() >= 0 && caFillObj.asNumber() <= 1 && subtype !== 'Highlight') {
        fillOpacity = caFillObj.asNumber();
      }
      // Alineación de texto estándar (/Q: 0=left, 1=center, 2=right) y formato (ADR-0074)
      let textAlign: 'left' | 'center' | 'right' | undefined = reaAlign;
      const qObj = annotDict.get(PDFName.of('Q'));
      if (qObj instanceof PDFNumber) {
        const qNum = qObj.asNumber();
        if (qNum === 1) textAlign = 'center';
        else if (qNum === 2) textAlign = 'right';
        else if (qNum === 0 && (reaAlign !== undefined || !isRea)) textAlign = 'left';
      }

      let fontSize: number | undefined;
      const daStr = extractPdfStringValue(annotDict.get(PDFName.of('DA')));
      const dsStr = extractPdfStringValue(annotDict.get(PDFName.of('DS')));
      if (daStr || dsStr) {
        const parsedApp = parsePdfTextAppearance(daStr, dsStr);
        if (parsedApp.fontSize && !fontSize) fontSize = parsedApp.fontSize;
        if (parsedApp.fontFamily && !fontFamily) fontFamily = parsedApp.fontFamily;
        if (parsedApp.textColor && !textColor) textColor = parsedApp.textColor;
        if (parsedApp.bold && !reaBold) reaBold = true;
        if (parsedApp.italic && !reaItalic) reaItalic = true;
        if (parsedApp.align && textAlign === undefined) textAlign = parsedApp.align;
      }
      const textFormat =
        textAlign !== undefined || reaBold || reaItalic
          ? {
              ...(reaBold ? { bold: true } : {}),
              ...(reaItalic ? { italic: true } : {}),
              ...(textAlign !== undefined ? { align: textAlign } : {}),
            }
          : undefined;

      // Comprobar bandera de bloqueo (/F bit 8 = 128 o /Ff ReadOnly en campos ajenos)
      let locked = customFields.foreignReadOnly === 1;
      delete customFields.foreignReadOnly;
      const fObj = annotDict.get(PDFName.of('F'));
      if (fObj instanceof PDFNumber && (fObj.asNumber() & 128) !== 0) {
        locked = true;
      }
      // Bit Hidden de /F (ADR-0109): la marca se importa oculta
      const hidden = fObj instanceof PDFNumber && (fObj.asNumber() & 2) !== 0;

      // Comprobar extremos de línea (/LE: array de 2 nombres en Line/PolyLine o nombre único en FreeTextCallout)
      let lineEndingStart: LineEndingStyle | undefined;
      let lineEndingEnd: LineEndingStyle | undefined;
      const leObj = annotDict.get(PDFName.of('LE'));
      const parseEnding = (entry: unknown): LineEndingStyle | undefined => {
        if (entry instanceof PDFName) {
          const raw = entry.asString().replace(/^\//, '').toLowerCase();
          if (raw === 'circle') return 'circle';
          if (raw === 'closedarrow') return 'closedArrow';
          if (raw === 'openarrow') return 'openArrow';
          if (raw === 'square') return 'square';
          if (raw === 'diamond') return 'diamond';
          if (raw === 'butt') return 'butt';
          if (raw === 'slash') return 'slash';
          if (raw === 'ropenarrow') return 'rOpenArrow';
          if (raw === 'rclosedarrow') return 'rClosedArrow';
          if (raw === 'none') return 'none';
        }
        return undefined;
      };
      if (leObj instanceof PDFArray && leObj.size() >= 2) {
        const s = parseEnding(leObj.get(0));
        const e = parseEnding(leObj.get(1));
        if (s && s !== 'none') lineEndingStart = s;
        if (e && e !== 'none') lineEndingEnd = e;
      } else if (leObj instanceof PDFName) {
        const s = parseEnding(leObj);
        if (s && s !== 'none') lineEndingStart = s;
      }

      if (fillColor && fillColor !== 'transparent' && fillColor !== 'none') {
        if (!hasReaFill && fillOpacity !== undefined && fillOpacity < 1) {
          fillColor = translucentFill(fillColor, fillOpacity);
        } else if (!hasReaFill && fillOpacity === undefined && (markupType === 'area' || markupType === 'volume')) {
          // Auto-sanar marcas de área/volumen guardadas sin /ca explícito o con hex sólido,
          // evitando que tapen el plano arquitectónico con un bloque de color opaco.
          if (!fillColor.startsWith('rgba')) {
            fillColor = translucentFill(fillColor, 0.25);
          }
        }
      }

      const markup: Markup = {
        id,
        type: markupType,
        pageIndex: pageIdx,
        points: points.length > 0 ? points : [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }],
        style: {
          strokeColor,
          fillColor: fillColor || undefined,
          strokeWidth,
          opacity,
          ...(fontSize !== undefined ? { fontSize } : {}),
          ...(fontFamily ? { fontFamily } : {}),
          ...(textColor ? { textColor } : {}),
          lineEndingStart,
          lineEndingEnd,
          dashArray,
          ...(lineStyle ? { lineStyle } : {}),
          ...(hatch ? { hatch } : {}),
        },
        text: text || undefined,
        ...(textFormat ? { textFormat } : {}),
        author,
        status: 'pending',
        createdAt,
        updatedAt,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        locked: locked || undefined,
        hidden: hidden || undefined,
        measurement,
        ...(leaders ? { leaders } : {}),
        ...(cutouts ? { cutouts } : {}),
        ...(groupId ? { groupId } : {}),
        ...(layer ? { layer } : {}),
        ...(subject ? { subject } : {}),
        ...(unitPrice !== undefined ? { unitPrice } : {}),
        ...(cost !== undefined ? { cost } : {}),
      };

      // Enlaces, adjuntos y campos de REA (ADR-0027): lo editado en Revu/Acrobat manda (destino, valor rellenado)
      if (isRea) syncInteractiveFields(markup, annotDict, pdfDoc, pages, attachments);

      markups.push(markup);
    }
  }

  // Segundo pase: asociar estados de revisión y respuestas en hilo a sus anotaciones padre correspondientes
  const sortChronologically = <T extends { createdAt: string; order: number }>(items: T[]): T[] =>
    [...items].sort((a, b) => {
      const tA = Date.parse(a.createdAt);
      const tB = Date.parse(b.createdAt);
      if (Number.isFinite(tA) && Number.isFinite(tB) && tA !== tB) return tA - tB;
      return a.order - b.order;
    });

  for (const m of markups) {
    const transitions = reviewTransitionsByParentId.get(m.id);
    if (transitions && transitions.length > 0) {
      const sorted = sortChronologically(transitions);
      m.status = sorted[sorted.length - 1].status;
      if (sorted.length > 1) {
        m.statusHistory = sorted.map(({ status, author, createdAt }) => ({
          status,
          author,
          createdAt,
        }));
      }
    }
    const replies = repliesByParentId.get(m.id);
    if (replies && replies.length > 0) {
      const sorted = sortChronologically(replies);
      m.replies = sorted.map(({ id, author, text, createdAt, updatedAt }) => ({
        id,
        author,
        text,
        createdAt,
        updatedAt,
      }));
    }
  }

  // Capas de marcas que el PDF deja apagadas en /OCProperties /D /OFF (ADR-0046/0053)
  const hiddenLayers: string[] = [];
  const ocProps = pdfDoc.catalog.lookup(PDFName.of('OCProperties'));
  if (ocProps instanceof PDFDict) {
    const dDict = ocProps.lookup(PDFName.of('D'));
    const offArr = dDict instanceof PDFDict ? dDict.lookup(PDFName.of('OFF')) : null;
    const markupLayerNames = new Set(markups.map((m) => m.layer).filter((l): l is string => Boolean(l)));
    if (offArr instanceof PDFArray) {
      for (let i = 0; i < offArr.size(); i++) {
        const ocg = offArr.lookup(i);
        if (ocg instanceof PDFDict) {
          const name = extractPdfStringValue(ocg.get(PDFName.of('Name')));
          const isReaLayer = ocg.get(PDFName.of('REA')) instanceof PDFDict;
          if (name && (isReaLayer || markupLayerNames.has(name)) && !hiddenLayers.includes(name)) {
            hiddenLayers.push(name);
          }
        }
      }
    }
  }

  return {
    markups,
    foreignUnsupportedCount,
    attachments,
    hiddenLayers,
  };
}

/**
 * Importa un widget AcroForm de otra aplicación (/Subtype /Widget sin /REA, ADR-0055): resuelve herencia /Parent
 * para /FT, /T, /Ff, /V y /Opt, detecta el nombre del estado activo en /AP /N y guarda las referencias de objeto
 * originales para poder reescribir el widget y su padre in-place al guardar.
 */
function importForeignWidget(
  annotDict: PDFDict,
  annotRefOrDict: unknown
): { fields: Record<string, string | number>; strokeColor?: string; fillColor?: string } {
  const lookupAttr = (key: string): unknown => {
    let cur: PDFDict | undefined = annotDict;
    const seen = new Set<PDFDict>();
    for (let depth = 0; cur && depth < 8 && !seen.has(cur); depth++) {
      seen.add(cur);
      const val: unknown = cur.lookup(PDFName.of(key));
      if (val !== undefined) return val;
      const p: unknown = cur.lookup(PDFName.of('Parent'));
      cur = p instanceof PDFDict ? p : undefined;
    }
    return undefined;
  };

  const nameParts: string[] = [];
  let cur: PDFDict | undefined = annotDict;
  const seen = new Set<PDFDict>();
  for (let depth = 0; cur && depth < 8 && !seen.has(cur); depth++) {
    seen.add(cur);
    const tVal = extractPdfStringValue(cur.get(PDFName.of('T')));
    if (tVal) nameParts.unshift(tVal);
    const p: unknown = cur.lookup(PDFName.of('Parent'));
    cur = p instanceof PDFDict ? p : undefined;
  }
  const fieldName = nameParts.join('.') || 'Field';

  const ftObj = lookupAttr('FT');
  const ftStr = ftObj instanceof PDFName ? decodePdfName(ftObj.asString()) : 'Tx';
  const ffObj = lookupAttr('Ff');
  const ff = ffObj instanceof PDFNumber ? ffObj.asNumber() : 0;

  let fieldType = 'text';
  if (ftStr === 'Btn') {
    if ((ff & 65536) !== 0) fieldType = 'button';
    else if ((ff & 32768) !== 0) fieldType = 'radio';
    else fieldType = 'checkbox';
  } else if (ftStr === 'Ch') {
    fieldType = (ff & 131072) !== 0 ? 'dropdown' : 'listbox';
  } else if (ftStr === 'Sig') {
    fieldType = 'signature';
  }

  let onState = '';
  const apDict = annotDict.lookup(PDFName.of('AP'));
  const nDict = apDict instanceof PDFDict ? apDict.lookup(PDFName.of('N')) : null;
  if (nDict instanceof PDFDict) {
    for (const [k] of nDict.entries()) {
      const stateKey = decodePdfName(k.asString());
      if (stateKey && stateKey !== 'Off') {
        onState = stateKey;
        break;
      }
    }
  }

  const fields: Record<string, string | number> = { fieldType, fieldName };
  if (annotRefOrDict instanceof PDFRef) {
    fields.foreignWidgetObjNum = annotRefOrDict.objectNumber;
  }
  const parentRef = annotDict.get(PDFName.of('Parent'));
  if (parentRef instanceof PDFRef) {
    fields.foreignParentObjNum = parentRef.objectNumber;
  }
  if (onState) fields.onStateName = onState;
  if ((ff & 1) !== 0) fields.foreignReadOnly = 1;

  const vObj = lookupAttr('V');
  const vStr = vObj instanceof PDFName ? decodePdfName(vObj.asString()) : extractPdfStringValue(vObj);
  const asObj = annotDict.get(PDFName.of('AS'));
  const asStr = asObj instanceof PDFName ? decodePdfName(asObj.asString()) : '';

  if (fieldType === 'radio') {
    let exportVal = onState || (asStr && asStr !== 'Off' ? asStr : 'Choice1');
    const optObj = lookupAttr('Opt');
    if (optObj instanceof PDFArray && /^\d+$/.test(exportVal)) {
      const idx = parseInt(exportVal, 10);
      if (idx >= 0 && idx < optObj.size()) {
        const optLabel = extractPdfStringValue(optObj.lookup(idx));
        if (optLabel) exportVal = optLabel;
      }
    }
    fields.radioValue = exportVal;
    const stateToMatch = onState || exportVal;
    const checked =
      (asStr !== '' && asStr !== 'Off') ||
      (asStr === '' && vStr !== '' && (vStr === stateToMatch || vStr === exportVal));
    fields.fieldValue = checked ? 'Yes' : 'Off';
  } else if (fieldType === 'checkbox') {
    const checked = (asStr !== '' && asStr !== 'Off') || (asStr === '' && vStr !== '' && vStr !== 'Off' && vStr !== 'No');
    fields.fieldValue = checked ? 'Yes' : 'Off';
  } else if (fieldType === 'dropdown' || fieldType === 'listbox') {
    const optObj = lookupAttr('Opt');
    if (optObj instanceof PDFArray) {
      const opts: string[] = [];
      for (let i = 0; i < optObj.size(); i++) {
        const item = optObj.lookup(i);
        if (item instanceof PDFArray && item.size() >= 2) {
          const disp = extractPdfStringValue(item.get(1)) || extractPdfStringValue(item.get(0));
          if (disp) opts.push(disp);
        } else {
          const s = extractPdfStringValue(item);
          if (s) opts.push(s);
        }
      }
      if (opts.length > 0) fields.fieldOptions = opts.join('\n');
    }
    fields.fieldValue = vStr;
  } else if (fieldType === 'button') {
    const mk = annotDict.lookup(PDFName.of('MK'));
    const ca = mk instanceof PDFDict ? extractPdfStringValue(mk.get(PDFName.of('CA'))) : '';
    fields.buttonCaption = ca || fieldName || 'Button';
  } else if (fieldType === 'signature') {
    if (vObj instanceof PDFDict) {
      readSigDictIntoFields(vObj, fields);
      fields.foreignReadOnly = 1;
    }
  } else if (fieldType === 'text') {
    fields.fieldValue = vStr;
  }

  const mk = annotDict.lookup(PDFName.of('MK'));
  const bc = mk instanceof PDFDict ? pdfColorArrayToHex(mk.get(PDFName.of('BC'))) : undefined;
  const bg = mk instanceof PDFDict ? pdfColorArrayToHex(mk.get(PDFName.of('BG'))) : undefined;
  return { fields, strokeColor: bc || '#2563eb', fillColor: bg };
}

/** Extrae los datos del diccionario de firma (/Type /Sig) en los campos del modelo (ADR-0056). */
function readSigDictIntoFields(sigDict: PDFDict, fields: Record<string, string | number>): void {
  fields.sigSigned = 1;
  const signer = extractPdfStringValue(sigDict.get(PDFName.of('Name')));
  if (signer) fields.sigSigner = signer;
  const reason = extractPdfStringValue(sigDict.get(PDFName.of('Reason')));
  if (reason) fields.sigReason = reason;
  const location = extractPdfStringValue(sigDict.get(PDFName.of('Location')));
  if (location) fields.sigLocation = location;
  const rawDate = extractPdfStringValue(sigDict.get(PDFName.of('M')));
  if (rawDate) {
    const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(rawDate);
    fields.sigDate = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : rawDate;
  }
}

/** Valor, destino o adjunto actuales de una marca interactiva de REA, leídos del propio PDF. */
function syncInteractiveFields(
  markup: Markup,
  annotDict: PDFDict,
  pdfDoc: PDFDocument,
  pages: ReturnType<PDFDocument['getPages']>,
  attachments: ImportAnnotationsResult['attachments']
): void {
  const fields: Record<string, string | number> = { ...(markup.customFields ?? {}) };
  if (markup.type === 'link') {
    const action = annotDict.lookup(PDFName.of('A'));
    const uri = action instanceof PDFDict ? extractPdfStringValue(action.lookup(PDFName.of('URI'))) : '';
    const dest = annotDict.lookup(PDFName.of('Dest'));
    if (uri) {
      fields.linkUri = uri;
      delete fields.linkPage;
    } else if (dest instanceof PDFArray && dest.get(0) instanceof PDFRef) {
      const ref = dest.get(0) as PDFRef;
      const idx = pages.findIndex((p) => p.ref.objectNumber === ref.objectNumber);
      if (idx >= 0) {
        fields.linkPage = idx + 1;
        delete fields.linkUri;
      }
    }
  } else if (markup.type === 'fileAttachment') {
    const fs = annotDict.lookup(PDFName.of('FS'));
    const ef = fs instanceof PDFDict ? fs.lookup(PDFName.of('EF')) : null;
    const stream = ef instanceof PDFDict ? ef.lookup(PDFName.of('F')) : null;
    const key = String(fields.attachmentKey ?? markup.id);
    if (stream instanceof PDFRawStream) {
      const bytes = decodePDFRawStream(stream).decode();
      const name = String(fields.attachmentName ?? (fs instanceof PDFDict ? extractPdfStringValue(fs.lookup(PDFName.of('UF'))) || extractPdfStringValue(fs.lookup(PDFName.of('F'))) : '') ?? 'attachment');
      attachments[key] = { name, mime: String(fields.attachmentMime ?? 'application/octet-stream'), bytes };
      fields.attachmentKey = key;
    }
  } else if (markup.type === 'formField') {
    const type = String(fields.fieldType ?? 'text');
    if (type === 'checkbox' || type === 'radio') {
      const as = annotDict.get(PDFName.of('AS'));
      if (as instanceof PDFName) fields.fieldValue = as.asString() === '/Off' ? 'Off' : 'Yes';
    } else if (type === 'signature') {
      const own = annotDict.lookup(PDFName.of('V'));
      const parent = annotDict.lookup(PDFName.of('Parent'));
      const v = own ?? (parent instanceof PDFDict ? parent.lookup(PDFName.of('V')) : undefined);
      if (v instanceof PDFDict) {
        readSigDictIntoFields(v, fields);
        markup.locked = true;
      }
    } else {
      const own = annotDict.lookup(PDFName.of('V'));
      const parent = annotDict.lookup(PDFName.of('Parent'));
      const v = own ?? (parent instanceof PDFDict ? parent.lookup(PDFName.of('V')) : undefined);
      const text = extractPdfStringValue(v);
      if (v !== undefined) fields.fieldValue = text;
    }
  }
  void pdfDoc;
  markup.customFields = fields;
}
