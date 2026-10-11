import { PDFDocument, PDFName, PDFArray, PDFRef } from 'pdf-lib';
import { Markup, MarkupStatus } from '../../types/markup';
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
 * Escapa caracteres especiales (, ), \ en cadenas literales de PDF.
 */
export function escapePdfString(str: string): string {
  const sanitized = str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  return `(${sanitized})`;
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
        throw new Error('Estructura de PDF inválida: no se encontró startxref');
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
      throw new Error('No se pudo leer el offset numérico de startxref');
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
        '[IncrementalWriter] Violación de invariante ISO 32000-1: los bytes originales no se conservaron intactos'
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

  // Agrupar marcas por índice de página
  const markupsByPage = new Map<number, Markup[]>();
  for (const m of markups) {
    const list = markupsByPage.get(m.pageIndex) || [];
    list.push(m);
    markupsByPage.set(m.pageIndex, list);
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

    // Obtener referencias de anotaciones existentes en la página
    const existingAnnotsRef = page.node.Annots();
    const existingAnnotRefsList: string[] = [];
    if (existingAnnotsRef instanceof PDFArray) {
      for (let i = 0; i < existingAnnotsRef.size(); i++) {
        const item = existingAnnotsRef.get(i);
        if (item instanceof PDFRef) {
          existingAnnotRefsList.push(`${item.objectNumber} 0 R`);
        }
      }
    }

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
          if (v !== undefined && v !== null) {
            reaCustomFields.push(`/${k} (${String(v)})`);
          }
        }
      }

      let reaDict = `<< /v 1 /tool (${markup.type})`;
      if (typeof markup.customFields?.arcStep === 'number') {
        reaDict += ` /arcStep ${markup.customFields.arcStep}`;
      }
      if (markup.groupId) {
        reaDict += ` /groupId ${escapePdfString(markup.groupId)}`;
      }
      if (markup.layer) {
        reaDict += ` /layer ${escapePdfString(markup.layer)}`;
      }
      if (reaCustomFields.length > 0) {
        reaDict += ` /fields << ${reaCustomFields.join(' ')} >>`;
      }
      if (markup.measurement) {
        reaDict += ` /measurement << /type (${markup.type}) /value ${markup.measurement.value.toFixed(4)} /unit (${markup.measurement.unit}) /formatted (${escapePdfString(markup.measurement.formatted)})`;
        if (typeof markup.measurement.perimeter === 'number') {
          reaDict += ` /perimeter ${markup.measurement.perimeter.toFixed(4)}`;
        }
        if (typeof markup.measurement.countIndex === 'number') {
          reaDict += ` /countIndex ${markup.measurement.countIndex}`;
        }
        reaDict += ` >>`;
      }
      reaDict += ' >>';

      // Construcción del diccionario de anotación
      let annotDict = `<<
  /Type /Annot
  /Subtype /${annotTypeSubtype}
  /Rect ${rectStr}
  /P ${pageObjNum} 0 R
  /NM (${markup.id})
  /T ${escapePdfString(markup.author || options.authorDefault || 'Revisor')}
  /Contents ${escapePdfString(markup.text || '')}
  /M ${formatPdfDate(markup.updatedAt || markup.createdAt)}
  /CreationDate ${formatPdfDate(markup.createdAt)}
  /F ${markup.locked ? 132 : 4}
  /BS << /W ${strokeWidth.toFixed(2)} /S /S >>
  /AP << /N ${apObjNum} 0 R >>
  /REA ${reaDict}
`;

      if (markup.locked) {
        annotDict += `  /Locked true\n`;
      }
      if (colorEntry) annotDict += `  ${colorEntry}\n`;
      if (fillEntry) annotDict += `  ${fillEntry}\n`;

      // Entradas específicas según subtipo
      if (annotTypeSubtype === 'Line' && markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        const leStart =
          markup.style.lineEndingStart === 'openArrow'
            ? '/OpenArrow'
            : markup.style.lineEndingStart === 'closedArrow'
            ? '/ClosedArrow'
            : markup.style.lineEndingStart === 'circle'
            ? '/Circle'
            : '/None';
        const leEnd =
          markup.style.lineEndingEnd === 'openArrow'
            ? '/OpenArrow'
            : markup.style.lineEndingEnd === 'closedArrow'
            ? '/ClosedArrow'
            : markup.style.lineEndingEnd === 'circle'
            ? '/Circle'
            : '/None';
        annotDict += `  /L [${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}]\n  /LE [${leStart} ${leEnd}]\n`;
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
        if (markup.type === 'cloud') {
          annotDict += `  /BE << /S /C /I 1 >>\n`;
        }
      } else if (annotTypeSubtype === 'FreeText') {
        const fontPt = markup.style.fontSize ?? 12;
        annotDict += `  /DA (/Helv ${fontPt} Tf 0 0 0 rg)\n`;
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

    // 5. Actualizar el diccionario de página con el array /Annots
    if (newAnnotRefsList.length > 0) {
      const allAnnots = [...existingAnnotRefsList, ...newAnnotRefsList];

      // Actualizar el nodo de la página en pdf-lib y obtener su serialización
      const newAnnotsArray = pdfDoc.context.obj(
        allAnnots.map((refStr) => {
          const parts = refStr.split(' ');
          return PDFRef.of(parseInt(parts[0], 10), parseInt(parts[1], 10));
        })
      );
      page.node.set(PDFName.of('Annots'), newAnnotsArray);

      // Escribir el diccionario actualizado de la página
      const pageDictString = page.node.toString();
      writer.addObject(pageObjNum, pageDictString);
    }
  }

  return writer.build();
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
      return 'Polygon';
    case 'callout':
    case 'text':
      return 'FreeText';
    case 'stickyNote':
      return 'Text';
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
