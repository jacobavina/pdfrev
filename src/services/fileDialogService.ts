import { isTauriEnvironment, loadBbxForPdf } from './bbxPersistenceService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useAttachmentStore } from '../store/useAttachmentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useUiStore } from '../store/useUiStore';
import { loadPdfDocument } from './pdfService';
import { showToast } from './toastService';
import type { Markup } from '../types/markup';

/**
 * Abre un archivo PDF utilizando el diálogo nativo en Tauri
 * o un input HTML en el navegador.
 */
export async function openPdfDialog(): Promise<void> {
  const { setLoading, setError } = useDocumentStore.getState();
  setLoading(true);

  try {
    if (isTauriEnvironment()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readFile } = await import('@tauri-apps/plugin-fs');

      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
      });

      if (!selected || typeof selected !== 'string') {
        setLoading(false);
        return;
      }

      const filePath = selected;
      const fileName = filePath.split(/[/\\]/).pop() || 'document.pdf';
      const fileBytes = await readFile(filePath);

      await loadPdfData(filePath, fileName, fileBytes);
    } else {
      // Fallback en navegador para desarrollo y pruebas
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          setLoading(false);
          return;
        }

        const buffer = await file.arrayBuffer();
        const fileBytes = new Uint8Array(buffer);
        await loadPdfData(file.name, file.name, fileBytes);
      };
      input.click();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setError(`Error opening PDF file: ${message}`);
  }
}

/**
 * Formatea y agrupa avisos devueltos por la migración de BBX al abrir un documento.
 * Función pura: 0 avisos => "", 1 aviso => texto tal cual, N>1 => resumen acotado.
 */
export function summarizeMigrationWarnings(warnings: string[]): string {
  if (!warnings || warnings.length === 0) {
    return '';
  }
  if (warnings.length === 1) {
    return warnings[0];
  }

  const MAX_ITEM_LEN = 80;
  const truncate = (w: string) => (w.length > MAX_ITEM_LEN ? `${w.slice(0, MAX_ITEM_LEN - 3)}...` : w);

  const total = warnings.length;
  if (total <= 3) {
    const items = warnings.map(truncate).join('; ');
    return `${total} warnings while opening the document: ${items}`;
  }

  const firstThree = warnings.slice(0, 3).map(truncate).join('; ');
  const remaining = total - 3;
  return `${total} warnings while opening the document: ${firstThree} (and ${remaining} more, see console)`;
}

/**
 * Carga los bytes del PDF, inicializa el visor y busca el archivo .bbx.json asociado
 */
export async function loadPdfData(
  filePath: string | null,
  fileName: string,
  bytes: Uint8Array
): Promise<void> {
  const { setDocument, setError, setCustomColumns } = useDocumentStore.getState();
  const { setMarkups } = useMarkupStore.getState();

  try {
    const pdfDoc = await loadPdfDocument(bytes);
    const numPages = pdfDoc.numPages;

    setDocument(filePath, fileName, bytes, numPages, pdfDoc);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setError(`Error processing PDF: ${message}`);
    return;
  }

  // Los adjuntos y las capas ocultas del documento anterior nunca pasan al nuevo
  useAttachmentStore.getState().resetAttachments();
  useUiStore.setState({ hiddenLayers: [] });

  // Escalas y viewports de página del PDF (/VP /Measure, ADR-0025, ADR-0076): las de REA, Revu o Acrobat. Nunca se arrastran
  // las del documento anterior.
  try {
    const { importPdfCalibrations, importPdfViewports } = await import('../core/pdf/pdfScale');
    useCalibrationStore.getState().loadDocumentCalibrations(await importPdfCalibrations(bytes));
    useCalibrationStore.getState().loadDocumentViewports(await importPdfViewports(bytes));
  } catch (calErr) {
    useCalibrationStore.getState().loadDocumentCalibrations({});
    useCalibrationStore.getState().loadDocumentViewports({});
    const message = calErr instanceof Error ? calErr.message : String(calErr);
    showToast(`Could not read the page scales of the PDF: ${message}`);
  }

  // Modo demo o archivo sin ruta en disco: no intentar cargar .bbx.json ni importar anotaciones
  if (!filePath) {
    setCustomColumns(undefined);
    return;
  }

  // 1. Sidecar .bbx.json: metadatos del documento (columnas) y marcas de respaldo (D-1)
  let sidecarMarkups: Markup[] | null = null;
  try {
    const bbxResult = await loadBbxForPdf(filePath);
    if (bbxResult) {
      const { document: bbxData, warnings } = bbxResult;
      if (warnings && warnings.length > 0) {
        for (const warning of warnings) {
          console.warn(`[BBX] ${warning}`);
        }
        const summary = summarizeMigrationWarnings(warnings);
        if (summary) {
          showToast(summary);
        }
      }
      if (bbxData && Array.isArray(bbxData.customColumns)) {
        setCustomColumns(bbxData.customColumns);
      } else {
        setCustomColumns(undefined);
      }
      if (bbxData && Array.isArray(bbxData.markups)) {
        sidecarMarkups = bbxData.markups;
      }
    } else {
      setCustomColumns(undefined);
    }
  } catch (bbxErr: unknown) {
    const bbxMsg = bbxErr instanceof Error ? bbxErr.message : String(bbxErr);
    console.error(`[BBX] Error al leer archivo de marcas .bbx.json: ${bbxMsg}`);
    setCustomColumns(undefined);
  }

  // 2. El PDF es la fuente de verdad (D-1): si contiene anotaciones, mandan sobre el sidecar.
  //    Así, lo editado en Revu/Acrobat no se pisa con una copia vieja del sidecar al guardar.
  //    Sin anotaciones en el PDF (documento legado o aún no guardado en PDF), se usa el sidecar.
  const importedCount = await tryImportPdfAnnotations(bytes);
  if (importedCount === 0) {
    if (sidecarMarkups) {
      console.log(`[BBX] ${sidecarMarkups.length} marcas cargadas automáticamente desde .bbx.json`);
      setMarkups(sidecarMarkups);
    } else {
      setMarkups([]);
    }
  }
}

/**
 * Intenta importar marcas de anotaciones estándar ISO 32000-1 directamente del PDF.
 */
async function tryImportPdfAnnotations(bytes: Uint8Array): Promise<number> {
  const { setMarkups } = useMarkupStore.getState();
  if (!bytes || bytes.length === 0) {
    return 0;
  }
  try {
    const { importPdfAnnotations } = await import('../core/pdf/annotationReader');
    const pdfImport = await importPdfAnnotations(bytes);
    // Adjuntos embebidos en las marcas de REA (ADR-0027) y capas ocultas /OCG (ADR-0046/0053)
    useAttachmentStore.getState().resetAttachments(pdfImport.attachments);
    useUiStore.setState({ hiddenLayers: pdfImport.hiddenLayers ?? [] });
    useDocumentStore.getState().setImportedAnnotationIds(pdfImport.markups.map((m) => m.id));
    if (pdfImport.markups.length > 0) {
      console.log(`[PDF] ${pdfImport.markups.length} marcas importadas desde anotaciones PDF`);
      setMarkups(pdfImport.markups);
    }
    if (pdfImport.foreignUnsupportedCount > 0) {
      showToast(`The document contains ${pdfImport.foreignUnsupportedCount} non-editable annotations`);
    }
    return pdfImport.markups.length;
  } catch (pdfErr) {
    const message = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
    console.warn('[PDF] No se pudieron leer anotaciones estándar del PDF:', pdfErr);
    showToast(`Could not read the PDF annotations: ${message}`);
    return 0;
  }
}
