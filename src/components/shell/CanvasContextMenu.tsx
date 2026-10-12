import React, { useEffect, useRef } from 'react';
import { SlidersHorizontal, Copy, CopyPlus, Lock, LockOpen, Trash2, Check } from 'lucide-react';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import { MarkupStatus, VALID_MARKUP_STATUSES } from '../../types/markup';
import { markupTypeLabel } from '../../core/markup/typeLabels';

const STATUS_LABELS: Record<MarkupStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_DOT: Record<MarkupStatus, string> = {
  pending: 'bg-amber-400',
  accepted: 'bg-emerald-500',
  rejected: 'bg-rose-500',
  completed: 'bg-blue-500',
  cancelled: 'bg-zinc-400',
};

/**
 * Menú contextual de marcas sobre el plano (ADR-0017). Actúa sobre la selección actual, que el visor
 * ajusta antes de abrirlo (clic derecho sobre una marca no seleccionada la selecciona).
 * Cada acción usa los comandos del store, así que todas se deshacen con Ctrl+Z.
 */
export const CanvasContextMenu: React.FC<{ x: number; y: number; onClose: () => void }> = ({ x, y, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { markups, selectedMarkupIds, updateMarkupStatus } = useMarkupStore();
  const selected = markups.filter((m) => selectedMarkupIds.includes(m.id));
  const first = selected[0];
  const allLocked = selected.length > 0 && selected.every((m) => m.locked);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!first) return null;

  // Mantener el menú dentro de la ventana
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - 330);

  const item = (
    testId: string,
    icon: React.ReactNode,
    label: string,
    action: () => void,
    opts: { danger?: boolean; disabled?: boolean; shortcut?: string } = {}
  ) => (
    <button
      type="button"
      data-testid={testId}
      disabled={opts.disabled}
      onClick={() => {
        action();
        onClose();
      }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left disabled:opacity-40 ${
        opts.danger ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10' : 'text-gray-200 hover:bg-cad-hover'
      }`}
    >
      <span className="w-4 flex justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {opts.shortcut && <span className="text-[10px] font-mono text-gray-500">{opts.shortcut}</span>}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="canvas-context-menu"
      className="fixed z-50 w-56 bg-cad-ribbon border border-cad-border rounded shadow-2xl py-1 text-xs select-none"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 truncate">
        {selected.length > 1 ? `${selected.length} markups` : markupTypeLabel(first.type)}
      </div>
      {item('canvas-menu-properties', <SlidersHorizontal size={13} />, 'Properties', () =>
        useUiStore.getState().requestPropertiesPanel()
      )}
      <div className="my-1 border-t border-cad-border" />
      <div className="px-3 py-0.5 text-[10px] uppercase tracking-wider text-gray-500">Status</div>
      {VALID_MARKUP_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          data-testid={`canvas-menu-status-${status}`}
          onClick={() => {
            updateMarkupStatus(first.id, status);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-1 text-left text-gray-200 hover:bg-cad-hover"
        >
          <span className="w-4 flex justify-center">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
          </span>
          <span className="flex-1">{STATUS_LABELS[status]}</span>
          {first.status === status && <Check size={12} className="text-cad-accent" />}
        </button>
      ))}
      <div className="my-1 border-t border-cad-border" />
      {item('canvas-menu-copy', <Copy size={13} />, 'Copy', () => useMarkupStore.getState().copySelectedMarkups(), {
        shortcut: 'Ctrl+C',
      })}
      {item(
        'canvas-menu-duplicate',
        <CopyPlus size={13} />,
        'Duplicate',
        () => useMarkupStore.getState().duplicateSelectedMarkups(),
        { shortcut: 'Ctrl+D' }
      )}
      {item(
        'canvas-menu-lock',
        allLocked ? <LockOpen size={13} /> : <Lock size={13} />,
        allLocked ? 'Unlock' : 'Lock',
        () => useMarkupStore.getState().toggleLockSelectedMarkups()
      )}
      <div className="my-1 border-t border-cad-border" />
      {item(
        'canvas-menu-delete',
        <Trash2 size={13} />,
        'Delete',
        () => useMarkupStore.getState().deleteSelectedMarkups(),
        { danger: true, shortcut: 'Del', disabled: allLocked }
      )}
    </div>
  );
};
