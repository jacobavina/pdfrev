import React, { useEffect, useRef } from 'react';
import {
  SlidersHorizontal,
  Reply,
  Copy,
  CopyPlus,
  Lock,
  LockOpen,
  Trash2,
  Check,
  FlipHorizontal2,
  FlipVertical2,
} from 'lucide-react';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import { useToolStore } from '../../store/useToolStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { DEFAULT_PAGE_CALIBRATION } from '../../core/measurements/calculate';
import { MarkupStatus, VALID_MARKUP_STATUSES } from '../../types/markup';
import { markupTypeLabel } from '../../core/markup/typeLabels';
import {
  AlignMode,
  alignSelectedMarkups,
  distributeSelectedMarkups,
  flipSelectedMarkups,
} from '../../core/markup/transformTools';

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

const ALIGN_OPTIONS: { mode: AlignMode; short: string; title: string }[] = [
  { mode: 'left', short: 'L', title: 'Align Left' },
  { mode: 'center', short: 'C', title: 'Align Center' },
  { mode: 'right', short: 'R', title: 'Align Right' },
  { mode: 'top', short: 'T', title: 'Align Top' },
  { mode: 'middle', short: 'M', title: 'Align Middle' },
  { mode: 'bottom', short: 'B', title: 'Align Bottom' },
];

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
  const unitKeys = new Set(selected.map((m) => (m.groupId ? `g:${m.groupId}` : `i:${m.id}`)));
  const canAlign = unitKeys.size >= 2 && !allLocked;
  const canDistribute = unitKeys.size >= 3 && !allLocked;

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
  const top = Math.min(y, window.innerHeight - 440);

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
      {opts.shortcut && <span className="text-2xs text-gray-500">{opts.shortcut}</span>}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="canvas-context-menu"
      className="fixed z-50 w-56 bg-cad-panel border border-cad-border rounded-lg shadow-float p-1 text-xs select-none"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1 text-2xs uppercase tracking-wider text-gray-500 truncate">
        {selected.length > 1 ? `${selected.length} markups` : markupTypeLabel(first.type)}
      </div>
      {item('canvas-menu-properties', <SlidersHorizontal size={16} />, 'Properties', () =>
        useUiStore.getState().requestPropertiesPanel()
      )}
      {item(
        'canvas-menu-reply',
        <Reply size={16} />,
        'Reply…',
        () => useUiStore.getState().requestReply(first.id),
        { disabled: Boolean(first.locked) }
      )}
      {selected.length === 1 && (first.type === 'area' || first.type === 'volume') && (
        <>
          <div className="my-1 border-t border-cad-border" />
          <div className="px-3 py-0.5 text-2xs uppercase tracking-wider text-gray-500">Cutout</div>
          {item(
            'canvas-menu-add-cutout',
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
            'Add Cutout',
            () => {
              useUiStore.getState().startCutout(first.id);
              useToolStore.getState().setActiveTool('area');
            },
            { disabled: Boolean(first.locked) }
          )}
          {first.cutouts && first.cutouts.length > 0 &&
            item(
              'canvas-menu-clear-cutouts',
              <Trash2 size={16} />,
              `Clear Cutouts (${first.cutouts.length})`,
              () => {
                const dims = useUiStore.getState().pageDimensionsPt ?? { width: 612, height: 792 };
                const cal = useCalibrationStore.getState().calibrations[first.pageIndex] ?? DEFAULT_PAGE_CALIBRATION;
                useMarkupStore.getState().clearCutouts(first.id, dims, cal);
              },
              { danger: true, disabled: Boolean(first.locked) }
            )}
        </>
      )}
      <div className="my-1 border-t border-cad-border" />
      <div className="px-3 py-0.5 text-2xs uppercase tracking-wider text-gray-500">Status</div>
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
          {first.status === status && <Check size={16} className="text-cad-accent" />}
        </button>
      ))}
      <div className="my-1 border-t border-cad-border" />
      <div className="px-3 py-0.5 text-2xs uppercase tracking-wider text-gray-500">Transform</div>
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          data-testid="canvas-menu-flip-horizontal"
          disabled={allLocked}
          title="Flip Horizontal"
          onClick={() => {
            flipSelectedMarkups('horizontal');
            onClose();
          }}
          className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded border border-cad-border text-gray-200 hover:bg-cad-hover disabled:opacity-40"
        >
          <FlipHorizontal2 size={16} />
          <span className="text-2xs">Flip H</span>
        </button>
        <button
          type="button"
          data-testid="canvas-menu-flip-vertical"
          disabled={allLocked}
          title="Flip Vertical"
          onClick={() => {
            flipSelectedMarkups('vertical');
            onClose();
          }}
          className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded border border-cad-border text-gray-200 hover:bg-cad-hover disabled:opacity-40"
        >
          <FlipVertical2 size={16} />
          <span className="text-2xs">Flip V</span>
        </button>
      </div>
      {unitKeys.size >= 2 && (
        <div className="px-2 pb-1 space-y-1">
          <div className="grid grid-cols-6 gap-0.5">
            {ALIGN_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                type="button"
                data-testid={`canvas-menu-align-${opt.mode}`}
                disabled={!canAlign}
                title={opt.title}
                onClick={() => {
                  alignSelectedMarkups(opt.mode);
                  onClose();
                }}
                className="px-1 py-0.5 text-2xs rounded border border-cad-border text-gray-200 hover:bg-cad-hover disabled:opacity-40"
              >
                {opt.short}
              </button>
            ))}
          </div>
          {unitKeys.size >= 3 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="canvas-menu-distribute-horizontal"
                disabled={!canDistribute}
                title="Distribute Horizontally"
                onClick={() => {
                  distributeSelectedMarkups('horizontal');
                  onClose();
                }}
                className="flex-1 px-1.5 py-0.5 text-2xs rounded border border-cad-border text-gray-200 hover:bg-cad-hover disabled:opacity-40"
              >
                Dist. H
              </button>
              <button
                type="button"
                data-testid="canvas-menu-distribute-vertical"
                disabled={!canDistribute}
                title="Distribute Vertically"
                onClick={() => {
                  distributeSelectedMarkups('vertical');
                  onClose();
                }}
                className="flex-1 px-1.5 py-0.5 text-2xs rounded border border-cad-border text-gray-200 hover:bg-cad-hover disabled:opacity-40"
              >
                Dist. V
              </button>
            </div>
          )}
        </div>
      )}
      <div className="my-1 border-t border-cad-border" />
      {item('canvas-menu-copy', <Copy size={16} />, 'Copy', () => useMarkupStore.getState().copySelectedMarkups(), {
        shortcut: 'Ctrl+C',
      })}
      {item(
        'canvas-menu-duplicate',
        <CopyPlus size={16} />,
        'Duplicate',
        () => useMarkupStore.getState().duplicateSelectedMarkups(),
        { shortcut: 'Ctrl+D' }
      )}
      {item(
        'canvas-menu-lock',
        allLocked ? <LockOpen size={16} /> : <Lock size={16} />,
        allLocked ? 'Unlock' : 'Lock',
        () => useMarkupStore.getState().toggleLockSelectedMarkups()
      )}
      <div className="my-1 border-t border-cad-border" />
      {item(
        'canvas-menu-delete',
        <Trash2 size={16} />,
        'Delete',
        () => useMarkupStore.getState().deleteSelectedMarkups(),
        { danger: true, shortcut: 'Del', disabled: allLocked }
      )}
    </div>
  );
};
