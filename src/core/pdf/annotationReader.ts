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
import { Markup, MarkupPoint, MarkupStatus, MarkupType, LineEndingStyle } from '../../types/markup';
import { pdfToNormalizedCoordinates, PageTransformInfo } from './operators';
import { calibrationFromMeasure, readPageCalibration } from './pdfScale';
import {
  DEFAULT_PAGE_CALIBRATION,
  calculateArea,
  calculateLength,
  calculatePerimeter,
  calculatePolylineLength,
} from '../measurements/calculate';

/** Mediciones cuyo valor se recalcula de la geometría del PDF si esta cambió fuera de REA (ADR-0030). */
const RECOMPUTED_MEASURES = new Set<MarkupType>(['length', 'polylineMeasure', 'perimeter', 'area']);

export interface ImportAnnotationsResult {
  markups: Markup[];
  foreignUnsupportedCount: number;
  /** Adjuntos embebidos de las marcas de REA, por `attachmentKey` (ADR-0027). */
  attachments: Record<string, { name: string; mime: string; bytes: Uint8Array }>;
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

/**
 * Convierte un array de números [r, g, b] a formato CSS hexadecimal #rrggbb.
 */
function pdfColorArrayToHex(arr: unknown): string | undefined {
  if (arr instanceof PDFArray && arr.size() >= 3) {
    const rNum = arr.get(0);
    const gNum = arr.get(1);
    const bNum = arr.get(2);
    if (
      rNum instanceof PDFNumber &&
      gNum instanceof PDFNumber &&
      bNum instanceof PDFNumber
    ) {
      const r = Math.round(Math.max(0, Math.min(1, rNum.asNumber())) * 255);
      const g = Math.round(Math.max(0, Math.min(1, gNum.asNumber())) * 255);
      const b = Math.round(Math.max(0, Math.min(1, bNum.asNumber())) * 255);
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  }
  return undefined;
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

  // Mapa para vincular estados de revisión estándar (/StateModel Review) con el id de anotación padre
  const reviewStatesByParentId = new Map<string, MarkupStatus>();

  // Primer pase: procesar todas las páginas
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const annotsObj = page.node.Annots();
    if (!(annotsObj instanceof PDFArray)) continue;

    const transform: PageTransformInfo = {
      rotation: (page.getRotation().angle as 0 | 90 | 180 | 270) || 0,
      widthPt: page.getWidth(),
      heightPt: page.getHeight(),
      originX: 0,
      originY: 0,
    };
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

      // Identificar si es una anotación hija de estado de revisión (/StateModel Review)
      const stateModelObj = annotDict.get(PDFName.of('StateModel'));
      if (stateModelObj) {
        const stateModelStr = extractPdfStringValue(stateModelObj);
        if (stateModelStr.toLowerCase() === 'review') {
          const stateObj = annotDict.get(PDFName.of('State'));
          const stateStr = extractPdfStringValue(stateObj).toLowerCase();
          const irtObj = annotDict.get(PDFName.of('IRT'));

          let parentId = '';
          if (irtObj instanceof PDFRef) {
            const parentDict = pdfDoc.context.lookup(irtObj);
            if (parentDict instanceof PDFDict) {
              parentId = annotationIdFor(parentDict, irtObj, '');
            }
          }

          if (parentId) {
            if (stateStr === 'none') reviewStatesByParentId.set(parentId, 'pending');
            else if (stateStr === 'accepted') reviewStatesByParentId.set(parentId, 'accepted');
            else if (stateStr === 'rejected') reviewStatesByParentId.set(parentId, 'rejected');
            else if (stateStr === 'completed') reviewStatesByParentId.set(parentId, 'completed');
            else if (stateStr === 'cancelled') reviewStatesByParentId.set(parentId, 'cancelled');
          }
          continue; // Las anotaciones de estado no se agregan como marcas gráficas independientes
        }
      }

      // Metadatos REA
      const reaObj = annotDict.get(PDFName.of('REA'));
      const isRea = reaObj instanceof PDFDict;

      // Identificador único (/NM) o generado
      const id = annotationIdFor(annotDict, annotRefOrDict, `foreign-${pageIdx}-${aIdx}`);

      // Contenido y autor
      const contentsObj = annotDict.get(PDFName.of('Contents'));
      const text = extractPdfStringValue(contentsObj);

      const authorObj = annotDict.get(PDFName.of('T'));
      const author = extractPdfStringValue(authorObj) || 'External author';

      // Colores y grosor
      const strokeColor = pdfColorArrayToHex(annotDict.get(PDFName.of('C'))) || '#000000';
      const fillColor = pdfColorArrayToHex(annotDict.get(PDFName.of('IC')));

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
      }

      // Fechas
      const mObj = annotDict.get(PDFName.of('M'));
      const dateStr = extractPdfStringValue(mObj) || new Date().toISOString();

      // Puntos y Geometría
      const points: MarkupPoint[] = [];
      let markupType: MarkupType = 'rectangle';
      const customFields: Record<string, string | number> = {};

      if (isRea && reaObj instanceof PDFDict) {
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
      } else if (subtype === 'Polygon') {
        if (!isRea) markupType = intent === 'PolygonDimension' ? 'area' : 'polygon';
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
        if (!isRea) markupType = intent === 'PolyLineDimension' ? 'polylineMeasure' : 'polyLine';
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
        if (!isRea) markupType = 'circle';
      } else if (subtype === 'Text') {
        markupType = 'stickyNote';
      } else if (subtype === 'Highlight') {
        if (!isRea) markupType = 'highlightVector';
      } else if (subtype === 'Underline') {
        if (!isRea) markupType = 'underline';
      } else if (subtype === 'StrikeOut') {
        if (!isRea) markupType = 'strikeOut';
      } else if (subtype === 'FreeText') {
        if (!isRea) markupType = 'text';
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
        ].includes(subtype)
      ) {
        // Subtipo no soportado por REA. Enlaces, campos de formulario y ventanas emergentes ajenos se conservan
        // intactos en el PDF (los enlaces se pueden seguir en el visor): no se cuentan como no editables.
        if (!['Link', 'Widget', 'Popup'].includes(subtype)) foreignUnsupportedCount++;
        continue;
      }

