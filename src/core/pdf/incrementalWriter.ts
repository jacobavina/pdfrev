import { effectiveTextSize } from '../markup/autosizeText';
import { countSymbolOf } from '../markup/countSymbols';
import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFRef,
  PDFDict,
  PDFString,
  PDFHexString,
  PDFObject,
} from 'pdf-lib';
import { LineEndingStyle, Markup, MarkupStatus, PageCalibration, MeasurementViewport } from '../../types/markup';
import { DIMENSION_EXTENSION_GAP, DIMENSION_EXTENSION_OVERSHOOT } from '../markup/dimension';
import { viewportArrayFor, measureDictFor, readPageCalibration } from './pdfScale';
import { DEFAULT_PAGE_CALIBRATION } from '../measurements/calculate';
import { markupTypeLabel } from '../markup/typeLabels';
import { stampById } from '../markup/stamps';
import { measureLineEndings, MEASURE_LEADER_EXTENSION_PT } from '../markup/measureCaption';
import {
  FieldType,
  fieldOptions,
  fieldTypeDef,
  fieldTypeOf,
  isFieldChecked,
  radioExportValue,
} from '../markup/formFields';
import {
  emitMarkupOperators,
  calloutPdfLayout,
  normalizedToPdfCoordinates,
  parseCssColorRgb,
  PageTransformInfo,
} from './operators';

export interface NewPdfObject {
  objNum: number;
  gen: number;
  content: Uint8Array;
}

export interface IncrementalSaveOptions {
  authorDefault?: string;
  /**
   * Ids de las anotaciones que se importaron del PDF al abrirlo. Las que ya no estén en el modelo
   * se interpretan como borradas por el usuario y se retiran de /Annots al guardar.
   */
  importedIds?: string[];
  /**
   * Escalas que el usuario definió en REA, por página (ADR-0025): se escriben como /VP /Measure en la página.
   * Las páginas sin entrada conservan su /VP original (p. ej. calibrado en Revu).
   */
  calibrations?: Record<number, PageCalibration>;
  /**
   * Viewports de medición por página (ADR-0076): se escriben en el array /VP de la página.
   */
  viewports?: Record<number, MeasurementViewport[]>;
  /** Capas de marcas ocultas en REA: su /OCG se escribe apagado (ADR-0046). */
  hiddenLayers?: string[];
  /** Bytes de los adjuntos por clave (`customFields.attachmentKey`), para embeberlos (ADR-0027). */
  attachments?: Record<string, { name: string; mime: string; bytes: Uint8Array }>;
}

/**
 * Formatea una fecha ISO a la representación canónica de fechas en PDF (D:YYYYMMDDHHmmSSZ).
 */
export function formatPdfDate(isoDateStr?: string): string {
  const d = isoDateStr ? new Date(isoDateStr) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `(D:${yyyy}${mm}${dd}${hh}${min}${ss}Z)`;
}

/**
 * Serializa una cadena como string de PDF.
 * ASCII imprimible: literal con (, ) y \ escapados.
 * Cualquier otro carácter (acentos, ñ, emojis): string hexadecimal UTF-16BE con BOM, que es la
 * única forma que Acrobat y Revu leen correctamente (ISO 32000-1 §7.9.2.2).
 */
export function escapePdfString(str: string): string {
  if (/[^\x20-\x7E]/.test(str)) {
    let hex = 'FEFF';
    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
    }
    return `<${hex}>`;
  }
  const sanitized = str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  return `(${sanitized})`;
}

/**
 * Serializa una clave arbitraria como nombre PDF válido, codificando con #xx los bytes UTF-8
 * de delimitadores, espacios y caracteres no ASCII (ISO 32000-1 §7.3.5).
 */
