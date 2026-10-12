import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { ALL_TOOLS } from './toolDefinitions';

const GENERAL: [string, string][] = [
  ['Ctrl+O', 'Abrir PDF'],
  ['Ctrl+S', 'Guardar las marcas en el PDF'],
  ['Ctrl+Z / Ctrl+Y', 'Deshacer / Rehacer'],
  ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copiar / Pegar / Duplicar marcas'],
  ['Supr', 'Eliminar la selección'],
  ['Ctrl+F', 'Buscar texto en el plano'],
  ['Ctrl+rueda', 'Acercar / alejar en el punto del cursor'],
  ['Ctrl+0 / Ctrl+1 / Ctrl+2', 'Ajustar a página / Tamaño real / Ajustar al ancho'],
  ['Enter / doble clic', 'Cerrar polígono, polilínea o área'],
  ['Esc', 'Cancelar el trazo o cerrar menús'],
  ['Clic derecho', 'Menú contextual de la marca'],
  ['F1', 'Esta ayuda'],
];

/** Diálogo de atajos de teclado (menú Ayuda o F1). */
export const ShortcutsDialog: React.FC = () => {
  const { shortcutsOpen, setShortcutsOpen } = useUiStore();

  useEffect(() => {
    if (!shortcutsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShortcutsOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcutsOpen, setShortcutsOpen]);

  if (!shortcutsOpen) return null;
  const toolShortcuts = ALL_TOOLS.filter((t) => t.shortcut);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => setShortcutsOpen(false)}>
      <div
        role="dialog"
        aria-label="Atajos de teclado"
        data-testid="shortcuts-dialog"
        className="w-[560px] max-h-[80vh] overflow-y-auto bg-cad-ribbon border border-cad-border rounded-lg shadow-2xl text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-10 border-b border-cad-border">
          <span className="font-semibold text-cad-strong text-sm">Atajos de teclado</span>
          <button onClick={() => setShortcutsOpen(false)} title="Cerrar" className="p-1 rounded hover:bg-cad-hover">
            <X size={15} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-6 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">General</div>
            {GENERAL.map(([k, d]) => (
              <div key={k} className="flex justify-between gap-3 py-1 border-b border-cad-border/60">
                <span>{d}</span>
                <kbd className="font-mono text-gray-400 whitespace-nowrap">{k}</kbd>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Herramientas</div>
            {toolShortcuts.map((t) => (
              <div key={t.type} className="flex justify-between gap-3 py-1 border-b border-cad-border/60">
                <span>{t.short}</span>
                <kbd className="font-mono text-gray-400">{t.shortcut}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
