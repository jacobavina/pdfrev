import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { showToast } from '../../services/toastService';

/**
 * Acciones de Edit para pegar en el sitio, Format Painter y Hide (ADR-0109). Las usan el menú, el menú contextual y
 * los atajos.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pega las marcas copiadas en el mismo sitio de la página actual (Ctrl+Shift+V). */
export function pasteInPlace(): void {
  const store = useMarkupStore.getState();
  if (store.clipboardMarkups.length === 0) {
    showToast('Copy some markups first (Ctrl+C), then paste them in place.');
    return;
  }
  store.pasteMarkups(useDocumentStore.getState().currentPageIndex, { x: 0, y: 0 });
}

/** Format Painter, paso 1: toma el formato de la marca seleccionada (Ctrl+Shift+C). */
export function copyFormat(): void {
  if (useMarkupStore.getState().copyFormatOfSelection()) {
    showToast('Format copied. Select other markups and use Edit ▸ Paste Format (Ctrl+Alt+V).');
  } else {
    showToast('Select a markup to copy its format from.');
  }
}

/** Format Painter, paso 2: aplica el formato copiado a las marcas seleccionadas (Ctrl+Alt+V). */
export function pasteFormat(): void {
  const store = useMarkupStore.getState();
  if (!store.formatClipboard) {
    showToast('Copy a format first: select a markup and use Edit ▸ Copy Format (Ctrl+Shift+C).');
    return;
  }
  const n = store.pasteFormatToSelection();
  if (n === 0) showToast('Select the markups to paint. Locked markups, stamps and images keep their look.');
  else showToast(`Format applied to ${plural(n, 'markup', 'markups')}.`);
}

/** Oculta las marcas seleccionadas sin borrarlas. */
export function hideSelected(): void {
  const store = useMarkupStore.getState();
  const n = store.setMarkupsHidden(store.selectedMarkupIds, true);
  if (n === 0) showToast('Select unlocked markups to hide.');
  else showToast(`${plural(n, 'markup', 'markups')} hidden. Edit ▸ Show Hidden Markups brings them back.`);
}

/** Vuelve a mostrar todas las marcas ocultas. */
export function showHidden(): void {
  const n = useMarkupStore.getState().setMarkupsHidden(null, false);
  showToast(n === 0 ? 'There are no hidden markups.' : `${plural(n, 'hidden markup', 'hidden markups')} shown again.`);
}
