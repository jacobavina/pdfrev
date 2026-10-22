import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream } from 'pdf-lib';
import { getHelveticaCharWidth } from '../markup/helveticaMetrics';
import { Operand, Operation, parseContentStream, writeOperand, writeOperation } from './contentStream';

/**
 * Redacción por contenido (ADR-0103). Reescribe el flujo de contenido de una página para quitar, de forma
 * irreversible, lo que queda bajo las cajas de redacción:
 * - **Texto:** se quita cada glifo cuya caja cae en la redacción y el resto de la línea se deja en su sitio compensando
 *   el avance con ajustes de `TJ`. El texto quitado no queda en el archivo.
 * - **Gráficos vectoriales:** se quitan los trazados que caen enteros dentro de la caja.
 * - **Lo que no se puede editar con precisión** (imágenes, formularios XObject, sombreados) se anota para que quien
 *   llama use la alternativa segura (rasterizar la página con las cajas en negro).
 * Después se dibuja la caja negra opaca sobre todo.
 */

export interface RedactRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RedactionResult {
  pdfBytes: Uint8Array;
  removedGlyphs: number;
  removedPaths: number;
  /** Por qué la página necesita rasterizarse (vacío si la edición bastó). */
  rasterReasons: string[];
  /** Fuentes sin anchos propios: las cajas de sus glifos son aproximadas. */
  estimatedFonts: string[];
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** a × b en la convención de filas de PDF: primero a y después b. */
const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

const apply = (m: Matrix, x: number, y: number): [number, number] => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boxOfPoints = (pts: [number, number][]): Box => ({
  x0: Math.min(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])),
  x1: Math.max(...pts.map((p) => p[0])),
  y1: Math.max(...pts.map((p) => p[1])),
});

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const intersection = (a: Box, b: Box): Box => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
const inside = (inner: Box, outer: Box, tol = 0.5) => inner.x0 >= outer.x0 - tol && inner.y0 >= outer.y0 - tol && inner.x1 <= outer.x1 + tol && inner.y1 <= outer.y1 + tol;

/** Fracción mínima de un glifo que debe caer en la redacción para quitarlo. */
const GLYPH_OVERLAP = 0.3;
const PAD = 0.5;

// ── Fuentes ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface FontInfo {
  codeBytes: 1 | 2;
  width: (code: number) => number;
  ascent: number;
  descent: number;
  estimated: boolean;
  name: string;
}

const num = (o: unknown): number | undefined => (o instanceof PDFNumber ? o.asNumber() : undefined);