      // Geometría exacta de REA, si la anotación no se movió fuera de REA (su /Rect sigue siendo el escrito)
      let leaders: MarkupPoint[][] | undefined;
      let groupId: string | undefined;
      let layer: string | undefined;
      let lineStyle: string | undefined;
      let exactGeometry = false;
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
        } else if (markupType === 'count' && points.length === 2) {
          // Conteo sin geometría exacta: su centro es el centro de la caja
          points.splice(0, 2, { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
        }
        groupId = extractPdfStringValue(reaObj.get(PDFName.of('groupId'))) || undefined;
        layer = extractPdfStringValue(reaObj.get(PDFName.of('layer'))) || undefined;
        // Tipo de línea con patrón (ADR-0041)
        lineStyle = extractPdfStringValue(reaObj.get(PDFName.of('lineStyle'))) || undefined;
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
        else if (points.length >= 3) measurement = calculateArea(points, visualDims, cal, false);
      }

      // Opacidad (/CA) y tamaño de fuente (/DA)
      let opacity = 1;
      const caObj = annotDict.get(PDFName.of('CA'));
      if (caObj instanceof PDFNumber && caObj.asNumber() > 0 && caObj.asNumber() <= 1 && subtype !== 'Highlight') {
        opacity = caObj.asNumber();
      }
      let fontSize: number | undefined;
      const daMatch = /([\d.]+)\s+Tf/.exec(extractPdfStringValue(annotDict.get(PDFName.of('DA'))));
      if (daMatch && Number(daMatch[1]) > 0) fontSize = Number(daMatch[1]);

      // Comprobar bandera de bloqueo (/F bit 8 = 128)
      let locked = false;
      const fObj = annotDict.get(PDFName.of('F'));
      if (fObj instanceof PDFNumber && (fObj.asNumber() & 128) !== 0) {
        locked = true;
      }

      // Comprobar extremos de línea (/LE)
      let lineEndingStart: LineEndingStyle | undefined;
      let lineEndingEnd: LineEndingStyle | undefined;
      const leObj = annotDict.get(PDFName.of('LE'));
      if (leObj instanceof PDFArray && leObj.size() >= 2) {
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
        const s = parseEnding(leObj.get(0));
        const e = parseEnding(leObj.get(1));
        if (s && s !== 'none') lineEndingStart = s;
        if (e && e !== 'none') lineEndingEnd = e;
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
          lineEndingStart,
          lineEndingEnd,
          dashArray,
          ...(lineStyle ? { lineStyle } : {}),
        },
        text: text || undefined,
        author,
        status: 'pending',
        createdAt: dateStr,
        updatedAt: dateStr,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        locked: locked || undefined,
        measurement,
        ...(leaders ? { leaders } : {}),
        ...(groupId ? { groupId } : {}),
        ...(layer ? { layer } : {}),
      };

      // Enlaces, adjuntos y campos de REA (ADR-0027): lo editado en Revu/Acrobat manda (destino, valor rellenado)
      if (isRea) syncInteractiveFields(markup, annotDict, pdfDoc, pages, attachments);

      markups.push(markup);
    }
  }

  // Segundo pase: asociar estados de revisión a sus anotaciones padre correspondientes
  for (const m of markups) {
    if (reviewStatesByParentId.has(m.id)) {
      m.status = reviewStatesByParentId.get(m.id)!;
    }
  }

  return {
    markups,
    foreignUnsupportedCount,
    attachments,
  };
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