export function toPdfName(key: string): string {
  const bytes = new TextEncoder().encode(key);
  let out = '/';
  for (const b of bytes) {
    const isRegular = b > 0x20 && b < 0x7f && !'()<>[]{}/%#'.includes(String.fromCharCode(b));
    out += isRegular ? String.fromCharCode(b) : `#${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/**
 * Identificador estable de una anotación existente: su /NM, o su referencia de objeto si no tiene /NM.
 * Debe coincidir con el que asigna `importPdfAnnotations` al leer.
 */
export function annotationKeyFor(dict: PDFDict, ref?: PDFRef): string | undefined {
  const nm = dict.get(PDFName.of('NM'));
  if (nm instanceof PDFString || nm instanceof PDFHexString) {
    const text = nm.decodeText();
    if (text) return text;
  }
  return ref ? `pdfobj-${ref.objectNumber}-${ref.generationNumber}` : undefined;
}

/**
 * Campo de firma ya firmado (ADR-0058): /FT /Sig y /V con su diccionario de firma, propios o heredados del /Parent.
 * Su objeto queda dentro del /ByteRange de la firma, así que ningún guardado posterior lo retira ni lo reescribe.
 */
export function isSignedSignatureField(dict: PDFDict): boolean {
  let ft: PDFObject | undefined;
  let v: PDFObject | undefined;
  let cur: PDFDict | undefined = dict;
  const seen = new Set<PDFDict>();
  for (let depth = 0; cur && depth < 8 && !seen.has(cur); depth++) {
    seen.add(cur);
    if (ft === undefined) ft = cur.lookup(PDFName.of('FT'));
    if (v === undefined) v = cur.lookup(PDFName.of('V'));
    const parent: PDFObject | undefined = cur.lookup(PDFName.of('Parent'));
    cur = parent instanceof PDFDict ? parent : undefined;
  }
  return ft instanceof PDFName && ft.asString() === '/Sig' && v instanceof PDFDict;
}

/**
 * Concatena una lista de Uint8Array en un único búfer continuo.
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Escritor de Actualización Incremental de PDF (ISO 32000-1 §7.5.6).
 * Preserva el 100% de los bytes originales como prefijo inmutable.
 */
export class IncrementalWriter {
  public readonly originalBytes: Uint8Array;
  private newObjects: NewPdfObject[] = [];
  public prevStartXref: number = 0;
  public prevSize: number = 10;
  public rootRef: string | null = null;
  public infoRef: string | null = null;
  public nextObjNum: number = 10;

  constructor(originalBytes: Uint8Array) {
    this.originalBytes = originalBytes;
    this.parseOriginalTrailer();
  }

  private parseOriginalTrailer(): void {
    // Buscar startxref en los últimos 4096 bytes (o todo el archivo si es menor)
    const searchSliceLen = Math.min(this.originalBytes.length, 8192);
    const tailSlice = this.originalBytes.subarray(this.originalBytes.length - searchSliceLen);
    const tailStr = new TextDecoder('latin1').decode(tailSlice);

    const startXrefLocalIdx = tailStr.lastIndexOf('startxref');
    if (startXrefLocalIdx === -1) {
      // Búsqueda exhaustiva en todo el archivo como respaldo
      const fullStr = new TextDecoder('latin1').decode(this.originalBytes);
      const globalStartXrefIdx = fullStr.lastIndexOf('startxref');
      if (globalStartXrefIdx === -1) {
        throw new Error('Invalid PDF structure: startxref not found');
      }
      this.extractTrailerFromOffset(fullStr, globalStartXrefIdx);
      return;
    }

    const globalStartXrefIdx = this.originalBytes.length - searchSliceLen + startXrefLocalIdx;
    const fullStr = new TextDecoder('latin1').decode(this.originalBytes);
    this.extractTrailerFromOffset(fullStr, globalStartXrefIdx);
  }

  private extractTrailerFromOffset(raw: string, startXrefIdx: number): void {
    const afterStartXref = raw.slice(startXrefIdx + 9).trim();
    const prevOffsetMatch = afterStartXref.match(/^(\d+)/);
    if (!prevOffsetMatch) {
      throw new Error('Could not read the numeric startxref offset');
    }
    this.prevStartXref = parseInt(prevOffsetMatch[1], 10);

    const trailerIdx = raw.lastIndexOf('trailer', startXrefIdx);
    if (trailerIdx !== -1) {
      const trailerChunk = raw.slice(trailerIdx, startXrefIdx);
      const sizeMatch = trailerChunk.match(/\/Size\s+(\d+)/);
      this.prevSize = sizeMatch ? parseInt(sizeMatch[1], 10) : 10;

      const rootMatch = trailerChunk.match(/\/Root\s+(\d+\s+\d+\s+R)/);
      this.rootRef = rootMatch ? rootMatch[1] : null;

      const infoMatch = trailerChunk.match(/\/Info\s+(\d+\s+\d+\s+R)/);
      this.infoRef = infoMatch ? infoMatch[1] : null;
    } else {
      // PDF con XRef Stream (PDF 1.5+)
      const tail = raw.slice(Math.max(0, this.originalBytes.length - 4096));
      const sizeMatch = tail.match(/\/Size\s+(\d+)/);
      this.prevSize = sizeMatch ? parseInt(sizeMatch[1], 10) : 20;

      const rootMatch = tail.match(/\/Root\s+(\d+\s+\d+\s+R)/);
      this.rootRef = rootMatch ? rootMatch[1] : '1 0 R';
      this.infoRef = null;
    }

    this.nextObjNum = this.prevSize;
  }

  public allocateObjectNumber(): number {
    const num = this.nextObjNum;
    this.nextObjNum++;
    return num;
  }

  public addObject(objNum: number, bodyStringOrBytes: string | Uint8Array): void {
    const encoder = new TextEncoder();
    const bodyBuf =
      typeof bodyStringOrBytes === 'string'
        ? encoder.encode(bodyStringOrBytes)
        : bodyStringOrBytes;

    const header = encoder.encode(`${objNum} 0 obj\n`);
    const footer = encoder.encode(`\nendobj\n`);
    const fullObj = concatUint8Arrays([header, bodyBuf, footer]);

    this.newObjects.push({
      objNum,
      gen: 0,
      content: fullObj,
    });
  }

  public build(): Uint8Array {
    const chunks: Uint8Array[] = [this.originalBytes];
    const endsWithNewline =
      this.originalBytes.length > 0 &&
      this.originalBytes[this.originalBytes.length - 1] === 10;

    const encoder = new TextEncoder();
    if (!endsWithNewline) {
      chunks.push(encoder.encode('\n'));
    }

    let currentOffset = this.originalBytes.length + (endsWithNewline ? 0 : 1);
    const xrefEntries: Array<{ objNum: number; gen: number; offset: number }> = [];

    // Escribir objetos nuevos y actualizados
    for (const obj of this.newObjects) {
      xrefEntries.push({
        objNum: obj.objNum,
        gen: obj.gen,
        offset: currentOffset,
      });
      chunks.push(obj.content);
      currentOffset += obj.content.length;
    }

    // Ordenar entradas de la tabla xref por número de objeto
    xrefEntries.sort((a, b) => a.objNum - b.objNum);

    // Escribir sección xref clásica
    const startXrefOffset = currentOffset;
    let xrefStr = 'xref\n';

    let i = 0;
    while (i < xrefEntries.length) {
      let j = i;
      while (
        j + 1 < xrefEntries.length &&
        xrefEntries[j + 1].objNum === xrefEntries[j].objNum + 1
      ) {
        j++;
      }
      const count = j - i + 1;
      xrefStr += `${xrefEntries[i].objNum} ${count}\n`;
      for (let k = i; k <= j; k++) {
        const offsetStr = String(xrefEntries[k].offset).padStart(10, '0');
        const genStr = String(xrefEntries[k].gen).padStart(5, '0');
        xrefStr += `${offsetStr} ${genStr} n \n`;
      }
      i = j + 1;
    }

    const xrefBuf = encoder.encode(xrefStr);
    chunks.push(xrefBuf);
    currentOffset += xrefBuf.length;

    // Escribir trailer nuevo apuntando a /Prev
    const highestObjNum =
      xrefEntries.length > 0 ? xrefEntries[xrefEntries.length - 1].objNum : 0;
    const newSize = Math.max(this.nextObjNum, highestObjNum + 1);

    let trailerStr = `trailer\n<<\n  /Size ${newSize}\n`;
    if (this.rootRef) trailerStr += `  /Root ${this.rootRef}\n`;
    if (this.infoRef) trailerStr += `  /Info ${this.infoRef}\n`;
    trailerStr += `  /Prev ${this.prevStartXref}\n>>\nstartxref\n${startXrefOffset}\n%%EOF\n`;

    const trailerBuf = encoder.encode(trailerStr);
    chunks.push(trailerBuf);

    const finalBuffer = concatUint8Arrays(chunks);

    // Verificación estricta de invariante dura: los bytes originales deben ser prefijo idéntico
    const prefixMatches = this.validateOriginalPrefix(finalBuffer);
    if (!prefixMatches) {
      throw new Error(
        '[IncrementalWriter] ISO 32000-1 invariant violated: the original bytes were not preserved'
      );
    }

    return finalBuffer;
  }

  private validateOriginalPrefix(finalBuffer: Uint8Array): boolean {
    if (finalBuffer.length < this.originalBytes.length) return false;
    for (let idx = 0; idx < this.originalBytes.length; idx++) {
      if (finalBuffer[idx] !== this.originalBytes[idx]) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Guarda marcas en el PDF mediante actualización incremental estándar ISO 32000-1.
 * Crea anotaciones con apariencia /AP, metadatos /REA y estados de revisión /StateModel Review.
 */
export async function saveIncrementalMarkups(
  originalBytes: Uint8Array,
  markups: Markup[],
  transformInfoMap: Record<number, PageTransformInfo> = {},
  options: IncrementalSaveOptions = {}
): Promise<Uint8Array> {
  const writer = new IncrementalWriter(originalBytes);

  // Cargar el documento original con pdf-lib para inspeccionar estructura de páginas y /Annots
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();

  // Campos de firma ya firmados (ADR-0058): se conservan tal cual, con su objeto original, aunque su marca siga en el
  // modelo. La marca está bloqueada: sus cambios de geometría o estilo no se escriben.
  const signedKeys = new Set<string>();
  const signedObjNums = new Set<number>();
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) {
      const item = annots.get(i);
      const dict = item instanceof PDFRef ? pdfDoc.context.lookup(item) : item;
      if (!(dict instanceof PDFDict) || !isSignedSignatureField(dict)) continue;
      const key = annotationKeyFor(dict, item instanceof PDFRef ? item : undefined);
      if (key !== undefined) signedKeys.add(key);
      if (item instanceof PDFRef) signedObjNums.add(item.objectNumber);
    }
  }
  const writable = markups.filter((m) => {
    const foreignNum = m.customFields?.foreignWidgetObjNum;
    return !signedKeys.has(m.id) && !(typeof foreignNum === 'number' && signedObjNums.has(foreignNum));
  });

  // Capas de marcas como contenido opcional (ADR-0046): un /OCG por capa, que Revu y Acrobat listan en su panel
  // de capas y con el que muestran u ocultan las anotaciones
  const layerOcg = new Map<string, number>();
  for (const m of writable) {
    if (m.layer && !layerOcg.has(m.layer)) layerOcg.set(m.layer, writer.allocateObjectNumber());
  }
  for (const [name, num] of layerOcg) {
    writer.addObject(num, `<< /Type /OCG /Name ${escapePdfString(name)} /REA << /v 1 /layer ${escapePdfString(name)} >> >>`);
  }

  // Ids que el modelo reescribe en este guardado y que el usuario borró desde la importación
  const replacedIds = new Set<string>([...writable.map((m) => m.id), ...(options.importedIds ?? [])]);

  // Agrupar marcas por índice de página
  const markupsByPage = new Map<number, Markup[]>();
  for (const m of writable) {
    const list = markupsByPage.get(m.pageIndex) || [];
    list.push(m);
    markupsByPage.set(m.pageIndex, list);
  }

  // Formularios (ADR-0027 / ADR-0055): campos de primer nivel, grupos de botones de opción y padres /Parent ajenos
  const newFieldRefs: string[] = [];
  const foreignParentsToUpdate = new Map<number, { ft: FieldType; value: string }>();
  const radioGroups = new Map<string, { objNum: number; kids: string[]; value: string | null }>();
  for (const m of writable) {
    if (m.type === 'formField' && fieldTypeOf(m) === 'radio' && typeof m.customFields?.foreignParentObjNum !== 'number') {
      const group = String(m.customFields?.fieldName ?? 'Group1');
      if (!radioGroups.has(group)) radioGroups.set(group, { objNum: writer.allocateObjectNumber(), kids: [], value: null });
      if (isFieldChecked(m)) radioGroups.get(group)!.value = radioExportValue(m);
    }
  }

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const pageMarkups = markupsByPage.get(pIdx) || [];
    const page = pages[pIdx];
    const pageRef = page.ref;
    const pageObjNum = pageRef.objectNumber;

    const transform = transformInfoMap[pIdx] || {
      rotation: (page.getRotation().angle as 0 | 90 | 180 | 270) || 0,
      widthPt: page.getWidth(),
      heightPt: page.getHeight(),
      originX: 0,
      originY: 0,
    };

    // Escala vigente de la página para el /Measure de cada medición (ADR-0030): la definida en REA, la que ya
    // trae el PDF o, sin ninguna, milímetros de papel (lo mismo que muestra el visor)
    const effectiveCalibration =
      options.calibrations?.[pIdx] ?? readPageCalibration(page.node, transform.rotation) ?? DEFAULT_PAGE_CALIBRATION;

    // Anotaciones existentes en la página. Se retiran de /Annots (para reescribirlas desde el modelo,
    // sin duplicar) las propias de REA (/REA), las que el modelo contiene (por /NM o referencia) y las
    // importadas que el usuario borró; con ellas, sus estados de revisión y popups dependientes.
    // Todo lo demás (anotaciones ajenas no importadas, enlaces, widgets, respuestas) se conserva intacto.
    const existingAnnotsRef = page.node.Annots();
    const existingItems: { obj: PDFObject; dict?: PDFDict; ref?: PDFRef; drop: boolean }[] = [];
    if (existingAnnotsRef instanceof PDFArray) {
      for (let i = 0; i < existingAnnotsRef.size(); i++) {
        const item = existingAnnotsRef.get(i);
        const resolved = item instanceof PDFRef ? pdfDoc.context.lookup(item) : item;
        existingItems.push({
          obj: item,
          dict: resolved instanceof PDFDict ? resolved : undefined,
          ref: item instanceof PDFRef ? item : undefined,
          drop: false,
        });
      }
    }

    const droppedRefKeys = new Set<string>();
    const refKey = (r: PDFRef) => `${r.objectNumber} ${r.generationNumber}`;
    for (const it of existingItems) {
      if (!it.dict || it.dict.get(PDFName.of('StateModel')) !== undefined) continue;
      if (isSignedSignatureField(it.dict)) continue;
      const irt = it.dict.get(PDFName.of('IRT'));
      const rt = it.dict.get(PDFName.of('RT'));
      if (irt instanceof PDFRef && rt?.toString() !== '/Group') continue;
      if (it.dict.get(PDFName.of('Subtype'))?.toString() === '/Popup') continue;
      const isRea = it.dict.get(PDFName.of('REA')) instanceof PDFDict;
      const key = annotationKeyFor(it.dict, it.ref);
      if (isRea || (key !== undefined && replacedIds.has(key))) {
        it.drop = true;
        if (it.ref) droppedRefKeys.add(refKey(it.ref));
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const it of existingItems) {
        if (!it.dict || it.drop) continue;
        const irt = it.dict.get(PDFName.of('IRT'));
        const rt = it.dict.get(PDFName.of('RT'));
        const parent = it.dict.get(PDFName.of('Parent'));
        const isReviewState = it.dict.get(PDFName.of('StateModel')) !== undefined;
        const isReply = !isReviewState && irt instanceof PDFRef && rt?.toString() !== '/Group';
        const isPopup = it.dict.get(PDFName.of('Subtype'))?.toString() === '/Popup';
        if (
          ((isReviewState || isReply) && irt instanceof PDFRef && droppedRefKeys.has(refKey(irt))) ||
          (isPopup && parent instanceof PDFRef && droppedRefKeys.has(refKey(parent)))
        ) {
          it.drop = true;
          if (it.ref) droppedRefKeys.add(refKey(it.ref));
          changed = true;
        }
      }
    }
    const keptObjects: PDFObject[] = existingItems.filter((it) => !it.drop).map((it) => it.obj);
    const removedCount = existingItems.length - keptObjects.length;

    const newAnnotRefsList: string[] = [];

    for (const markup of pageMarkups) {
      // 1. Generar emisor de operadores para /AP
      const emitted = emitMarkupOperators(markup, transform);

      // 2. Crear Form XObject para Appearance Stream /AP /N
      const apObjNum = writer.allocateObjectNumber();
      const apStreamBytes = new TextEncoder().encode(emitted.operators);

      let resourcesDict = '<<\n';
      if (emitted.extGState?.bm || emitted.extGState?.ca !== undefined || emitted.extGState?.CA !== undefined) {
        resourcesDict += `    /ExtGState << /GS_HL << /Type /ExtGState /BM ${emitted.extGState.bm || '/Normal'} /ca ${emitted.extGState.ca ?? 1} /CA ${emitted.extGState.CA ?? 1} >> >>\n`;
      }
      // Texto del /AP (cotas, cuadros de texto, llamadas): Helvetica estándar, sin incrustar
      if (emitted.fontName || emitted.boldFontName || emitted.extraFonts) {
        resourcesDict += '    /Font <<';
        if (emitted.fontName) {
          resourcesDict += ` /${emitted.fontName} << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
        }
        for (const [name, base] of Object.entries(emitted.extraFonts ?? {})) {
          resourcesDict += ` /${name} << /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`;
        }
        if (emitted.boldFontName) {
          resourcesDict += ` /${emitted.boldFontName} << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
        }
        resourcesDict += ' >>\n';
      }
      resourcesDict += '  >>';

      const bboxStr = `[${emitted.bbox[0].toFixed(2)} ${emitted.bbox[1].toFixed(2)} ${emitted.bbox[2].toFixed(2)} ${emitted.bbox[3].toFixed(2)}]`;
      const apBody = `<<
  /Type /XObject
  /Subtype /Form
  /BBox ${bboxStr}
  /Resources ${resourcesDict}
  /Length ${apStreamBytes.length}
>>
stream
${emitted.operators}
endstream`;

      writer.addObject(apObjNum, apBody);

      // 3. Crear el objeto de anotación estándar (o reutilizar el número de objeto de un widget AcroForm ajeno)
      const annotObjNum =
        typeof markup.customFields?.foreignWidgetObjNum === 'number'
          ? markup.customFields.foreignWidgetObjNum
          : writer.allocateObjectNumber();
      newAnnotRefsList.push(`${annotObjNum} 0 R`);

      // Diccionario base común
      const strokeParsed = parseCssColorRgb(markup.style.strokeColor);
      const fillParsed = parseCssColorRgb(markup.style.fillColor);
      const strokeWidth =
        markup.type === 'text'
          ? Math.max(0, markup.style.strokeWidth ?? 1)
          : Math.max(1, markup.style.strokeWidth ?? 1);

      let colorEntry = '';
      if (strokeParsed) {
        colorEntry = `/C [${strokeParsed.r.toFixed(3)} ${strokeParsed.g.toFixed(3)} ${strokeParsed.b.toFixed(3)}]`;
      }

      let fillEntry = '';
      if (fillParsed) {
        fillEntry = `/IC [${fillParsed.r.toFixed(3)} ${fillParsed.g.toFixed(3)} ${fillParsed.b.toFixed(3)}]`;
      }

      const rectStr = `[${emitted.bbox[0].toFixed(2)} ${emitted.bbox[1].toFixed(2)} ${emitted.bbox[2].toFixed(2)} ${emitted.bbox[3].toFixed(2)}]`;
      const annotTypeSubtype = getPdfAnnotSubtype(markup);

      // Metadatos REA
      const reaCustomFields: string[] = [];
      if (markup.customFields) {
        for (const [k, v] of Object.entries(markup.customFields)) {
          if (k === 'arcStep') continue;
          if (typeof v === 'number' && Number.isFinite(v)) {
            reaCustomFields.push(`${toPdfName(k)} ${v}`);
          } else if (v !== undefined && v !== null) {
            reaCustomFields.push(`${toPdfName(k)} ${escapePdfString(String(v))}`);
          }
        }
      }

      let reaDict = `<< /v 1 /tool ${escapePdfString(markup.type)}`;
      if (typeof markup.customFields?.arcStep === 'number') {
        reaDict += ` /arcStep ${markup.customFields.arcStep}`;
      }
      if (markup.groupId) {
        reaDict += ` /groupId ${escapePdfString(markup.groupId)}`;
      }
      if (markup.layer) {
        reaDict += ` /layer ${escapePdfString(markup.layer)}`;
      }
      if (markup.style.lineStyle) {
        reaDict += ` /lineStyle ${escapePdfString(markup.style.lineStyle)}`;
      }
      if (markup.style.hatch) {
        reaDict += ` /hatch ${escapePdfString(markup.style.hatch)}`;
      }
      if (markup.style.fontFamily) {
        reaDict += ` /fontFamily ${escapePdfString(markup.style.fontFamily)}`;
      }
      if (markup.style.textColor) {
        reaDict += ` /textColor ${escapePdfString(markup.style.textColor)}`;
      }
      if (markup.style.fillColor === 'transparent' || markup.style.fillColor === 'none') {
        reaDict += ` /noFill 1`;
      } else if (markup.style.fillColor) {
        reaDict += ` /fillColor ${escapePdfString(markup.style.fillColor)}`;
      }
      if (markup.textFormat?.align) {
        reaDict += ` /textAlign ${escapePdfString(markup.textFormat.align)}`;
      }
      if (markup.textFormat?.bold) {
        reaDict += ` /bold 1`;
      }
      if (markup.textFormat?.italic) {
        reaDict += ` /italic 1`;
      }
      // Geometría exacta de REA (ida y vuelta sin pérdidas). /rect fija la caja con la que se escribió: si otra
      // aplicación mueve la anotación, el lector lo detecta y usa la geometría estándar del PDF.
      const numList = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(6)} ${p.y.toFixed(6)}`).join(' ');
      reaDict += ` /pts [${numList(markup.points)}] /rect ${rectStr}`;
      if (markup.leaders && markup.leaders.length > 0) {
        reaDict += ` /leaders [${markup.leaders.map((l) => `[${numList(l)}]`).join(' ')}]`;
      }
      if (markup.cutouts && markup.cutouts.length > 0) {
        reaDict += ` /cutouts [${markup.cutouts.map((c) => `[${numList(c)}]`).join(' ')}]`;
      }
      if (reaCustomFields.length > 0) {
        reaDict += ` /fields << ${reaCustomFields.join(' ')} >>`;
      }
      if (markup.measurement) {
        reaDict += ` /measurement << /type ${escapePdfString(markup.type)} /value ${markup.measurement.value.toFixed(4)} /unit ${escapePdfString(markup.measurement.unit)} /formatted ${escapePdfString(markup.measurement.formatted)}`;
        if (typeof markup.measurement.perimeter === 'number') {
          reaDict += ` /perimeter ${markup.measurement.perimeter.toFixed(4)}`;
        }
        if (typeof markup.measurement.countIndex === 'number') {
          reaDict += ` /countIndex ${markup.measurement.countIndex}`;
        }
        reaDict += ` >>`;
      }
      if (markup.subject) {
        reaDict += ` /subject ${escapePdfString(markup.subject)}`;
      }
      if (typeof markup.unitPrice === 'number' && Number.isFinite(markup.unitPrice)) {
        reaDict += ` /unitPrice ${markup.unitPrice}`;
      }
      if (typeof markup.cost === 'number' && Number.isFinite(markup.cost)) {
        reaDict += ` /cost ${markup.cost}`;
      }
      reaDict += ' >>';

      // Widgets: /T es el nombre del campo (los botones de opción o hijos de un /Parent lo heredan de su padre);
      // casillas y opciones llevan dos apariencias (activada y /Off) y su estado /AS
      const isField = markup.type === 'formField';
      const ft = isField ? fieldTypeOf(markup) : null;
      const foreignParentObjNum =
        typeof markup.customFields?.foreignParentObjNum === 'number' ? markup.customFields.foreignParentObjNum : undefined;
      const customOnName =
        typeof markup.customFields?.onStateName === 'string' && markup.customFields.onStateName
          ? markup.customFields.onStateName
          : undefined;
      const titleLine = isField
        ? ft === 'radio' || foreignParentObjNum !== undefined
          ? ''
          : `  /T ${escapePdfString(String(markup.customFields?.fieldName ?? 'Field'))}\n`
        : `  /T ${escapePdfString(markup.author || options.authorDefault || 'Revisor')}\n`;
      let apLine = `  /AP << /N ${apObjNum} 0 R >>\n`;
      if (ft === 'checkbox' || ft === 'radio') {
        const onName = customOnName ?? (ft === 'radio' ? radioExportValue(markup) : 'Yes');
        const states: [string, string][] = [[onName, 'Yes'], ['Off', 'Off']];
        const refs: string[] = [];
        for (const [stateName, value] of states) {
          const e = emitMarkupOperators({ ...markup, customFields: { ...markup.customFields, fieldValue: value } }, transform);
          const num = writer.allocateObjectNumber();
          const bytes = new TextEncoder().encode(e.operators);
          writer.addObject(
            num,
            `<< /Type /XObject /Subtype /Form /BBox [${e.bbox.map((n) => n.toFixed(2)).join(' ')}] /Resources << >> /Length ${bytes.length} >>\nstream\n${e.operators}\nendstream`
          );
          refs.push(`/${stateName} ${num} 0 R`);
        }
        apLine = `  /AP << /N << ${refs.join(' ')} >> >>\n  /AS /${isFieldChecked(markup) ? onName : 'Off'}\n`;
      }

      const subj = markup.subject?.trim() || (markup.measurement ? markupTypeLabel(markup.type) : undefined);
      const subjLine = subj ? `  /Subj ${escapePdfString(subj)}\n` : '';

      // Construcción del diccionario de anotación
      let annotDict = `<<
  /Type /Annot
  /Subtype /${annotTypeSubtype}
  /Rect ${rectStr}
  /P ${pageObjNum} 0 R
  /NM ${escapePdfString(markup.id)}
${titleLine}${subjLine}  /Contents ${escapePdfString(markup.text || '')}
  /M ${formatPdfDate(markup.updatedAt || markup.createdAt)}
  /CreationDate ${formatPdfDate(markup.createdAt)}
  /F ${markup.locked ? 132 : 4}
  /BS ${borderStyleEntry(strokeWidth, markup.style.dashArray)}
${markup.layer && layerOcg.has(markup.layer) ? `  /OC ${layerOcg.get(markup.layer)} 0 R\n` : ''}${apLine}  /REA ${reaDict}
`;

      if (markup.locked) {
        annotDict += `  /Locked true\n`;
      }
      const markupOpacity = markup.style.opacity ?? 1;
      const strokeAlpha = (strokeParsed?.a ?? 1) * markupOpacity;
      if (strokeAlpha < 1 && annotTypeSubtype !== 'Highlight') {
        annotDict += `  /CA ${strokeAlpha.toFixed(3)}\n`;
      }
      const fillAlpha = (fillParsed?.a ?? 1) * markupOpacity;
      if (fillAlpha < 1 && fillParsed && annotTypeSubtype !== 'Highlight') {
        annotDict += `  /ca ${fillAlpha.toFixed(3)}\n`;
      }
      if (colorEntry) annotDict += `  ${colorEntry}\n`;
      if (fillEntry) annotDict += `  ${fillEntry}\n`;

      // Entradas específicas según subtipo
      // Una distancia sin extremos elegidos lleva flechas abiertas, como en pantalla y en su /AP (ADR-0032)
      const endStyle = markup.type === 'length' ? measureLineEndings(markup.style) : markup.style;
      const leEntry = `/LE [${toPdfLineEnding(endStyle.lineEndingStart)} ${toPdfLineEnding(endStyle.lineEndingEnd)}]`;
      if (annotTypeSubtype === 'Line' && markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        annotDict += `  /L [${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}]\n  ${leEntry}\n`;
        if (markup.type === 'dimension') {
          annotDict += `  ${dimensionLineEntries(markup, transform)}\n`;
        } else if (markup.type === 'length') {
          // Líneas de referencia de Acrobat (ADR-0033): /LL con signo, /LLE lo que sobresalen, /LLO 0
          if (markup.points[2]) {
            annotDict += `  /LL ${leaderLengthOf(markup, transform).toFixed(2)} /LLE ${MEASURE_LEADER_EXTENSION_PT} /LLO 0\n`;
          }
          // Texto dentro o encima de la línea, como "Caption Style" de Acrobat (ADR-0032)
          annotDict += `  /Cap true /CP /${markup.customFields?.captionStyle === 'top' ? 'Top' : 'Inline'}\n`;
        }
      } else if (markup.type === 'area' && markup.points.length === 2) {
        // Área rectangular: sus cuatro esquinas como polígono
        const a = normalizedToPdfCoordinates(markup.points[0], transform);
        const b = normalizedToPdfCoordinates(markup.points[1], transform);
        const x0 = Math.min(a.x, b.x).toFixed(2);
        const y0 = Math.min(a.y, b.y).toFixed(2);
        const x1 = Math.max(a.x, b.x).toFixed(2);
        const y1 = Math.max(a.y, b.y).toFixed(2);
        annotDict += `  /Vertices [${x0} ${y1} ${x1} ${y1} ${x1} ${y0} ${x0} ${y0}]\n`;
      } else if (
        (markup.type === 'cloud' || markup.type === 'cloudPlus') &&
        markup.points.length === 2
      ) {
        // Nube rectangular: cuatro vértices reales y borde nuboso (/BE), para que Revu/Acrobat la editen
        const a = normalizedToPdfCoordinates(markup.points[0], transform);
        const b = normalizedToPdfCoordinates(markup.points[1], transform);
        const x0 = Math.min(a.x, b.x).toFixed(2);
        const y0 = Math.min(a.y, b.y).toFixed(2);
        const x1 = Math.max(a.x, b.x).toFixed(2);
        const y1 = Math.max(a.y, b.y).toFixed(2);
        annotDict += `  /Vertices [${x0} ${y1} ${x1} ${y1} ${x1} ${y0} ${x0} ${y0}]\n  /BE << /S /C /I 1 >>\n`;
      } else if (
        (annotTypeSubtype === 'Polygon' || annotTypeSubtype === 'PolyLine') &&
        (markup.points.length >= 2 || markup.type === 'count')
      ) {
        const vertexPts = markup.type === 'perimeter' ? [...markup.points, markup.points[0]] : markup.points;
        const vList = vertexPts
          .map((pt) => {
            const pdfPt = normalizedToPdfCoordinates(pt, transform);
            return `${pdfPt.x.toFixed(2)} ${pdfPt.y.toFixed(2)}`;
          })
          .join(' ');
        annotDict += `  /Vertices [${vList}]\n`;
        if (annotTypeSubtype === 'PolyLine') {
          annotDict += `  ${leEntry}\n`;
        }
        if (markup.type === 'cloud' || markup.type === 'cloudPlus') {
          annotDict += `  /BE << /S /C /I 1 >>\n`;
        }
      }
      if (markup.cutouts && markup.cutouts.length > 0) {
        const cList = markup.cutouts
          .map((c) => {
            const cPts = c
              .map((pt) => {
                const pdfPt = normalizedToPdfCoordinates(pt, transform);
                return `${pdfPt.x.toFixed(2)} ${pdfPt.y.toFixed(2)}`;
              })
              .join(' ');
            return `[${cPts}]`;
          })
          .join(' ');
        annotDict += `  /Cutouts [${cList}]\n`;
      }
      const intent = measurementIntentOf(markup);
      if (intent) {
        annotDict += `  /IT /${intent}\n  /Measure ${measureDictFor(effectiveCalibration, transform.rotation)}\n`;
      }
      // Campos de medición de Revu (ADR-0051): tipo y, en el volumen, la profundidad con su unidad
      const revuType = revuMeasurementType(markup);
      if (revuType !== null) {
        annotDict += `  /MeasurementTypes ${revuType}\n`;
        if (!intent) annotDict += `  /Measure ${measureDictFor(effectiveCalibration, transform.rotation)}\n`;
      }
      if (markup.type === 'volume') {
        const depth = Number(markup.customFields?.volumeDepth ?? 1);
        annotDict += `  /Depth ${Number.isFinite(depth) && depth > 0 ? depth : 1}\n  /DepthUnit [${escapePdfString(effectiveCalibration.unit)}]\n`;
      }
      if (annotTypeSubtype === 'FreeText') {
        // Mismos tamaños por defecto que la pantalla y el /AP (llamada 10 pt, texto 12 pt)
        // Con Autosize Text (ADR-0061), el tamaño que llena la caja, el mismo del /AP
        const chosenPt = markup.style.fontSize ?? (markup.type === 'callout' ? 10 : 12);
        const rotated = transform.rotation === 90 || transform.rotation === 270;
        // Misma cuenta que el /AP: puntos en pt de la página vista y después la diferencia
        const visW = rotated ? transform.heightPt : transform.widthPt;
        const visH = rotated ? transform.widthPt : transform.heightPt;
        const q0 = markup.points[0];
        const q1 = markup.points[1] ?? q0;
        const boxW = Math.abs(q1.x * visW - q0.x * visW);
        const boxH = Math.abs(q1.y * visH - q0.y * visH);
        const fontPt = effectiveTextSize(
          markup,
          chosenPt,
          markup.type === 'callout' ? boxW : Math.max(80, boxW),
          markup.type === 'callout' ? boxH : Math.max(26, boxH),
          markup.type === 'callout' ? 'callout' : 'text'
        );
        const qVal = markup.textFormat?.align === 'center' ? 1 : markup.textFormat?.align === 'right' ? 2 : 0;
        annotDict += `  /DA (/Helv ${fontPt} Tf 0 0 0 rg)\n  /Q ${qVal}\n`;
        // Callout estándar (ADR-0042): directriz /CL, flecha /LE y caja de texto /RD, como los de Revu y Acrobat
        const co = calloutPdfLayout(markup, transform);
        if (co) {
          const [x0, y0, x1, y1] = emitted.bbox;
          const rd = [co.box[0] - x0, co.box[1] - y0, x1 - co.box[2], y1 - co.box[3]].map((v) => Math.max(0, v).toFixed(2));
          annotDict += `  /IT /FreeTextCallout\n  /CL [${co.line.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}]\n`;
          annotDict += `  /LE ${toPdfLineEnding(markup.style.lineEndingStart ?? 'openArrow')}\n  /RD [${rd.join(' ')}]\n`;
        } else if (markup.type === 'typewriter') {
          annotDict += `  /IT /FreeTextTypeWriter\n`;
        }
      } else if (annotTypeSubtype === 'Link') {
        annotDict += `  /Border [0 0 0]\n  /H /I\n`;
        const uri = markup.customFields?.linkUri;
        const pageNo = markup.customFields?.linkPage;
        if (typeof uri === 'string' && uri) {
          annotDict += `  /A << /S /URI /URI ${escapePdfString(uri)} >>\n`;
        } else if (typeof pageNo === 'number' && pages[pageNo - 1]) {
          annotDict += `  /Dest [${pages[pageNo - 1].ref.objectNumber} ${pages[pageNo - 1].ref.generationNumber} R /Fit]\n`;
        }
      } else if (annotTypeSubtype === 'FileAttachment') {
        const key = String(markup.customFields?.attachmentKey ?? '');
        const file = options.attachments?.[key];
        const name = String(markup.customFields?.attachmentName ?? file?.name ?? 'attachment');
        if (file) {
          const efNum = writer.allocateObjectNumber();
          const head = new TextEncoder().encode(
            `<< /Type /EmbeddedFile /Length ${file.bytes.length} /Params << /Size ${file.bytes.length} >> >>\nstream\n`
          );
          const tail = new TextEncoder().encode('\nendstream');
          writer.addObject(efNum, concatUint8Arrays([head, file.bytes, tail]));
          annotDict += `  /FS << /Type /Filespec /F ${escapePdfString(name)} /UF ${escapePdfString(name)} /EF << /F ${efNum} 0 R >> >>\n`;
        } else {
          annotDict += `  /FS << /Type /Filespec /F ${escapePdfString(name)} /UF ${escapePdfString(name)} >>\n`;
        }
        annotDict += `  /Name /Paperclip\n`;
      } else if (annotTypeSubtype === 'Widget' && ft) {
        const onName = customOnName ?? (ft === 'radio' ? radioExportValue(markup) : 'Yes');
        annotDict += `  ${widgetFieldEntries(markup, ft, radioGroups, foreignParentObjNum, onName)}\n`;
        if (foreignParentObjNum !== undefined) {
          if (ft === 'radio') {
            if (!foreignParentsToUpdate.has(foreignParentObjNum)) {
              foreignParentsToUpdate.set(foreignParentObjNum, { ft, value: 'Off' });
            }
            if (isFieldChecked(markup)) {
              foreignParentsToUpdate.set(foreignParentObjNum, { ft, value: onName });
            }
          } else {
            const val =
              ft === 'checkbox'
                ? isFieldChecked(markup)
                  ? onName
                  : 'Off'
                : String(markup.customFields?.fieldValue ?? '');
            foreignParentsToUpdate.set(foreignParentObjNum, { ft, value: val });
          }
        } else if (ft === 'radio') {
          radioGroups.get(String(markup.customFields?.fieldName ?? 'Group1'))?.kids.push(`${annotObjNum} 0 R`);
        } else {
          newFieldRefs.push(`${annotObjNum} 0 R`);
        }
      } else if (annotTypeSubtype === 'Stamp') {
        if (markup.type === 'image') {
          annotDict += `  /Name /Image\n`;
        } else {
          // Nombre estándar cuando existe (Approved, Draft…); si no, uno propio: el /AP lleva el dibujo
          const def = stampById(typeof markup.customFields?.stampId === 'string' ? markup.customFields.stampId : undefined);
          annotDict += `  /Name /${def.pdfName ?? `REA${def.id.replace(/[^A-Za-z0-9]/g, '')}`}\n`;
        }
      } else if (annotTypeSubtype === 'Text') {
        annotDict += `  /Name /Note\n  /Open false\n`;
      } else if (
        (annotTypeSubtype === 'Highlight' ||
          annotTypeSubtype === 'Underline' ||
          annotTypeSubtype === 'StrikeOut' ||
          annotTypeSubtype === 'Squiggly') &&
        markup.points.length >= 2
      ) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        const qx1 = Math.min(p1.x, p2.x).toFixed(2);
        const qy1 = Math.min(p1.y, p2.y).toFixed(2);
        const qx2 = Math.max(p1.x, p2.x).toFixed(2);
        const qy2 = Math.max(p1.y, p2.y).toFixed(2);
        annotDict += `  /QuadPoints [${qx1} ${qy2} ${qx2} ${qy2} ${qx1} ${qy1} ${qx2} ${qy1}]\n`;
        if (annotTypeSubtype === 'Highlight') {
          annotDict += `  /CA 0.5\n`;
        }
      }

      annotDict += '>>';
      writer.addObject(annotObjNum, annotDict);

      // 4. Respuestas en hilo estándar ISO 32000-1 §12.5.6.2 (/IRT /RT /R)
      if (markup.replies && markup.replies.length > 0) {
        for (const reply of markup.replies) {
          const replyObjNum = writer.allocateObjectNumber();
          newAnnotRefsList.push(`${replyObjNum} 0 R`);
          const replyDict = `<<
  /Type /Annot
  /Subtype /Text
  /Rect [0 0 0 0]
  /P ${pageObjNum} 0 R
  /NM ${escapePdfString(reply.id)}
  /IRT ${annotObjNum} 0 R
  /RT /R
  /T ${escapePdfString(reply.author || options.authorDefault || 'Revisor')}
  /Contents ${escapePdfString(reply.text)}
  /M ${formatPdfDate(reply.updatedAt || reply.createdAt)}
  /CreationDate ${formatPdfDate(reply.createdAt)}
  /Open false
  /F 4
>>`;
          writer.addObject(replyObjNum, replyDict);
        }
      }

      // 5. Anotación(es) de estado de revisión estándar (/StateModel Review)
      const statusStateMap: Record<MarkupStatus, string> = {
        pending: 'None',
        accepted: 'Accepted',
        rejected: 'Rejected',
        completed: 'Completed',
        cancelled: 'Cancelled',
      };
      const transitions =
        markup.statusHistory && markup.statusHistory.length > 0
          ? markup.statusHistory[markup.statusHistory.length - 1].status === markup.status
            ? markup.statusHistory
            : [
                ...markup.statusHistory,
                {
                  status: markup.status,
                  author: markup.author || options.authorDefault || 'Revisor',
                  createdAt: markup.updatedAt || markup.createdAt,
                },
              ]
          : markup.status && markup.status !== 'pending'
            ? [
                {
                  status: markup.status,
                  author: markup.author || options.authorDefault || 'Revisor',
                  createdAt: markup.updatedAt || markup.createdAt,
                },
              ]
            : [];

      let prevStateParentObjNum = annotObjNum;
      for (const tr of transitions) {
        const stateObjNum = writer.allocateObjectNumber();
        newAnnotRefsList.push(`${stateObjNum} 0 R`);

        const stateDict = `<<
  /Type /Annot
  /Subtype /Text
  /Rect [0 0 0 0]
  /P ${pageObjNum} 0 R
  /IRT ${prevStateParentObjNum} 0 R
  /RT /R
  /StateModel (Review)
  /State (${statusStateMap[tr.status]})
  /T ${escapePdfString(tr.author || markup.author || options.authorDefault || 'Revisor')}
  /M ${formatPdfDate(tr.createdAt)}
  /CreationDate ${formatPdfDate(tr.createdAt)}
  /F 4
>>`;
        writer.addObject(stateObjNum, stateDict);
        prevStateParentObjNum = stateObjNum;
      }
    }

    // Escala de la página y viewports regionales (/VP /Measure, ADR-0025, ADR-0076)
    const pageCalibration = options.calibrations?.[pIdx];
    const pageViewports = options.viewports?.[pIdx];
    let vpChanged = false;
    if (pageCalibration || (pageViewports && pageViewports.length > 0)) {
      const mb = page.getMediaBox();
      const calToUse =
        pageCalibration ??
        readPageCalibration(page.node, transform.rotation) ??
        DEFAULT_PAGE_CALIBRATION;
      const vpString = viewportArrayFor(
        calToUse,
        [mb.x, mb.y, mb.x + mb.width, mb.y + mb.height],
        transform.rotation,
        pageViewports
      );
      const vpObjNum = writer.allocateObjectNumber();
      writer.addObject(vpObjNum, vpString);
      page.node.set(PDFName.of('VP'), PDFRef.of(vpObjNum, 0));
      vpChanged = true;
    }

    // 5. Actualizar el diccionario de página con el array /Annots (también si solo hubo borrados)
    if (vpChanged && newAnnotRefsList.length === 0 && removedCount === 0) {
      writer.addObject(pageObjNum, page.node.toString());
    }
    if (newAnnotRefsList.length > 0 || removedCount > 0) {
      const newRefs = newAnnotRefsList.map((refStr) => {
        const parts = refStr.split(' ');
        return PDFRef.of(parseInt(parts[0], 10), parseInt(parts[1], 10));
      });

      // Actualizar el nodo de la página en pdf-lib y obtener su serialización
      const newAnnotsArray = pdfDoc.context.obj([...keptObjects, ...newRefs]);
      page.node.set(PDFName.of('Annots'), newAnnotsArray);

      // Escribir el diccionario actualizado de la página
      const pageDictString = page.node.toString();
      writer.addObject(pageObjNum, pageDictString);
    }
  }

  // Campos padre de los grupos de botones de opción creados en REA
  for (const [group, g] of radioGroups) {
    if (g.kids.length === 0) continue;
    writer.addObject(
      g.objNum,
      `<< /FT /Btn /Ff 49152 /T ${escapePdfString(group)} /V /${g.value ?? 'Off'} /Kids [${g.kids.join(' ')}] /REA << /v 1 /tool (radioGroup) >> >>`
    );
    newFieldRefs.push(`${g.objNum} 0 R`);
  }
  // Actualizar in-place los diccionarios /Parent ajenos (ADR-0055)
  for (const [parentObjNum, info] of foreignParentsToUpdate) {
    const parentObj = pdfDoc.context.lookup(PDFRef.of(parentObjNum, 0));
    if (parentObj instanceof PDFDict) {
      if (info.ft === 'radio' || info.ft === 'checkbox') {
        parentObj.set(PDFName.of('V'), PDFName.of(info.value || 'Off'));
      } else {
        parentObj.set(PDFName.of('V'), PDFString.of(info.value));
      }
      writer.addObject(parentObjNum, parentObj.toString());
    }
  }
  const formChanged = updateAcroForm(pdfDoc, writer, newFieldRefs, foreignParentsToUpdate.size > 0);
  const layersChanged = updateOCProperties(
    pdfDoc,
    [...layerOcg].map(([name, num]) => ({ name, ref: PDFRef.of(num, 0) })),
    options.hiddenLayers ?? []
  );
  if (formChanged || layersChanged) {
    const rootRef = pdfDoc.context.trailerInfo.Root;
    if (rootRef instanceof PDFRef) writer.addObject(rootRef.objectNumber, pdfDoc.catalog.toString());
  }

  return writer.build();
}

