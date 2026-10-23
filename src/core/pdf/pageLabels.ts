/**
 * Soporte de Etiquetas de Página (/PageLabels) según ISO 32000-1 §12.4.2.
 * Permite numeración técnica de planos (ej. "Cover", "i", "ii", "A-101", "A-102")
 * con estilos decimales (/D), romanos (/R, /r), alfabéticos (/A, /a) y prefijos (/P).
 */

export type PageLabelStyle = 'D' | 'R' | 'r' | 'A' | 'a';

export interface PageLabelRange {
  startPage: number; // 0-based page index
  style?: PageLabelStyle;
  prefix?: string;
  startNum?: number; // default: 1
}

const ROMAN_MAP: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/**
 * Convierte un número entero positivo a numeración romana (mayúsculas o minúsculas).
 */
export function toRomanNumerals(num: number, lowercase = false): string {
  if (num <= 0 || !Number.isFinite(num)) {
    return String(num);
  }

  let remaining = Math.floor(num);
  let result = '';

  for (const [val, roman] of ROMAN_MAP) {
    while (remaining >= val) {
      result += roman;
      remaining -= val;
    }
  }

  return lowercase ? result.toLowerCase() : result;
}

/**
 * Convierte un número entero positivo a numeración alfabética según ISO 32000-1:
 * 1 -> A, 26 -> Z, 27 -> AA, 28 -> BB... (mayúsculas o minúsculas).
 */
export function toAlphaNumerals(num: number, lowercase = false): string {
  if (num <= 0 || !Number.isFinite(num)) {
    return String(num);
  }

  const n = Math.floor(num);
  const baseCharCode = lowercase ? 97 : 65; // 'a' o 'A'
  const letterIndex = (n - 1) % 26;
  const repeatCount = Math.floor((n - 1) / 26) + 1;
  const char = String.fromCharCode(baseCharCode + letterIndex);

  return char.repeat(repeatCount);
}

/**
 * Formatea la etiqueta de una página dada a partir del rango activo.
 */
export function formatPageLabel(pageIndex: number, range: PageLabelRange): string {
  const prefix = range.prefix ?? '';
  const offset = Math.max(0, pageIndex - range.startPage);
  const currentNum = (range.startNum ?? 1) + offset;

  if (!range.style) {
    // Si no tiene estilo numérico, la etiqueta es solo el prefijo
    return prefix;
  }

  let formattedNum = '';
  switch (range.style) {
    case 'D':
      formattedNum = String(currentNum);
      break;
    case 'R':
      formattedNum = toRomanNumerals(currentNum, false);
      break;
    case 'r':
      formattedNum = toRomanNumerals(currentNum, true);
      break;
    case 'A':
      formattedNum = toAlphaNumerals(currentNum, false);
      break;
    case 'a':
      formattedNum = toAlphaNumerals(currentNum, true);
      break;
    default:
      formattedNum = String(currentNum);
  }

  return prefix + formattedNum;
}

/**
 * Construye el mapa de etiquetas de página para todas las páginas del documento.
 */
export function buildPageLabelsMap(
  ranges: PageLabelRange[],
  numPages: number
): Record<number, string> {
  const map: Record<number, string> = {};
  if (numPages <= 0 || ranges.length === 0) return map;

  const sortedRanges = [...ranges].sort((a, b) => a.startPage - b.startPage);
  if (sortedRanges.length > 0 && sortedRanges[0].startPage > 0) {
    // ISO 32000-1 §12.4.2: si el primer rango no define la página 0, se usa numeración decimal estándar desde 1
    sortedRanges.unshift({ startPage: 0, style: 'D', startNum: 1 });
  }

  for (let p = 0; p < numPages; p++) {
    // Buscar el rango activo para la página p (el de mayor startPage <= p)
    let activeRange: PageLabelRange = sortedRanges[0];
    for (let r = 0; r < sortedRanges.length; r++) {
      if (sortedRanges[r].startPage <= p) {
        activeRange = sortedRanges[r];
      } else {
        break;
      }
    }

    map[p] = formatPageLabel(p, activeRange);
  }

  return map;
}

/**
 * Extrae /PageLabels directamente inspeccionando el árbol de números del catálogo con pdf-lib (carga diferida).
 */