function buildFont(doc: PDFDocument, dict: PDFDict, name: string): FontInfo {
  const ctx = doc.context;
  const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() ?? '';
  const baseFont = dict.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.asString().replace(/^\//, '') ?? '';
  let descriptor = dict.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
  let ascent = 900;
  let descent = -220;

  if (subtype === '/Type0') {
    const desc = dict.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)?.lookupMaybe(0, PDFDict);
    descriptor = desc?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict) ?? descriptor;
    ascent = num(descriptor?.get(PDFName.of('Ascent'))) ?? ascent;
    descent = num(descriptor?.get(PDFName.of('Descent'))) ?? descent;
    const dw = num(desc?.get(PDFName.of('DW'))) ?? 1000;
    const widths = new Map<number, number>();
    const w = desc?.lookupMaybe(PDFName.of('W'), PDFArray);
    if (w) {
      for (let i = 0; i < w.size(); ) {
        const first = num(ctx.lookup(w.get(i)));
        const next = ctx.lookup(w.get(i + 1));
        if (first === undefined) break;
        if (next instanceof PDFArray) {
          next.asArray().forEach((v, k) => widths.set(first + k, num(ctx.lookup(v)) ?? dw));
          i += 2;
        } else {
          const last = num(next);
          const width = num(ctx.lookup(w.get(i + 2)));
          if (last === undefined || width === undefined) break;
          for (let c = first; c <= last && c - first < 70000; c++) widths.set(c, width);
          i += 3;
        }
      }
    }
    return { codeBytes: 2, width: (c) => widths.get(c) ?? dw, ascent, descent, estimated: false, name };
  }

  ascent = num(descriptor?.get(PDFName.of('Ascent'))) ?? ascent;
  descent = num(descriptor?.get(PDFName.of('Descent'))) ?? descent;
  const first = num(dict.get(PDFName.of('FirstChar'))) ?? 0;
  const widthsArr = dict.lookupMaybe(PDFName.of('Widths'), PDFArray);
  const missing = num(descriptor?.get(PDFName.of('MissingWidth'))) ?? 0;
  if (widthsArr) {
    const widths = widthsArr.asArray().map((v) => num(ctx.lookup(v)) ?? 0);
    return { codeBytes: 1, width: (c) => (c >= first && c - first < widths.length ? widths[c - first] : missing), ascent, descent, estimated: false, name };
  }
  // Fuentes estándar sin /Widths: Helvetica con su tabla; Courier es monoespaciada; el resto se aproxima
  const base = baseFont.toLowerCase();
  if (base.includes('courier')) return { codeBytes: 1, width: () => 600, ascent, descent, estimated: false, name };
  if (base.includes('helvetica') || base.includes('arial')) {
    return { codeBytes: 1, width: (c) => getHelveticaCharWidth(String.fromCharCode(c), 1000), ascent, descent, estimated: false, name };
  }
  return { codeBytes: 1, width: () => 500, ascent, descent, estimated: true, name };
}

// ── Contenido de la página ──────────────────────────────────────────────────────────────────────────────────────────

function pageContentString(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  const streams: PDFStream[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const s = contents.lookupMaybe(i, PDFStream);
      if (s) streams.push(s);
    }
  } else if (contents instanceof PDFStream) streams.push(contents);
  return streams
    .map((s) => {
      const bytes = s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : (s as PDFStream).getContents();
      return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    })
    .join('\n');
}

const latin1Bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

interface TextState {
  font: FontInfo | null;
  size: number;
  tc: number;
  tw: number;
  th: number;
  tl: number;
  rise: number;
  tm: Matrix;
  tlm: Matrix;
}

const PATH_OPS = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're']);
const PAINT_OPS = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n']);

/**
 * Edita el contenido de una página. `rects` están en el espacio de usuario de la página (sin girar). No dibuja las
 * cajas negras: eso lo hace `drawBlackBoxes`.
 */