/** Entradas de campo de un widget (/FT, /Ff, /V, /Opt, /DA, /MK); si tiene /Parent, las hereda del diccionario padre. */
function widgetFieldEntries(
  markup: Markup,
  ft: FieldType,
  radioGroups: Map<string, { objNum: number }>,
  foreignParentObjNum?: number,
  onName: string = 'Yes'
): string {
  const def = fieldTypeDef(ft);
  const mk = '/MK << /BG [0.933 0.957 1] /BC [0.39 0.45 0.55]';
  const caption = ft === 'button' ? ` /CA ${escapePdfString(String(markup.customFields?.buttonCaption ?? 'Button'))}` : '';
  if (ft === 'radio' || foreignParentObjNum !== undefined) {
    const parentNum =
      foreignParentObjNum ?? radioGroups.get(String(markup.customFields?.fieldName ?? 'Group1'))?.objNum ?? 0;
    return `/Parent ${parentNum} 0 R ${mk}${caption} >>`;
  }
  const parts = [`/FT /${def.pdfFT}`];
  if (def.flags) parts.push(`/Ff ${def.flags}`);
  parts.push('/DA (/Helv 0 Tf 0 g)');
  const value = markup.customFields?.fieldValue;
  if (ft === 'text' && typeof value === 'string') parts.push(`/V ${escapePdfString(value)}`);
  if (ft === 'checkbox') parts.push(`/V /${isFieldChecked(markup) ? onName : 'Off'}`);
  if (ft === 'listbox' || ft === 'dropdown') {
    parts.push(`/Opt [${fieldOptions(markup).map((o) => escapePdfString(o)).join(' ')}]`);
    if (typeof value === 'string' && value) parts.push(`/V ${escapePdfString(value)}`);
  }
  parts.push(`${mk}${caption} >>`);
  return parts.join(' ');
}

