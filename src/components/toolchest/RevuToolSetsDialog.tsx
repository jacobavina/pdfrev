import React, { useEffect, useState } from 'react';
import { FolderInput, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import type { RevuToolSetEntry } from '../../services/btxService';

/**
 * Tool Sets que Revu ya tiene instalados (ADR-0105): lista los `.btx` de la carpeta de datos de Revu del usuario y deja
 * elegir cuáles traer al Tool Chest como paletas.
 */
export const RevuToolSetsDialog: React.FC = () => {
  const open = useUiStore((s) => s.revuToolSetsOpen);
  const setOpen = useUiStore((s) => s.setRevuToolSetsOpen);
  const [entries, setEntries] = useState<RevuToolSetEntry[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    setPicked(new Set());
    void import('../../services/btxService').then(async (m) => {
      const list = await m.listRevuToolSets().catch(() => []);
      if (!cancelled) setEntries(list);
    });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  if (!open) return null;

  const toggle = (path: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const allPicked = entries !== null && entries.length > 0 && picked.size === entries.length;

  const run = async () => {
    setBusy(true);
    try {
      const m = await import('../../services/btxService');
      await m.importRevuToolSets([...picked]);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Import tool sets from Revu"
        data-testid="revu-toolsets-dialog"
        className="w-[520px] max-w-[94vw] max-h-[80vh] flex flex-col bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border shrink-0">
          <FolderInput size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Tool sets from Revu</span>
          <button onClick={() => setOpen(false)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3" data-testid="revu-toolsets-list">
          {entries === null && <div className="p-4 text-gray-400">Looking for tool sets installed with Revu…</div>}
          {entries !== null && entries.length === 0 && (
            <div className="p-4 text-gray-400" data-testid="revu-toolsets-empty">
              No Revu tool sets were found. They are kept in <span className="ui-data">%APPDATA%\Bluebeam Software\Revu</span>. You can also import a
              .btx file from anywhere with the upload button of the Tool Chest.
            </div>
          )}
          {entries !== null && entries.length > 0 && (
            <>
              <label className="flex items-center gap-2 px-2 py-1.5 text-gray-400">
                <input
                  type="checkbox"
                  data-testid="revu-toolsets-all"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(entries.map((e) => e.path)))}
                />
                Select all ({entries.length})
              </label>
              {entries.map((e) => (
                <label key={e.path} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-cad-hover cursor-pointer">
                  <input type="checkbox" data-testid={`revu-toolset-${e.fileName}`} checked={picked.has(e.path)} onChange={() => toggle(e.path)} />
                  <span className="flex-1 truncate text-gray-200">{e.title}</span>
                  <span className="ui-data text-gray-500">
                    {e.toolCount} tool{e.toolCount === 1 ? '' : 's'}
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border shrink-0">
          <button type="button" className="ui-btn !px-3" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="revu-toolsets-import"
            disabled={picked.size === 0 || busy}
            className="ui-btn ui-btn-primary !px-3 disabled:opacity-40"
            onClick={() => void run()}
          >
            Import {picked.size > 0 ? picked.size : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
