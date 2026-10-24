import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import type { HeaderFooterOptions } from '../core/pages/headersFooters';
import { replaceOpenDocument } from './documentEditService';
import { loadPdfDocument } from './pdfService';
import { sheetKey } from '../core/pages/slipSheet';

/**
 * Headers & Footers, Replace Pages y Split Document (ADR-0114). Comparten con Crop y Number Pages el mismo cambio de
 * bytes del PDF abierto (`replaceOpenDocument`).
 */

type Outcome = { ok: boolean; message: string };

// ── Headers & Footers ─────────────────────────────────────────────────────────────────────────────────────────────

export async function executeHeadersFooters(opts: HeaderFooterOptions): Promise<Outcome> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  try {
    const { stampHeadersFooters } = await import('../core/pages/headersFooters');
    await replaceOpenDocument(await stampHeadersFooters(pdfBytes, opts));
    const n = opts.pages.length;
    return { ok: true, message: `Headers and footers added to ${n} page${n === 1 ? '' : 's'}.` };
  } catch (err) {
    return { ok: false, message: `Could not add headers and footers: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Replace Pages ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface ReplaceRequest {
  /** Páginas del documento que se sustituyen (0-based). */
  targets: number[];
  source: { name: string; bytes: Uint8Array };
  /** Páginas del otro PDF que ocupan su lugar (0-based). */
  sourceIndices: number[];
  /** Con la misma cantidad de páginas, conservar las marcas de las páginas sustituidas. */
  keepMarkups: boolean;
}

export async function executeReplacePages(req: ReplaceRequest): Promise<Outcome> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  try {
    const { replacePdfPages, remapViewportsOnPageDeletion, remapViewportsOnPageInsertion } = await import('../core/pages/replacePages');
    const ops = await import('../core/pages/pageOperations');
    const result = await replacePdfPages(pdfBytes, req.targets, req.source.bytes, req.sourceIndices);
    const sorted = [...new Set(req.targets)].sort((a, b) => a - b);
    const at = sorted[0];
    const sameCount = sorted.length === req.sourceIndices.length;
    let markups = useMarkupStore.getState().markups;
    let { calibrations, viewports } = useCalibrationStore.getState();
    if (sameCount) {
      // Cada página nueva ocupa el sitio de una vieja: nada se corre, y las marcas se conservan o se quitan
      if (!req.keepMarkups) markups = markups.filter((m) => !sorted.includes(m.pageIndex));
    } else {
      for (const t of [...sorted].reverse()) {
        markups = ops.remapMarkupsOnPageDeletion(markups, t);
        calibrations = ops.remapCalibrationsOnPageDeletion(calibrations, t);
        viewports = remapViewportsOnPageDeletion(viewports, t);
      }
      for (let k = 0; k < req.sourceIndices.length; k++) {
        markups = ops.remapMarkupsOnPageInsertion(markups, at + k);
        calibrations = ops.remapCalibrationsOnPageInsertion(calibrations, at + k);
        viewports = remapViewportsOnPageInsertion(viewports, at + k);
      }
    }
    useMarkupStore.getState().setMarkups(markups);
    useCalibrationStore.setState({ calibrations, viewports });
    await replaceOpenDocument(result.bytes);
    useDocumentStore.setState({ currentPageIndex: Math.min(at, result.pagesAfter - 1), ...(sameCount ? {} : { pageLabels: null }) });
    const n = sorted.length;
    return { ok: true, message: `${n} page${n === 1 ? '' : 's'} replaced (${result.pagesBefore} → ${result.pagesAfter} pages).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ── Split Document ────────────────────────────────────────────────────────────────────────────────────────────────

/** El documento abierto con todas sus marcas escritas, tal y como lo dejaría Guardar (sin tocar el archivo). */
export async function serializeOpenDocument(): Promise<Uint8Array> {
  const { pdfBytes, importedAnnotationIds } = useDocumentStore.getState();
  if (!pdfBytes) throw new Error('No document open.');
  const [{ saveIncrementalMarkups }, { useAttachmentStore }, { useUiStore }] = await Promise.all([
    import('../core/pdf/incrementalWriter'),
    import('../store/useAttachmentStore'),
    import('../store/useUiStore'),
  ]);
  const cal = useCalibrationStore.getState();
  return saveIncrementalMarkups(
    pdfBytes,
    useMarkupStore.getState().markups,
    {},
    {
      importedIds: importedAnnotationIds ?? [],
      calibrations: cal.changedCalibrations(),
      viewports: cal.changedViewports(),
      attachments: useAttachmentStore.getState().files,
      hiddenLayers: useUiStore.getState().hiddenLayers,
    }
  );
}

/**
 * Parte el documento (con sus marcas) en varios PDF y los guarda: en una carpeta elegida en la aplicación de escritorio
 * o como descargas en el navegador.
 */
export async function executeSplitDocument(parts: number[][]): Promise<Outcome> {
  const { fileName } = useDocumentStore.getState();
  try {
    const { splitPdf, partFileNames } = await import('../core/pages/pageSplit');
    const { baseFileName } = await import('../core/pages/headersFooters');
    const names = partFileNames(baseFileName(fileName || 'document.pdf'), parts);
    const { isTauriEnvironment } = await import('./bbxPersistenceService');
    let folder: string | null = null;
    if (isTauriEnvironment()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({ directory: true, multiple: false, title: 'Choose the folder for the split files' });
      if (!picked || Array.isArray(picked)) return { ok: false, message: 'Split cancelled.' };
      folder = picked;
    }
    const files = await splitPdf(await serializeOpenDocument(), parts);
    if (folder) {
      const { invoke } = await import('@tauri-apps/api/core');
      const sep = folder.includes('\\') ? '\\' : '/';
      for (let i = 0; i < files.length; i++) {
        await invoke('save_export_file', { filePath: `${folder.replace(/[\\/]+$/, '')}${sep}${names[i]}`, bytes: Array.from(files[i]) });
      }
      return { ok: true, message: `${files.length} file${files.length === 1 ? '' : 's'} saved in ${folder}.` };
    }
    const { saveExportFileWithDialog } = await import('./exportService');
    for (let i = 0; i < files.length; i++) await saveExportFileWithDialog(names[i], 'pdf', files[i]);
    return { ok: true, message: `${files.length} file${files.length === 1 ? '' : 's'} downloaded.` };
  } catch (err) {
    return { ok: false, message: `Could not split the document: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Insert Pages ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface InsertRequest {
  /** Posición (0-based) antes de la que se insertan las páginas; igual al total es al final. */
  at: number;
  source: { name: string; bytes: Uint8Array };
  /** Páginas del otro PDF que se insertan, en orden (0-based). */
  sourceIndices: number[];
}

/** Inserta páginas de otro PDF y corre marcas, escalas y viewports de las páginas que quedan después. */
export async function executeInsertPages(req: InsertRequest): Promise<Outcome> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  try {
    const { insertPdfPages } = await import('../core/pages/insertPages');
    const { remapViewportsOnPageInsertion } = await import('../core/pages/replacePages');
    const ops = await import('../core/pages/pageOperations');
    const result = await insertPdfPages(pdfBytes, req.at, req.source.bytes, req.sourceIndices);
    let markups = useMarkupStore.getState().markups;
    let { calibrations, viewports } = useCalibrationStore.getState();
    for (let k = 0; k < req.sourceIndices.length; k++) {
      markups = ops.remapMarkupsOnPageInsertion(markups, req.at + k);
      calibrations = ops.remapCalibrationsOnPageInsertion(calibrations, req.at + k);
      viewports = remapViewportsOnPageInsertion(viewports, req.at + k);
    }
    useMarkupStore.getState().setMarkups(markups);
    useCalibrationStore.setState({ calibrations, viewports });
    await replaceOpenDocument(result.bytes);
    // Las etiquetas de página por posición ya no corresponden
    useDocumentStore.setState({ currentPageIndex: Math.min(req.at, result.pagesAfter - 1), pageLabels: null });
    const n = req.sourceIndices.length;
    return { ok: true, message: `${n} page${n === 1 ? '' : 's'} inserted (${result.pagesBefore} → ${result.pagesAfter} pages).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ── Page Labels ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Escribe las etiquetas de página en el PDF abierto (sin rangos las quita) y las pone al día en el visor. */
export async function executePageLabels(ranges: import('../core/pdf/pageLabels').PageLabelRange[]): Promise<Outcome> {
  const { pdfBytes, numPages } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  try {
    const { writePageLabelRanges, buildPageLabelsMap } = await import('../core/pdf/pageLabels');
    await replaceOpenDocument(await writePageLabelRanges(pdfBytes, ranges));
    useDocumentStore.getState().setPageLabels(ranges.length > 0 ? buildPageLabelsMap(ranges, numPages) : null);
    return { ok: true, message: ranges.length > 0 ? 'Page labels updated. Save the document to keep them.' : 'Page labels removed. Save the document to keep the change.' };
  } catch (err) {
    return { ok: false, message: `Could not change the page labels: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Slip Sheet ──────────────────────────────────────────────────────────────────────────────────────────────────

/** El número de lámina de cada página de un PDF, leído de su texto (null donde no se encuentra). */
export async function readSheetKeys(bytes: Uint8Array): Promise<(string | null)[]> {

  const doc = await loadPdfDocument(bytes);
  try {
    const keys: (string | null)[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      keys.push(sheetKey(content.items.map((it) => ('str' in it ? (it as { str: string }).str : '')).join(' ')));
    }
    return keys;
  } finally {
    void doc.destroy();
  }
}

export interface SlipSheetRequest {
  source: { name: string; bytes: Uint8Array };
  pairs: { oldIndex: number; newIndex: number }[];
  /** Láminas de la revisión sin pareja que se añaden al final. */
  append: number[];
  /** Conservar las marcas de las páginas sustituidas (por defecto) o quitarlas. */
  keepMarkups: boolean;
}

export async function executeSlipSheet(req: SlipSheetRequest): Promise<Outcome> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  try {
    const { slipSheetPdf } = await import('../core/pages/slipSheet');
    const result = await slipSheetPdf(pdfBytes, req.source.bytes, req.pairs, req.append);
    if (!req.keepMarkups) {
      const replaced = new Set(req.pairs.map((p) => p.oldIndex));
      useMarkupStore.getState().setMarkups(useMarkupStore.getState().markups.filter((m) => !replaced.has(m.pageIndex)));
    }
    await replaceOpenDocument(result.bytes);
    const extra = result.appended > 0 ? ` and ${result.appended} new sheet${result.appended === 1 ? '' : 's'} added` : '';
    return { ok: true, message: `${result.replaced} sheet${result.replaced === 1 ? '' : 's'} replaced${extra}. Save the document to keep it.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