/**
 * /AcroForm del catálogo (ADR-0027 / ADR-0055): conserva los campos ajenos sin duplicarlos, retira los de REA
 * escritos antes y añade los actuales. Elimina /NeedAppearances para que el visor use los /AP /N escritos.
 */
function updateAcroForm(
  pdfDoc: PDFDocument,
  writer: IncrementalWriter,
  newFieldRefs: string[],
  hasForeignParentUpdates: boolean = false
): boolean {
  const catalog = pdfDoc.catalog;
  const existing = catalog.lookup(PDFName.of('AcroForm'));
  const newRefNums = new Set(newFieldRefs.map((r) => parseInt(r, 10)));
  const kept: PDFObject[] = [];
  let hadRea = false;
  if (existing instanceof PDFDict) {
    const fields = existing.lookup(PDFName.of('Fields'));
    if (fields instanceof PDFArray) {
      for (let i = 0; i < fields.size(); i++) {
        const item = fields.get(i);
        if (item instanceof PDFRef && newRefNums.has(item.objectNumber)) {
          hadRea = true;
          continue;
        }
        const dict = item instanceof PDFRef ? pdfDoc.context.lookup(item) : item;
        // Los campos de firma ya firmados se conservan (ADR-0058)
        if (dict instanceof PDFDict && dict.get(PDFName.of('REA')) && !isSignedSignatureField(dict)) {
          hadRea = true;
          continue;
        }
        kept.push(item);
      }
    }
  }
  if (newFieldRefs.length === 0 && !hadRea && !hasForeignParentUpdates) return false;
  const ctx = pdfDoc.context;
  const acro = existing instanceof PDFDict ? existing : ctx.obj({});
  const refs = newFieldRefs.map((r) => PDFRef.of(parseInt(r, 10), 0));
  acro.set(PDFName.of('Fields'), ctx.obj([...kept, ...refs]));
  acro.delete(PDFName.of('NeedAppearances'));
  if (!acro.get(PDFName.of('DA'))) acro.set(PDFName.of('DA'), PDFString.of('/Helv 0 Tf 0 g'));
  const dr = acro.lookup(PDFName.of('DR'));
  const drDict = dr instanceof PDFDict ? dr : ctx.obj({});
  const fonts = drDict.lookup(PDFName.of('Font'));
  const fontDict = fonts instanceof PDFDict ? fonts : ctx.obj({});
  if (!fontDict.get(PDFName.of('Helv'))) {
    fontDict.set(
      PDFName.of('Helv'),
      ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' })
    );
  }
  drDict.set(PDFName.of('Font'), fontDict);
  acro.set(PDFName.of('DR'), drDict);
  const acroNum = writer.allocateObjectNumber();
  writer.addObject(acroNum, acro.toString());
  catalog.set(PDFName.of('AcroForm'), PDFRef.of(acroNum, 0));
  return true;
}