async function parseLabelRanges(bytes: Uint8Array): Promise<{ ranges: PageLabelRange[]; pageCount: number } | null> {
  try {
    const { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFString, PDFHexString } =
      await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const catalog = doc.catalog;
    const pageLabelsRef = catalog.lookup(PDFName.of('PageLabels'));

    if (!pageLabelsRef || !(pageLabelsRef instanceof PDFDict)) {
      return null;
    }

    const ranges: PageLabelRange[] = [];

    // Función auxiliar para parsear un array /Nums [0 << ... >> 10 << ... >>]
    const parseNumsArray = (numsArr: any) => {
      if (!(numsArr instanceof PDFArray)) return;
      const size = numsArr.size();
      for (let i = 0; i < size; i += 2) {
        const pageNumObj = numsArr.lookup(i);
        const dictObj = numsArr.lookup(i + 1);

        if (pageNumObj instanceof PDFNumber && dictObj instanceof PDFDict) {
          const startPage = pageNumObj.asNumber();
          let style: PageLabelStyle | undefined;
          let prefix: string | undefined;
          let startNum: number | undefined;

          const sObj = dictObj.lookup(PDFName.of('S'));
          if (sObj instanceof PDFName) {
            const sName = sObj.asString().replace(/^\//, '');
            if (['D', 'R', 'r', 'A', 'a'].includes(sName)) {
              style = sName as PageLabelStyle;
            }
          }

          const pObj = dictObj.lookup(PDFName.of('P'));
          if (pObj instanceof PDFString || pObj instanceof PDFHexString) {
            prefix = typeof (pObj as any).decodeText === 'function' ? (pObj as any).decodeText() : pObj.asString();
          }

          const stObj = dictObj.lookup(PDFName.of('St'));
          if (stObj instanceof PDFNumber) {
            startNum = stObj.asNumber();
          }

          ranges.push({
            startPage,
            style,
            prefix,
            startNum,
          });
        }
      }
    };

    const numsObj = pageLabelsRef.lookup(PDFName.of('Nums'));
    if (numsObj instanceof PDFArray) {
      parseNumsArray(numsObj);
    } else {
      // Si tiene /Kids
      const kidsObj = pageLabelsRef.lookup(PDFName.of('Kids'));
      if (kidsObj instanceof PDFArray) {
        for (let k = 0; k < kidsObj.size(); k++) {
          const kidDict = kidsObj.lookup(k);
          if (kidDict instanceof PDFDict) {
            const kidNums = kidDict.lookup(PDFName.of('Nums'));
            if (kidNums instanceof PDFArray) {
              parseNumsArray(kidNums);
            }
          }
        }
      }
    }

    if (ranges.length === 0) {
      return null;
    }

    return { ranges, pageCount: doc.getPageCount() };
  } catch (err) {
    console.warn('[PageLabels] Error extracting /PageLabels from bytes:', err);
    return null;
  }
}

export async function extractPageLabelsFromPdfBytes(
  bytes: Uint8Array
): Promise<Record<number, string> | null> {
  const parsed = await parseLabelRanges(bytes);
  return parsed ? buildPageLabelsMap(parsed.ranges, parsed.pageCount) : null;
}

/** Los rangos de etiquetas que tiene el PDF (vacío si no tiene), ordenados por página. */
export async function readPageLabelRanges(bytes: Uint8Array): Promise<PageLabelRange[]> {
  const parsed = await parseLabelRanges(bytes);
  return parsed ? [...parsed.ranges].sort((a, b) => a.startPage - b.startPage) : [];
}

/**
 * Escribe los rangos de etiquetas en el catálogo del PDF (/PageLabels con un árbol de números); sin rangos las quita. La
 * primera página siempre abre un rango: si el primero empieza más tarde se añade uno decimal desde 1, como dicta la norma.
 */
export async function writePageLabelRanges(bytes: Uint8Array, ranges: PageLabelRange[]): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFNumber, PDFHexString } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const catalog = doc.catalog;
  if (ranges.length === 0) {
    catalog.delete(PDFName.of('PageLabels'));
    return doc.save();
  }
  const sorted = [...ranges].sort((a, b) => a.startPage - b.startPage);
  if (sorted[0].startPage > 0) sorted.unshift({ startPage: 0, style: 'D', startNum: 1 });
  const nums: unknown[] = [];
  let last = -1;
  for (const r of sorted) {
    if (r.startPage === last) continue;
    last = r.startPage;
    const entries: Record<string, unknown> = {};
    if (r.style) entries.S = PDFName.of(r.style);
    if (r.prefix) entries.P = PDFHexString.fromText(r.prefix);
    if (r.startNum !== undefined && r.startNum !== 1) entries.St = PDFNumber.of(r.startNum);
    nums.push(PDFNumber.of(r.startPage), doc.context.obj(entries as never));
  }
  catalog.set(PDFName.of('PageLabels'), doc.context.obj({ Nums: nums } as never));
  return doc.save();
}

/**
 * Carga las etiquetas de página desde el objeto pdfDoc de PDF.js, o recurre a los bytes con pdf-lib.
 */
export async function loadPageLabels(
  pdfDoc: unknown,
  bytes?: Uint8Array | null
): Promise<Record<number, string> | null> {
  // 1. Intentar getPageLabels() nativo de PDF.js
  try {
    if (pdfDoc && typeof (pdfDoc as any).getPageLabels === 'function') {
      const labels = await (pdfDoc as any).getPageLabels();
      if (Array.isArray(labels) && labels.length > 0) {
        const map: Record<number, string> = {};
        for (let i = 0; i < labels.length; i++) {
          map[i] = typeof labels[i] === 'string' ? labels[i] : String(i + 1);
        }
        return map;
      }
    }
  } catch {
    // Continuar a fallback de bytes
  }

  // 2. Fallback: inspeccionar bytes del PDF con pdf-lib
  if (bytes && bytes.length > 0) {
    return extractPageLabelsFromPdfBytes(bytes);
  }

  return null;
}
