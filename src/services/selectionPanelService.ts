import { useMarkupStore } from '../store/useMarkupStore';
import { useUiStore } from '../store/useUiStore';
import { panelForSelection } from '../core/markup/selectionPanel';

/**
 * Al seleccionar marcas se abre su panel (ADR-0043): Measure para mediciones, Properties para lo demás, como la barra
 * de propiedades de Revu. Se abre al soltar el botón: abrirlo al pulsar estrecharía el visor en medio de un arrastre.
 * Se apaga en View ▸ Open Panel on Selection. Devuelve la función que deja de vigilar.
 */
export function watchSelectionPanels(target: Window = window): () => void {
  let pressed = false;
  let pending: (() => void) | null = null;
  const onDown = () => {
    pressed = true;
  };
  const onUp = () => {
    pressed = false;
    const run = pending;
    pending = null;
    run?.();
  };
  target.addEventListener('pointerdown', onDown, true);
  target.addEventListener('pointerup', onUp, true);
  const unsubscribe = useMarkupStore.subscribe((state, prev) => {
    if (state.selectedMarkupIds === prev.selectedMarkupIds || state.selectedMarkupIds.length === 0) return;
    if (!useUiStore.getState().autoOpenPanels) return;
    const same =
      state.selectedMarkupIds.length === prev.selectedMarkupIds.length &&
      state.selectedMarkupIds.every((id) => prev.selectedMarkupIds.includes(id));
    if (same) return;
    const panel = panelForSelection(state.markups.filter((m) => state.selectedMarkupIds.includes(m.id)));
    const open = () => {
      const ui = useUiStore.getState();
      if (panel === 'measure') ui.requestMeasurementsPanel();
      else if (panel === 'properties') ui.requestPropertiesPanel();
    };
    if (pressed) pending = open;
    else open();
  });
  return () => {
    unsubscribe();
    target.removeEventListener('pointerdown', onDown, true);
    target.removeEventListener('pointerup', onUp, true);
  };
}