/**
 * /OCProperties del catálogo (ADR-0046): conserva las capas propias del plano, retira las capas de marcas que REA
 * escribió antes y añade las actuales a /OCGs, a /Order y a /ON u /OFF según su visibilidad en REA. Devuelve si
 * cambió el catálogo.
 */
function updateOCProperties(pdfDoc: PDFDocument, layers: { name: string; ref: PDFRef }[], hidden: string[]): boolean {
  const ctx = pdfDoc.context;
  const catalog = pdfDoc.catalog;
  const isRea = (item: PDFObject): boolean => {
    const d = item instanceof PDFRef ? ctx.lookup(item) : item;
    return d instanceof PDFDict && Boolean(d.get(PDFName.of('REA')));
  };
  const strip = (arr: PDFObject | undefined): PDFObject[] => {
    if (!(arr instanceof PDFArray)) return [];
    const out: PDFObject[] = [];
    for (const item of arr.asArray()) {
      if (item instanceof PDFArray) out.push(ctx.obj(strip(item)));
      else if (!isRea(item)) out.push(item);
    }
    return out;
  };
  const existing = catalog.lookup(PDFName.of('OCProperties'));
  const oc = existing instanceof PDFDict ? existing : null;
  const ocgs = oc?.lookup(PDFName.of('OCGs'));
  const keptOcgs = strip(ocgs);
  const hadRea = ocgs instanceof PDFArray && keptOcgs.length !== ocgs.size();
  if (layers.length === 0 && !hadRea) return false;
  if (layers.length === 0 && keptOcgs.length === 0) {
    catalog.delete(PDFName.of('OCProperties'));
    return true;
  }
  const refs = layers.map((l) => l.ref);
  const d0 = oc?.lookup(PDFName.of('D'));
  const d = d0 instanceof PDFDict ? d0 : ctx.obj({ Name: PDFString.of('Default') });
  d.set(PDFName.of('Order'), ctx.obj([...strip(d.lookup(PDFName.of('Order'))), ...refs]));
  const off = layers.filter((l) => hidden.includes(l.name)).map((l) => l.ref);
  const on = layers.filter((l) => !hidden.includes(l.name)).map((l) => l.ref);
  const keptOn = strip(d.lookup(PDFName.of('ON')));
  const keptOff = strip(d.lookup(PDFName.of('OFF')));
  if (keptOn.length + on.length > 0) d.set(PDFName.of('ON'), ctx.obj([...keptOn, ...on]));
  if (keptOff.length + off.length > 0) d.set(PDFName.of('OFF'), ctx.obj([...keptOff, ...off]));
  else d.delete(PDFName.of('OFF'));
  catalog.set(PDFName.of('OCProperties'), ctx.obj({ OCGs: ctx.obj([...keptOcgs, ...refs]), D: d }));
  return true;
}

