import { isTauriEnvironment, loadBbxForPdf } from './bbxPersistenceService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { loadPdfDocument } from './pdfService';

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
 * Carga los bytes del PDF, inicializa el visor y busca el archivo .bbx.json asociado
 */
export async function loadPdfData(
  filePath: string,
  fileName: string,
  bytes: Uint8Array
): Promise<void> {
  const { setDocument, setError } = useDocumentStore.getState();
  const { setMarkups } = useMarkupStore.getState();

  try {
    const pdfDoc = await loadPdfDocument(bytes);
    const numPages = pdfDoc.numPages;

    setDocument(filePath, fileName, bytes, numPages, pdfDoc);

    // Cargar automáticamente .bbx.json si existe
    const bbxData = await loadBbxForPdf(filePath);
    if (bbxData && Array.isArray(bbxData.markups)) {
      console.log(`[BBX] ${bbxData.markups.length} marcas cargadas automáticamente desde .bbx.json`);
      setMarkups(bbxData.markups);
    } else {
      setMarkups([]);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setError(`Error al procesar PDF: ${message}`);
  }
}
