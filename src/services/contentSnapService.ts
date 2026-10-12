import { OPS } from 'pdfjs-dist';
import { extractPageSegments, PathOps } from '../core/pdf/contentGeometry';
import { ContentSnapIndex } from '../core/markup/contentSnap';

/**
 * Geometría del plano para el snap (ADR-0031): se extrae una vez por página y rotación de vista y se guarda
 * mientras el documento siga abierto (caché ligada al objeto del documento de PDF.js).
 */

interface PdfDocLike {
  getPage: (n: number) => Promise<Parameters<typeof extractPageSegments>[0]>;
}

const cache = new WeakMap<object, Map<string, Promise<ContentSnapIndex>>>();

export function loadContentSnapIndex(pdfDoc: PdfDocLike, pageIndex: number, viewRotation: number): Promise<ContentSnapIndex> {
  let perDoc = cache.get(pdfDoc);
  if (!perDoc) {
    perDoc = new Map();
    cache.set(pdfDoc, perDoc);
  }
  const key = `${pageIndex}|${viewRotation}`;
  let pending = perDoc.get(key);
  if (!pending) {
    pending = pdfDoc
      .getPage(pageIndex + 1)
      .then((page) => extractPageSegments(page, viewRotation, OPS as unknown as PathOps))
      .then((segments) => new ContentSnapIndex(segments));
    // Un fallo no se queda en caché: el siguiente intento vuelve a pedir la página
    pending.catch(() => perDoc!.delete(key));
    perDoc.set(key, pending);
  }
  return pending;
}