/** Nombre PDF de un extremo de línea (ISO 32000-1 tabla 176), con los seis estilos de REA. */
export function toPdfLineEnding(ending: LineEndingStyle | undefined): string {
  switch (ending) {
    case 'openArrow':
      return '/OpenArrow';
    case 'closedArrow':
      return '/ClosedArrow';
    case 'circle':
      return '/Circle';
    case 'square':
      return '/Square';
    case 'diamond':
      return '/Diamond';
    case 'butt':
      return '/Butt';
    case 'slash':
      return '/Slash';
    case 'rOpenArrow':
      return '/ROpenArrow';
    case 'rClosedArrow':
      return '/RClosedArrow';
    default:
      return '/None';
  }
}

/**
 * Entradas de cota de una anotación /Line (ISO 32000-1 §12.5.6.7): /LL es el desfase con signo de la línea de
 * cota (positivo = sentido horario recorriendo /L), /LLE lo que sobresalen las líneas de referencia y /LLO su
 * separación del punto acotado; el texto va en /Contents con /Cap.
 */
/** /LL con signo de una línea con tercer punto (positivo = sentido horario recorriendo /L), en pt. */
export function leaderLengthOf(markup: Markup, transform: PageTransformInfo): number {
  const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
  const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  const ux = (p2.x - p1.x) / len;
  const uy = (p2.y - p1.y) / len;
  if (!markup.points[2]) return 0;
  const p3 = normalizedToPdfCoordinates(markup.points[2], transform);
  return (p3.x - p1.x) * uy + (p3.y - p1.y) * -ux;
}

