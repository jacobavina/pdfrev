/**
 * Operaciones sobre páginas PDF para REA (Paquete 5).
 * Rotación, eliminación, inserción en blanco y extracción, con remapeo consistente de marcas y calibraciones.
 */

import { Markup, PageCalibration } from '../../types/markup';

export interface PageDimensions {
  width: number;
  height: number;
}

/**
 * Rota una página específica del documento en incrementos de 90°.
 */
export async function rotatePdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  deltaDegrees: 90 | -90 | 180 | 270
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  if (pageIndex < 0 || pageIndex >= totalPages) {
    throw new Error(`Page index out of range: ${pageIndex} (total: ${totalPages})`);
  }

  const page = pdfDoc.getPage(pageIndex);
  const currentAngle = page.getRotation().angle;
  const newAngle = (currentAngle + deltaDegrees + 360) % 360;
  page.setRotation(degrees(newAngle));

  return pdfDoc.save();
}

/**
 * Elimina una página del documento. Lanza error si se intenta eliminar la única página existente.
 */
export async function deletePdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  if (totalPages <= 1) {
    throw new Error('The only page of the document cannot be deleted.');
  }

  if (pageIndex < 0 || pageIndex >= totalPages) {
    throw new Error(`Page index out of range: ${pageIndex} (total: ${totalPages})`);
  }

  pdfDoc.removePage(pageIndex);
  return pdfDoc.save();
}

/**
 * Inserta una página en blanco en la posición indicada.
 */
export async function insertBlankPdfPage(
  pdfBytes: Uint8Array,
  atIndex: number,
  dimensions?: PageDimensions
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  const clampedIndex = Math.max(0, Math.min(totalPages, atIndex));

  // Dimensiones por defecto basadas en la página más cercana o carta estándar
  let width = 612;
  let height = 792;

  if (dimensions && dimensions.width > 0 && dimensions.height > 0) {
    width = dimensions.width;
    height = dimensions.height;
  } else if (totalPages > 0) {
    const referencePage = pdfDoc.getPage(Math.min(clampedIndex, totalPages - 1));
    const size = referencePage.getSize();
    width = size.width;
    height = size.height;
  }

  pdfDoc.insertPage(clampedIndex, [width, height]);
  return pdfDoc.save();
}

/**
 * Extrae una página individual a un nuevo documento PDF independiente.
 */
export async function extractPdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  if (pageIndex < 0 || pageIndex >= totalPages) {
    throw new Error(`Page index out of range: ${pageIndex} (total: ${totalPages})`);
  }

  const destDoc = await PDFDocument.create();
  const [copiedPage] = await destDoc.copyPages(srcDoc, [pageIndex]);
  destDoc.addPage(copiedPage);

  return destDoc.save();
}

/**
 * Remapea el conjunto de marcas al eliminar una página.
 * - Elimina las marcas que residían en la página borrada.
 * - Decrementa en 1 el `pageIndex` de las marcas posteriores.
 */
export function remapMarkupsOnPageDeletion(
  markups: Markup[],
  deletedPageIndex: number
): Markup[] {
  return markups
    .filter((m) => m.pageIndex !== deletedPageIndex)
    .map((m) => {
      if (m.pageIndex > deletedPageIndex) {
        return {
          ...m,
          pageIndex: m.pageIndex - 1,
        };
      }
      return m;
    });
}

/**
 * Remapea el conjunto de marcas al insertar una nueva página.
 * - Incrementa en 1 el `pageIndex` de las marcas en o posteriores al índice de inserción.
 */
export function remapMarkupsOnPageInsertion(
  markups: Markup[],
  insertedAtIndex: number
): Markup[] {
  return markups.map((m) => {
    if (m.pageIndex >= insertedAtIndex) {
      return {
        ...m,
        pageIndex: m.pageIndex + 1,
      };
    }
    return m;
  });
}

/**
 * Remapea las calibraciones por página al eliminar una página.
 */
export function remapCalibrationsOnPageDeletion(
  calibrations: Record<number, PageCalibration>,
  deletedPageIndex: number
): Record<number, PageCalibration> {
  const updated: Record<number, PageCalibration> = {};

  for (const [keyStr, cal] of Object.entries(calibrations)) {
    const pIdx = parseInt(keyStr, 10);
    if (pIdx === deletedPageIndex) {
      // Se descarta la calibración de la página eliminada
      continue;
    }
    if (pIdx > deletedPageIndex) {
      updated[pIdx - 1] = { ...cal };
    } else {
      updated[pIdx] = { ...cal };
    }
  }

  return updated;
}

/**
 * Remapea las calibraciones por página al insertar una página.
 */
export function remapCalibrationsOnPageInsertion(
  calibrations: Record<number, PageCalibration>,
  insertedAtIndex: number
): Record<number, PageCalibration> {
  const updated: Record<number, PageCalibration> = {};

  for (const [keyStr, cal] of Object.entries(calibrations)) {
    const pIdx = parseInt(keyStr, 10);
    if (pIdx >= insertedAtIndex) {
      updated[pIdx + 1] = { ...cal };
    } else {
      updated[pIdx] = { ...cal };
    }
  }

  return updated;
}
