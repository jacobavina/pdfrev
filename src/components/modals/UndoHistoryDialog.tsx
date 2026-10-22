import React, { useEffect, useMemo } from 'react';
import { History, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { markupHistory, useMarkupStore } from '../../store/useMarkupStore';

/**
 * Historial de cambios (ADR-0110): lista lo hecho y lo rehacible, y al elegir un paso el documento vuelve (o avanza)
 * a ese punto con la cantidad de Undo o Redo necesarios.
 */
export const UndoHistoryDialog: React.FC = () => {
  const open = useUiStore((s) => s.undoHistoryOpen);
  const setOpen = useUiStore((s) => s.setUndoHistoryOpen);
  const revision = useMarkupStore((s) => s.historyRevision);
  const jump = useMarkupStore((s) => s.jumpInHistory);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // La lista depende de `revision`, que cambia con cada paso del historial
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { past, future } = useMemo(() => markupHistory.getEntries(), [revision, open]);

  if (!open) return null;

  // Posición actual: tras el último paso hecho. Cada fila es un estado; elegirla lleva el documento a ese estado.
  const rows = [
    { label: 'Document as opened', step: 0 },
    ...past.map((d, i) => ({ label: d, step: i + 1 })),
    ...future.map((d, i) => ({ label: d, step: past.length + i + 1 })),
  ];
  const current = past.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Undo history"
        data-testid="undo-history-dialog"
        className="w-[420px] max-w-[94vw] max-h-[80vh] flex flex-col bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border shrink-0">
          <History size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Undo history</span>
          <button onClick={() => setOpen(false)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <ol className="flex-1 overflow-y-auto p-2" data-testid="undo-history-list">
          {rows.map((r) => {
            const isCurrent = r.step === current;
            const isFuture = r.step > current;
            return (
              <li key={r.step}>
                <button
                  type="button"
                  data-testid={`undo-history-step-${r.step}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => {
                    jump(r.step - current);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-cad-hover ${
                    isCurrent ? 'bg-cad-hover text-cad-strong ring-1 ring-inset ring-gray-500/60' : isFuture ? 'text-gray-500' : 'text-gray-200'
                  }`}
                >
                  <span className="ui-data w-6 shrink-0 text-right text-gray-500">{r.step}</span>
                  <span className="flex-1 truncate">{r.label}</span>
                  {isCurrent && <span className="text-gray-400">You are here</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="px-4 py-2 border-t border-cad-border text-gray-500 shrink-0">
          Pick a step to go back to it. Steps in grey can be redone until you make a new change. The history keeps the last 50 changes.
        </p>
      </div>
    </div>
  );
};