export function dimensionLineEntries(markup: Markup, transform: PageTransformInfo): string {
  const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
  const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  const ux = (p2.x - p1.x) / len;
  const uy = (p2.y - p1.y) / len;
  let ll = 15;
  if (markup.points[2]) {
    const p3 = normalizedToPdfCoordinates(markup.points[2], transform);
    // Normal horaria en coordenadas PDF (y hacia arriba): (uy, -ux)
    ll = (p3.x - p1.x) * uy + (p3.y - p1.y) * -ux;
  }
  return `/LL ${ll.toFixed(2)} /LLE ${DIMENSION_EXTENSION_OVERSHOOT} /LLO ${DIMENSION_EXTENSION_GAP} /Cap true /CP /Top /IT /LineDimension`;
}

/** Diccionario /BS: continuo (/S) o discontinuo (/D con su patrón en pt). */
export function borderStyleEntry(strokeWidth: number, dashArray: number[] | undefined): string {
  const valid = (dashArray ?? []).filter((d) => Number.isFinite(d) && d > 0);
  if (valid.length === 0) return `<< /W ${strokeWidth.toFixed(2)} /S /S >>`;
  return `<< /W ${strokeWidth.toFixed(2)} /S /D /D [${valid.map((d) => d.toFixed(2)).join(' ')}] >>`;
}

