import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  PDFString,
  PDFHexString,
  PDFNumber,
  PDFRef,
} from 'pdf-lib';
import { Markup, MarkupPoint, MarkupStatus, MarkupType } from '../../types/markup';
import { pdfToNormalizedCoordinates, PageTransformInfo } from './operators';

export interface ImportAnnotationsResult {
  markups: Markup[];
  foreignUnsupportedCount: number;
}

/**
 * Extrae texto legible de un objeto de texto de pdf-lib (PDFString o PDFHexString).
 */
function extractPdfStringValue(obj: unknown): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    return obj.asString();
  }
  return '';
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
              const parentNm = parentDict.get(PDFName.of('NM'));
              parentId = extractPdfStringValue(parentNm);
            }
          }

          if (parentId) {
            if (stateStr === 'accepted') reviewStatesByParentId.set(parentId, 'accepted');
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
      const nmObj = annotDict.get(PDFName.of('NM'));
      const id = extractPdfStringValue(nmObj) || `foreign-${pageIdx}-${aIdx}-${Date.now()}`;

      // Contenido y autor
      const contentsObj = annotDict.get(PDFName.of('Contents'));
      const text = extractPdfStringValue(contentsObj);

      const authorObj = annotDict.get(PDFName.of('T'));
      const author = extractPdfStringValue(authorObj) || 'Autor Externo';

      // Colores y grosor
      const strokeColor = pdfColorArrayToHex(annotDict.get(PDFName.of('C'))) || '#000000';
      const fillColor = pdfColorArrayToHex(annotDict.get(PDFName.of('IC')));

      let strokeWidth = 1;
      const bsObj = annotDict.get(PDFName.of('BS'));
      if (bsObj instanceof PDFDict) {
        const wObj = bsObj.get(PDFName.of('W'));
        if (wObj instanceof PDFNumber) strokeWidth = wObj.asNumber();
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
            const keyStr = k.asString().replace(/^\//, '');
            if (keyStr === 'arcStep' && typeof customFields.arcStep === 'number') {
              continue;
            }
            customFields[keyStr] = extractPdfStringValue(v);
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

      if (subtype === 'Line') {
        markupType = 'line';
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
          }
        }
      } else if (subtype === 'Polygon') {
        if (!isRea) markupType = 'polygon';
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
        markupType = 'polygon';
        customFields.isPolyLine = 'true';
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
      } else if (subtype === 'Circle') {
        markupType = 'circle';
      } else if (subtype === 'Text') {
        markupType = 'stickyNote';
      } else if (subtype === 'Highlight') {
        if (!isRea) markupType = 'highlightVector';
      } else if (subtype === 'FreeText') {
        if (!isRea) markupType = 'text';
      } else if (!isRea && !['Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'FreeText', 'Text', 'Ink', 'Highlight'].includes(subtype)) {
        // Subtipo no soportado por REA
        foreignUnsupportedCount++;
        continue;
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
          opacity: 1,
        },
        text: text || undefined,
        author,
        status: 'pending',
        createdAt: dateStr,
        updatedAt: dateStr,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      };

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
  };
}
