import { isTauriEnvironment, loadBbxForPdf } from './bbxPersistenceService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { loadPdfDocument } from './pdfService';
import { showToast } from './toastService';

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
      const fileName = filePath.split(/[/\\]/).pop() || 'documento.pdf';
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
    setError(`Error al abrir archivo PDF: ${message}`);
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
    return `${total} avisos al abrir el documento: ${items}`;
  }

  const firstThree = warnings.slice(0, 3).map(truncate).join('; ');
  const remaining = total - 3;
  return `${total} avisos al abrir el documento: ${firstThree} (y ${remaining} más, ver consola)`;
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
    setError(`Error al procesar PDF: ${message}`);
    return;
  }

  // Modo demo o archivo sin ruta en disco: no intentar cargar .bbx.json ni importar anotaciones
  if (!filePath) {
    setCustomColumns(undefined);
    return;
  }

  // Cargar automáticamente .bbx.json si existe (independiente del procesamiento del PDF)
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
        console.log(`[BBX] ${bbxData.markups.length} marcas cargadas automáticamente desde .bbx.json`);
        setMarkups(bbxData.markups);
      } else {
        setMarkups([]);
      }
    } else {
      setCustomColumns(undefined);
      await tryImportPdfAnnotations(bytes);
    }
  } catch (bbxErr: unknown) {
    const bbxMsg = bbxErr instanceof Error ? bbxErr.message : String(bbxErr);
    console.error(`[BBX] Error al leer archivo de marcas .bbx.json: ${bbxMsg}`);
    setCustomColumns(undefined);
    await tryImportPdfAnnotations(bytes);
  }
}

/**
 * Intenta importar marcas de anotaciones estándar ISO 32000-1 directamente del PDF.
 */
async function tryImportPdfAnnotations(bytes: Uint8Array): Promise<void> {
  const { setMarkups } = useMarkupStore.getState();
  if (!bytes || bytes.length === 0) {
    setMarkups([]);
    return;
  }
  try {
    const { importPdfAnnotations } = await import('../core/pdf/annotationReader');
    const pdfImport = await importPdfAnnotations(bytes);
    if (pdfImport.markups.length > 0) {
      console.log(`[PDF] ${pdfImport.markups.length} marcas importadas desde anotaciones PDF`);
      setMarkups(pdfImport.markups);
    } else {
      setMarkups([]);
    }
    if (pdfImport.foreignUnsupportedCount > 0) {
      showToast(`Documento contiene ${pdfImport.foreignUnsupportedCount} anotaciones no editables`);
    }
  } catch (pdfErr) {
    console.warn('[PDF] No se pudieron leer anotaciones estándar del PDF:', pdfErr);
    setMarkups([]);
  }
}
