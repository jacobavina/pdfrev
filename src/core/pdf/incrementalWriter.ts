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
import { LineEndingStyle, Markup, MarkupStatus, PageCalibration } from '../../types/markup';
import { DIMENSION_EXTENSION_GAP, DIMENSION_EXTENSION_OVERSHOOT } from '../markup/dimension';
import { viewportArrayFor } from './pdfScale';
import { stampById } from '../markup/stamps';
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

  // Ids que el modelo reescribe en este guardado y que el usuario borró desde la importación
  const replacedIds = new Set<string>([...markups.map((m) => m.id), ...(options.importedIds ?? [])]);

  // Agrupar marcas por índice de página
  const markupsByPage = new Map<number, Markup[]>();
  for (const m of markups) {
    const list = markupsByPage.get(m.pageIndex) || [];
    list.push(m);
    markupsByPage.set(m.pageIndex, list);
  }

  // Formularios (ADR-0027): campos de primer nivel nuevos y grupos de botones de opción (un campo padre por grupo)
  const newFieldRefs: string[] = [];
  const radioGroups = new Map<string, { objNum: number; kids: string[]; value: string | null }>();
  for (const m of markups) {
    if (m.type === 'formField' && fieldTypeOf(m) === 'radio') {
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
      const isRea = it.dict.get(PDFName.of('REA')) instanceof PDFDict;
      const key = annotationKeyFor(it.dict, it.ref);
      if (isRea || (key !== undefined && replacedIds.has(key))) {
        it.drop = true;
        if (it.ref) droppedRefKeys.add(refKey(it.ref));
      }
    }
    for (const it of existingItems) {
      if (!it.dict || it.drop) continue;
      const irt = it.dict.get(PDFName.of('IRT'));
      const parent = it.dict.get(PDFName.of('Parent'));
      const isReviewState = it.dict.get(PDFName.of('StateModel')) !== undefined;
      const isPopup = it.dict.get(PDFName.of('Subtype'))?.toString() === '/Popup';
      if (
        (isReviewState && irt instanceof PDFRef && droppedRefKeys.has(refKey(irt))) ||
        (isPopup && parent instanceof PDFRef && droppedRefKeys.has(refKey(parent)))
      ) {
        it.drop = true;
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
      if (emitted.extGState?.bm || emitted.extGState?.ca || emitted.extGState?.CA) {
        resourcesDict += `    /ExtGState << /GS_HL << /Type /ExtGState /BM ${emitted.extGState.bm || '/Normal'} /ca ${emitted.extGState.ca ?? 1} /CA ${emitted.extGState.CA ?? 1} >> >>\n`;
      }
      // Texto del /AP (cotas, cuadros de texto, llamadas): Helvetica estándar, sin incrustar
      if (emitted.fontName || emitted.boldFontName) {
        resourcesDict += '    /Font <<';
        if (emitted.fontName) {
          resourcesDict += ` /${emitted.fontName} << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
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

      // 3. Crear el objeto de anotación estándar
      const annotObjNum = writer.allocateObjectNumber();
      newAnnotRefsList.push(`${annotObjNum} 0 R`);

      // Diccionario base común
      const strokeParsed = parseCssColorRgb(markup.style.strokeColor);
      const fillParsed = parseCssColorRgb(markup.style.fillColor);
      const strokeWidth = Math.max(1, markup.style.strokeWidth ?? 1);

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
      // Geometría exacta de REA (ida y vuelta sin pérdidas). /rect fija la caja con la que se escribió: si otra
      // aplicación mueve la anotación, el lector lo detecta y usa la geometría estándar del PDF.
      const numList = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(6)} ${p.y.toFixed(6)}`).join(' ');
      reaDict += ` /pts [${numList(markup.points)}] /rect ${rectStr}`;
      if (markup.leaders && markup.leaders.length > 0) {
        reaDict += ` /leaders [${markup.leaders.map((l) => `[${numList(l)}]`).join(' ')}]`;
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
      reaDict += ' >>';

      // Widgets: /T es el nombre del campo (los botones de opción lo heredan de su grupo); casillas y opciones
      // llevan dos apariencias (activada y /Off) y su estado /AS
      const isField = markup.type === 'formField';
      const ft = isField ? fieldTypeOf(markup) : null;
      const titleLine = isField
        ? ft === 'radio'
          ? ''
          : `  /T ${escapePdfString(String(markup.customFields?.fieldName ?? 'Field'))}\n`
        : `  /T ${escapePdfString(markup.author || options.authorDefault || 'Revisor')}\n`;
      let apLine = `  /AP << /N ${apObjNum} 0 R >>\n`;
      if (ft === 'checkbox' || ft === 'radio') {
        const onName = ft === 'radio' ? radioExportValue(markup) : 'Yes';
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

      // Construcción del diccionario de anotación
      let annotDict = `<<
  /Type /Annot
  /Subtype /${annotTypeSubtype}
  /Rect ${rectStr}
  /P ${pageObjNum} 0 R
  /NM ${escapePdfString(markup.id)}
${titleLine}  /Contents ${escapePdfString(markup.text || '')}
  /M ${formatPdfDate(markup.updatedAt || markup.createdAt)}
  /CreationDate ${formatPdfDate(markup.createdAt)}
  /F ${markup.locked ? 132 : 4}
  /BS ${borderStyleEntry(strokeWidth, markup.style.dashArray)}
${apLine}  /REA ${reaDict}
`;

      if (markup.locked) {
        annotDict += `  /Locked true\n`;
      }
      const markupOpacity = markup.style.opacity ?? 1;
      if (markupOpacity < 1 && annotTypeSubtype !== 'Highlight') {
        annotDict += `  /CA ${markupOpacity.toFixed(3)}\n`;
      }
      if (colorEntry) annotDict += `  ${colorEntry}\n`;
      if (fillEntry) annotDict += `  ${fillEntry}\n`;

      // Entradas específicas según subtipo
      const leEntry = `/LE [${toPdfLineEnding(markup.style.lineEndingStart)} ${toPdfLineEnding(markup.style.lineEndingEnd)}]`;
      if (annotTypeSubtype === 'Line' && markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        annotDict += `  /L [${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}]\n  ${leEntry}\n`;
        if (markup.type === 'dimension') {
          annotDict += `  ${dimensionLineEntries(markup, transform)}\n`;
        }
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
        markup.points.length >= 2
      ) {
        const vList = markup.points
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
      } else if (annotTypeSubtype === 'FreeText') {
        // Mismos tamaños por defecto que la pantalla y el /AP (llamada 10 pt, texto 12 pt)
        const fontPt = markup.style.fontSize ?? (markup.type === 'callout' ? 10 : 12);
        annotDict += `  /DA (/Helv ${fontPt} Tf 0 0 0 rg)\n`;
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
        annotDict += `  ${widgetFieldEntries(markup, ft, radioGroups)}\n`;
        if (ft === 'radio') {
          radioGroups.get(String(markup.customFields?.fieldName ?? 'Group1'))?.kids.push(`${annotObjNum} 0 R`);
        } else {
          newFieldRefs.push(`${annotObjNum} 0 R`);
        }
      } else if (annotTypeSubtype === 'Stamp') {
        // Nombre estándar cuando existe (Approved, Draft…); si no, uno propio: el /AP lleva el dibujo
        const def = stampById(typeof markup.customFields?.stampId === 'string' ? markup.customFields.stampId : undefined);
        annotDict += `  /Name /${def.pdfName ?? `REA${def.id.replace(/[^A-Za-z0-9]/g, '')}`}\n`;
      } else if (annotTypeSubtype === 'Text') {
        annotDict += `  /Name /Note\n  /Open false\n`;
      } else if (
        (annotTypeSubtype === 'Highlight' ||
          annotTypeSubtype === 'Underline' ||
          annotTypeSubtype === 'StrikeOut') &&
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

      // 4. Anotación de estado de revisión estándar (/StateModel Review)
      if (markup.status && markup.status !== 'pending') {
        const statusStateMap: Record<Exclude<MarkupStatus, 'pending'>, string> = {
          accepted: 'Accepted',
          rejected: 'Rejected',
          completed: 'Completed',
          cancelled: 'Cancelled',
        };

        const stateObjNum = writer.allocateObjectNumber();
        newAnnotRefsList.push(`${stateObjNum} 0 R`);

        const stateDict = `<<
  /Type /Annot
  /Subtype /Text
  /Rect [0 0 0 0]
  /P ${pageObjNum} 0 R
  /IRT ${annotObjNum} 0 R
  /RT /R
  /StateModel (Review)
  /State (${statusStateMap[markup.status]})
  /T ${escapePdfString(markup.author || options.authorDefault || 'Revisor')}
  /CreationDate ${formatPdfDate(markup.updatedAt || markup.createdAt)}
  /F 4
>>`;
        writer.addObject(stateObjNum, stateDict);
      }
    }

    // Escala de la página (/VP /Measure) si el usuario la definió en REA
    const pageCalibration = options.calibrations?.[pIdx];
    let vpChanged = false;
    if (pageCalibration) {
      const mb = page.getMediaBox();
      const vpString = viewportArrayFor(pageCalibration, [mb.x, mb.y, mb.x + mb.width, mb.y + mb.height], transform.rotation);
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

  // Campos padre de los grupos de botones de opción
  for (const [group, g] of radioGroups) {
    if (g.kids.length === 0) continue;
    writer.addObject(
      g.objNum,
      `<< /FT /Btn /Ff 49152 /T ${escapePdfString(group)} /V /${g.value ?? 'Off'} /Kids [${g.kids.join(' ')}] /REA << /v 1 /tool (radioGroup) >> >>`
    );
    newFieldRefs.push(`${g.objNum} 0 R`);
  }
  updateAcroForm(pdfDoc, writer, newFieldRefs);

  return writer.build();
}

/** Entradas de campo de un widget (/FT, /Ff, /V, /Opt, /DA, /MK); los botones de opción las heredan del grupo. */
function widgetFieldEntries(
  markup: Markup,
  ft: FieldType,
  radioGroups: Map<string, { objNum: number }>
): string {
  const def = fieldTypeDef(ft);
  const mk = '/MK << /BG [0.933 0.957 1] /BC [0.39 0.45 0.55]';
  if (ft === 'radio') {
    const group = radioGroups.get(String(markup.customFields?.fieldName ?? 'Group1'));
    return `/Parent ${group?.objNum ?? 0} 0 R ${mk} >>`;
  }
  const parts = [`/FT /${def.pdfFT}`];
  if (def.flags) parts.push(`/Ff ${def.flags}`);
  parts.push('/DA (/Helv 0 Tf 0 g)');
  const value = markup.customFields?.fieldValue;
  if (ft === 'text' && typeof value === 'string') parts.push(`/V ${escapePdfString(value)}`);
  if (ft === 'checkbox') parts.push(`/V /${isFieldChecked(markup) ? 'Yes' : 'Off'}`);
  if (ft === 'listbox' || ft === 'dropdown') {
    parts.push(`/Opt [${fieldOptions(markup).map((o) => escapePdfString(o)).join(' ')}]`);
    if (typeof value === 'string' && value) parts.push(`/V ${escapePdfString(value)}`);
  }
  const caption = ft === 'button' ? ` /CA ${escapePdfString(String(markup.customFields?.buttonCaption ?? 'Button'))}` : '';
  parts.push(`${mk}${caption} >>`);
  return parts.join(' ');
}

/**
 * /AcroForm del catálogo (ADR-0027): conserva los campos ajenos, retira los de REA escritos antes y añade los
 * actuales. Solo reescribe el catálogo si hay campos de REA nuevos o anteriores.
 */
function updateAcroForm(pdfDoc: PDFDocument, writer: IncrementalWriter, newFieldRefs: string[]): void {
  const catalog = pdfDoc.catalog;
  const existing = catalog.lookup(PDFName.of('AcroForm'));
  const kept: PDFObject[] = [];
  let hadRea = false;
  if (existing instanceof PDFDict) {
    const fields = existing.lookup(PDFName.of('Fields'));
    if (fields instanceof PDFArray) {
      for (let i = 0; i < fields.size(); i++) {
        const item = fields.get(i);
        const dict = item instanceof PDFRef ? pdfDoc.context.lookup(item) : item;
        if (dict instanceof PDFDict && dict.get(PDFName.of('REA'))) {
          hadRea = true;
          continue;
        }
        kept.push(item);
      }
    }
  }
  if (newFieldRefs.length === 0 && !hadRea) return;
  const ctx = pdfDoc.context;
  const acro = existing instanceof PDFDict ? existing : ctx.obj({});
  const refs = newFieldRefs.map((r) => PDFRef.of(parseInt(r, 10), 0));
  acro.set(PDFName.of('Fields'), ctx.obj([...kept, ...refs]));
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
  const rootRef = pdfDoc.context.trailerInfo.Root;
  if (rootRef instanceof PDFRef) writer.addObject(rootRef.objectNumber, catalog.toString());
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
    default:
      return '/None';
  }
}

/**
 * Entradas de cota de una anotación /Line (ISO 32000-1 §12.5.6.7): /LL es el desfase con signo de la línea de
 * cota (positivo = sentido horario recorriendo /L), /LLE lo que sobresalen las líneas de referencia y /LLO su
 * separación del punto acotado; el texto va en /Contents con /Cap.
 */
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
 * Mapea el tipo de marca de REA al subtipo canónico de anotación de PDF (ISO 32000-1 §12.5).
 */
function getPdfAnnotSubtype(markup: Markup): string {
  switch (markup.type) {
    case 'rectangle':
      return 'Square';
    case 'circle':
    case 'count':
      return 'Circle';
    case 'line':
    case 'length':
    case 'dimension':
      return 'Line';
    case 'polygon':
      if (markup.customFields?.isPolyLine) return 'PolyLine';
      return 'Polygon';
    case 'area':
      return markup.points.length === 2 ? 'Square' : 'Polygon';
    case 'polyLine':
    case 'polylineMeasure':
      return 'PolyLine';
    case 'cloud':
    case 'cloudPlus':
      return 'Polygon';
    case 'callout':
    case 'text':
      return 'FreeText';
    case 'stickyNote':
      return 'Text';
    case 'stamp':
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
    default:
      return 'Square';
  }
}