export async function redactPageContent(pdfBytes: Uint8Array, pageIndex: number, rects: RedactRect[]): Promise<RedactionResult> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(pageIndex);
  const boxes: Box[] = rects.map((r) => ({ x0: Math.min(r.x0, r.x1) - PAD, y0: Math.min(r.y0, r.y1) - PAD, x1: Math.max(r.x0, r.x1) + PAD, y1: Math.max(r.y0, r.y1) + PAD }));

  const resources = page.node.Resources();
  const fonts = new Map<string, FontInfo>();
  const xobjects = new Map<string, string>();
  const fontDict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
  for (const [key, value] of fontDict?.entries() ?? []) {
    const fd = doc.context.lookupMaybe(value, PDFDict);
    if (fd) fonts.set(key.asString().replace(/^\//, ''), buildFont(doc, fd, key.asString().replace(/^\//, '')));
  }
  const xoDict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  for (const [key, value] of xoDict?.entries() ?? []) {
    const xo = doc.context.lookup(value);
    const dict = xo instanceof PDFStream ? xo.dict : undefined;
    xobjects.set(key.asString().replace(/^\//, ''), dict?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString().replace(/^\//, '') ?? '');
  }

  const ops = parseContentStream(pageContentString(doc, pageIndex));
  const out: string[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const text: TextState = { font: null, size: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0, tm: IDENTITY, tlm: IDENTITY };
  let pathOps: string[] = [];
  let pathPts: [number, number][] = [];
  let pathClip = false;
  const result = { removedGlyphs: 0, removedPaths: 0, rasterReasons: new Set<string>(), estimatedFonts: new Set<string>() };

  const addPoint = (x: number, y: number) => pathPts.push(apply(ctm, x, y));
  const n = (o: Operand | undefined) => (o && o.t === 'num' ? o.v : 0);

  /** Caja en el espacio de usuario de un glifo de ancho `w` (milésimas) con el estado de texto actual. */
  const glyphBox = (w: number): Box => {
    const f = text.font!;
    const trm = mul([text.size * text.th, 0, 0, text.size, 0, text.rise], mul(text.tm, ctm));
    return boxOfPoints([
      apply(trm, 0, f.descent / 1000),
      apply(trm, w / 1000, f.descent / 1000),
      apply(trm, w / 1000, f.ascent / 1000),
      apply(trm, 0, f.ascent / 1000),
    ]);
  };
  const advance = (w: number, isSpace: boolean) => {
    const tx = ((w / 1000) * text.size + text.tc + (isSpace ? text.tw : 0)) * text.th;
    text.tm = mul([1, 0, 0, 1, tx, 0], text.tm);
    return tx;
  };
  const shouldRemove = (b: Box) => {
    const g = area(b);
    if (g <= 0) return false;
    return boxes.some((r) => area(intersection(b, r)) / g >= GLYPH_OVERLAP && intersection(b, r).x1 > intersection(b, r).x0);
  };

  /** Procesa las cadenas de Tj o TJ. Devuelve el TJ nuevo si se quitó algún glifo. */
  const processText = (items: Operand[]): Operand[] | null => {
    const f = text.font;
    if (!f || !(text.size > 0)) {
      // Sin fuente conocida: el avance no se puede seguir, no se edita
      return null;
    }
    if (f.estimated) result.estimatedFonts.add(f.name);
    const elements: Operand[] = [];
    let current = '';
    let pending = 0;
    let removedHere = 0;
    const flushString = () => {
      if (current) {
        if (pending !== 0) elements.push({ t: 'num', v: pending });
        pending = 0;
        elements.push({ t: 'str', v: current });
        current = '';
      }
    };
    for (const it of items) {
      if (it.t === 'num') {
        // Ajuste de TJ: desplaza el texto (positivo = a la izquierda)
        text.tm = mul([1, 0, 0, 1, (-it.v / 1000) * text.size * text.th, 0], text.tm);
        pending += it.v;
        continue;
      }
      if (it.t !== 'str') continue;
      const s = it.v;
      for (let i = 0; i < s.length; i += f.codeBytes) {
        const piece = s.slice(i, i + f.codeBytes);
        const code = f.codeBytes === 2 ? (piece.charCodeAt(0) << 8) | (piece.charCodeAt(1) || 0) : piece.charCodeAt(0);
        const w = f.width(code);
        const isSpace = f.codeBytes === 1 && code === 32;
        const remove = shouldRemove(glyphBox(w));
        const tx = advance(w, isSpace);
        if (remove) {
          removedHere++;
          // El resto de la línea no se mueve: el avance del glifo quitado pasa a un ajuste de TJ
          flushString();
          pending += (-tx * 1000) / (text.size * text.th);
        } else {
          if (!current && pending !== 0 && elements.length === 0) {
            elements.push({ t: 'num', v: pending });
            pending = 0;
          }
          current += piece;
        }
      }
    }
    flushString();
    if (pending !== 0) elements.push({ t: 'num', v: pending });
    if (removedHere === 0) return null;
    result.removedGlyphs += removedHere;
    return elements;
  };

  const flushPath = (paint: Operation | null) => {
    if (pathOps.length === 0 && !paint) return;
    const keep = !paint || paint.op === 'n' || pathClip || pathPts.length === 0 || !boxes.some((b) => inside(boxOfPoints(pathPts), b));
    if (keep) {
      out.push(...pathOps);
      if (paint) out.push(paint.src);
    } else {
      result.removedPaths++;
    }
    pathOps = [];
    pathPts = [];
    pathClip = false;
  };

  for (const o of ops) {
    const op = o.op;
    if (PATH_OPS.has(op)) {
      const a = o.operands;
      if (op === 'm' || op === 'l') {
        addPoint(n(a[0]), n(a[1]));
      } else if (op === 'c') {
        addPoint(n(a[0]), n(a[1]));
        addPoint(n(a[2]), n(a[3]));
        addPoint(n(a[4]), n(a[5]));
      } else if (op === 'v' || op === 'y') {
        addPoint(n(a[0]), n(a[1]));
        addPoint(n(a[2]), n(a[3]));
      } else if (op === 're') {
        const [x, y, w, h] = [n(a[0]), n(a[1]), n(a[2]), n(a[3])];
        addPoint(x, y);
        addPoint(x + w, y);
        addPoint(x + w, y + h);
        addPoint(x, y + h);
      }
      pathOps.push(o.src);
      continue;
    }
    if (op === 'W' || op === 'W*') {
      pathClip = true;
      pathOps.push(o.src);
      continue;
    }
    if (PAINT_OPS.has(op)) {
      flushPath(o);
      continue;
    }
    // Cualquier otra operación cierra un trazado que no llegó a pintarse
    if (pathOps.length) flushPath(null);

    switch (op) {
      case 'q':
        stack.push(ctm);
        out.push(o.src);
        break;
      case 'Q':
        ctm = stack.pop() ?? ctm;
        out.push(o.src);
        break;
      case 'cm':
        ctm = mul([n(o.operands[0]), n(o.operands[1]), n(o.operands[2]), n(o.operands[3]), n(o.operands[4]), n(o.operands[5])], ctm);
        out.push(o.src);
        break;
      case 'BT':
        text.tm = IDENTITY;
        text.tlm = IDENTITY;
        out.push(o.src);
        break;
      case 'Tf': {
        const name = o.operands[0]?.t === 'name' ? (o.operands[0] as { v: string }).v : '';
        text.font = fonts.get(name) ?? null;
        text.size = n(o.operands[1]);
        out.push(o.src);
        break;
      }
      case 'Tc':
        text.tc = n(o.operands[0]);
        out.push(o.src);
        break;
      case 'Tw':
        text.tw = n(o.operands[0]);
        out.push(o.src);
        break;
      case 'Tz':
        text.th = n(o.operands[0]) / 100;
        out.push(o.src);
        break;
      case 'TL':
        text.tl = n(o.operands[0]);
        out.push(o.src);
        break;
      case 'Ts':
        text.rise = n(o.operands[0]);
        out.push(o.src);
        break;
      case 'Td':
      case 'TD':
        if (op === 'TD') text.tl = -n(o.operands[1]);
        text.tlm = mul([1, 0, 0, 1, n(o.operands[0]), n(o.operands[1])], text.tlm);
        text.tm = text.tlm;
        out.push(o.src);
        break;
      case 'Tm':
        text.tm = [n(o.operands[0]), n(o.operands[1]), n(o.operands[2]), n(o.operands[3]), n(o.operands[4]), n(o.operands[5])];
        text.tlm = text.tm;
        out.push(o.src);
        break;
      case 'T*':
        text.tlm = mul([1, 0, 0, 1, 0, -text.tl], text.tlm);
        text.tm = text.tlm;
        out.push(o.src);
        break;
      case 'Tj':
      case 'TJ': {
        const items = op === 'Tj' ? o.operands : o.operands[0]?.t === 'arr' ? (o.operands[0] as { items: Operand[] }).items : [];
        const edited = processText(items);
        out.push(edited ? writeOperation('TJ', [{ t: 'arr', items: edited }]) : o.src);
        break;
      }
      case "'":
      case '"': {
        if (op === '"') {
          text.tw = n(o.operands[0]);
          text.tc = n(o.operands[1]);
        }
        text.tlm = mul([1, 0, 0, 1, 0, -text.tl], text.tlm);
        text.tm = text.tlm;
        const str = o.operands[o.operands.length - 1];
        const edited = str ? processText([str]) : null;
        if (edited) {
          const pre = op === '"' ? `${writeOperand(o.operands[0])} Tw ${writeOperand(o.operands[1])} Tc ` : '';
          out.push(`${pre}T* ${writeOperation('TJ', [{ t: 'arr', items: edited }])}`);
        } else out.push(o.src);
        break;
      }
      case 'Do': {
        const name = o.operands[0]?.t === 'name' ? (o.operands[0] as { v: string }).v : '';
        const kind = xobjects.get(name) ?? '';
        // El XObject ocupa el cuadrado unidad bajo la matriz actual
        const b = boxOfPoints([apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 1, 1), apply(ctm, 0, 1)]);
        if (boxes.some((r) => area(intersection(b, r)) > 0 && intersection(b, r).x1 > intersection(b, r).x0)) {
          result.rasterReasons.add(kind === 'Image' ? 'an image overlaps the redaction' : `a ${kind || 'graphic'} object overlaps the redaction`);
        }
        out.push(o.src);
        break;
      }
      case 'BI': {
        const b = boxOfPoints([apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 1, 1), apply(ctm, 0, 1)]);
        if (boxes.some((r) => area(intersection(b, r)) > 0 && intersection(b, r).x1 > intersection(b, r).x0)) result.rasterReasons.add('an inline image overlaps the redaction');
        out.push(o.src);
        break;
      }
      case 'sh':
        result.rasterReasons.add('a shading overlaps the page');
        out.push(o.src);
        break;
      case 'BDC':
      case 'DP': {
        // Texto alternativo y reemplazos de texto del contenido marcado: pueden repetir lo que se redacta
        const cleaned = o.src.replace(/\/(ActualText|Alt|E)\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)/g, '/$1 ()');
        out.push(cleaned);
        break;
      }
      default:
        out.push(o.src);
    }
  }
  if (pathOps.length) flushPath(null);

  // El contenido nuevo reemplaza al antiguo: una sola corriente comprimida
  const content = `q\n${out.join('\n')}\nQ\n`;
  const stream = doc.context.flateStream(latin1Bytes(content));
  page.node.set(PDFName.of('Contents'), doc.context.register(stream));
  return {
    pdfBytes: await doc.save(),
    removedGlyphs: result.removedGlyphs,
    removedPaths: result.removedPaths,
    rasterReasons: [...result.rasterReasons],
    estimatedFonts: [...result.estimatedFonts],
  };
}

/** Dibuja las cajas negras opacas de las redacciones al final del contenido de la página. */
export async function drawBlackBoxes(pdfBytes: Uint8Array, pageIndex: number, rects: RedactRect[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(pageIndex);
  const lines = ['q', '0 0 0 rg', '1 i'];
  for (const r of rects) {
    const x = Math.min(r.x0, r.x1);
    const y = Math.min(r.y0, r.y1);
    lines.push(`${x.toFixed(3)} ${y.toFixed(3)} ${Math.abs(r.x1 - r.x0).toFixed(3)} ${Math.abs(r.y1 - r.y0).toFixed(3)} re f`);
  }
  lines.push('Q');
  page.node.normalize();
  const ref = doc.context.register(doc.context.flateStream(latin1Bytes(lines.join('\n'))));
  const contents = page.node.Contents();
  if (contents instanceof PDFArray) contents.push(ref);
  else page.node.addContentStream(ref);
  return doc.save();
}