/**
 * Intención de medición estándar (ISO 32000-1 §12.5.6.7/12.5.6.9, la que escriben Acrobat y Revu) para que otro
 * lector trate la marca como medición viva (ADR-0030). null si el tipo no tiene equivalente estándar.
 */
export function measurementIntentOf(markup: Markup): string | null {
  switch (markup.type) {
    case 'length':
      return 'LineDimension';
    case 'polylineMeasure':
    case 'perimeter':
      return 'PolyLineDimension';
    case 'area':
      return 'PolygonDimension';
    // Intenciones propias de Revu (ADR-0051), las que leen sus herramientas de medición
    case 'volume':
      return 'PolygonVolume';
    case 'angle':
      return 'PolyLineAngle';
    case 'count':
      return 'PolygonCount';
    case 'radius':
      return 'PolygonRadius';
    default:
      return null;
  }
}

/** Tipo de medición de Revu (/MeasurementTypes, ADR-0051): conteo, volumen, diámetro y ángulo. */
export function revuMeasurementType(markup: Markup): number | null {
  switch (markup.type) {
    case 'count':
      return 128;
    case 'volume':
      return 132;
    case 'diameter':
      return 384;
    case 'angle':
      return 1152;
    default:
      return null;
  }
}

/**
 * Mapea el tipo de marca de REA al subtipo canónico de anotación de PDF (ISO 32000-1 §12.5).
 */
function getPdfAnnotSubtype(markup: Markup): string {
  switch (markup.type) {
    case 'rectangle':
      return 'Square';
    case 'count':
      // Count de Revu (ADR-0059): polígono /IT /PolygonCount con un vértice por clic
      return countSymbolOf(markup) ? 'Polygon' : 'Circle';
    case 'circle':
    case 'radius':
    case 'diameter':
      return 'Circle';
    case 'perimeter':
      // Como el perímetro de Acrobat: polilínea cerrada (el último vértice repite el primero)
      return 'PolyLine';
    case 'volume':
      return 'Polygon';
    case 'angle':
      return 'PolyLine';
    case 'line':
    case 'length':
    case 'dimension':
      return 'Line';
    case 'polygon':
      if (markup.customFields?.isPolyLine) return 'PolyLine';
      return 'Polygon';
    case 'area':
      // Siempre polígono (también la rectangular): es el que Revu y Acrobat reconocen como medición de área
      return 'Polygon';
    case 'polyLine':
    case 'polylineMeasure':
      return 'PolyLine';
    case 'cloud':
    case 'cloudPlus':
      return 'Polygon';
    case 'callout':
    case 'text':
    case 'typewriter':
      return 'FreeText';
    case 'arc':
      return 'PolyLine';
    case 'stickyNote':
      return 'Text';
    case 'stamp':
    case 'image':
      return 'Stamp';
    case 'link':
      return 'Link';
    case 'fileAttachment':
      return 'FileAttachment';
    case 'formField':
      return 'Widget';
    case 'freehand':
      return 'Ink';
    case 'highlightVector':
    case 'highlightText':
    case 'highlight':
      return 'Highlight';
    case 'underline':
      return 'Underline';
    case 'strikeOut':
      return 'StrikeOut';
    case 'squiggly':
      return 'Squiggly';
    default:
      return 'Square';
  }
}
