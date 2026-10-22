import React, { useEffect, useState } from 'react';
import { CopyPlus, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { canOffset, multiplyMarkups, offsetMarkups, MULTIPLY_MAX_COPIES, type CopyResult } from '../../core/markup/copyTools';
import { showToast } from '../../services/toastService';

/**
 * Offset y Multiply de la selección (ADR-0107). Las distancias van en las unidades de la escala de la página.
 */
export const CopyToolsDialog: React.FC = () => {
  const mode = useUiStore((s) => s.copyToolDialog);
  const close = useUiStore((s) => s.setCopyToolDialog);
  const selectedIds = useMarkupStore((s) => s.selectedMarkupIds);
  const markups = useMarkupStore((s) => s.markups);
  const page = useDocumentStore((s) => s.currentPageIndex);
  const calib = useCalibrationStore((s) => s.calibrations[page]);
  const unit = calib?.unit ?? 'mm';

  const [distance, setDistance] = useState('10');
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [rows, setRows] = useState('2');
  const [columns, setColumns] = useState('2');
  const [gapX, setGapX] = useState('0');
  const [gapY, setGapY] = useState('0');

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, close]);

  if (!mode) return null;

  const selected = markups.filter((m) => selectedIds.includes(m.id) && !m.locked);
  const offsettable = selected.filter(canOffset).length;

  const apply = () => {
    const { pageDimensions, scale } = useDocumentStore.getState();
    const dim = pageDimensions[selected[0]?.pageIndex ?? page];
    if (!dim || selected.length === 0) {
      showToast('Select at least one markup first.');
      return;
    }
    // pageDimensions guarda el tamaño de la página a la escala de la vista: aquí se necesita en puntos PDF
    const dims = { width: dim.width / (scale || 1), height: dim.height / (scale || 1) };
    const cal = useCalibrationStore.getState();
    const result: CopyResult =
      mode === 'offset'
        ? offsetMarkups(selected, { distance: Number(distance), side }, (m, pts) => cal.getEffectiveCalibration(m.pageIndex, pts), dims)
        : multiplyMarkups(
            selected,
            { rows: Number(rows), columns: Number(columns), gapX: Number(gapX) || 0, gapY: Number(gapY) || 0 },
            cal.getEffectiveCalibration(selected[0].pageIndex),
            dims
          );
    if (result.created.length === 0) {
      showToast(result.reason ?? (mode === 'offset' ? 'Nothing could be offset: these markups have no parallel copy.' : 'No copy fits on the page.'));
      return;
    }
    const store = useMarkupStore.getState();
    store.addMarkups(result.created, mode === 'offset' ? `Offset ${result.created.length} markup${result.created.length === 1 ? '' : 's'}` : `Multiply (${result.created.length} copies)`);
    store.setSelectedMarkupIds(result.created.map((m) => m.id));
    close(null);
    if (result.skipped > 0) {
      showToast(
        mode === 'offset'
          ? `${result.skipped} markup${result.skipped === 1 ? '' : 's'} could not be offset.`
          : `${result.skipped} cop${result.skipped === 1 ? 'y was' : 'ies were'} left out because they do not fit on the page.`
      );
    }
  };

  const num = (v: string, set: (s: string) => void, testId: string, label: string, suffix?: string, min = 0) => (
    <label className="flex items-center gap-2">
      <span className="w-28 text-gray-400">{label}</span>
      <input type="number" min={min} step="any" data-testid={testId} value={v} onChange={(e) => set(e.target.value)} className="ui-input w-24" />
      {suffix && <span className="text-gray-500">{suffix}</span>}
    </label>
  );

  const rowsN = Math.floor(Number(rows));
  const colsN = Math.floor(Number(columns));
  const invalid =
    selected.length === 0 ||
    (mode === 'offset'
      ? !(Number(distance) > 0) || offsettable === 0
      : !(rowsN >= 1 && colsN >= 1) || rowsN * colsN < 2 || rowsN * colsN > MULTIPLY_MAX_COPIES);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => close(null)}>
      <div
        role="dialog"
        aria-label={mode === 'offset' ? 'Offset' : 'Multiply'}
        data-testid="copytools-dialog"
        className="w-[380px] max-w-[94vw] bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Enter' && !invalid && apply()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border">
          <CopyPlus size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">{mode === 'offset' ? 'Offset' : 'Multiply'}</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {mode === 'offset' ? (
            <>
              <p className="text-gray-400">Makes a parallel copy of each selected line, polyline or closed shape at the distance you choose.</p>
              {num(distance, setDistance, 'offset-distance', 'Distance', unit, 0)}
              <div className="flex items-center gap-2">
                <span className="w-28 text-gray-400">Side</span>
                <div className="flex gap-1">
                  {(['left', 'right'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-testid={`offset-side-${s}`}
                      aria-pressed={side === s}
                      onClick={() => setSide(s)}
                      className={`px-2.5 h-7 rounded-md ${side === s ? 'bg-cad-hover text-cad-strong ring-1 ring-inset ring-gray-500/60' : 'bg-cad-field text-gray-400 hover:text-cad-strong'}`}
                    >
                      {s === 'left' ? 'Left / Outside' : 'Right / Inside'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-gray-500" data-testid="offset-note">
                Left and right follow the drawing direction of lines; closed shapes grow (outside) or shrink (inside).
                {selected.length > 0 && offsettable < selected.length && ` ${selected.length - offsettable} selected markup(s) cannot be offset.`}
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-400">Repeats the selection as a block in rows and columns. The original stays in the top-left cell.</p>
              {num(rows, setRows, 'multiply-rows', 'Rows', undefined, 1)}
              {num(columns, setColumns, 'multiply-columns', 'Columns', undefined, 1)}
              {num(gapX, setGapX, 'multiply-gap-x', 'Gap across', unit, -1e9)}
              {num(gapY, setGapY, 'multiply-gap-y', 'Gap down', unit, -1e9)}
              <p className="text-gray-500">The gap is measured from edge to edge. Cells that would fall outside the page are left out.</p>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border">
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="copytools-apply" disabled={invalid} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={apply}>
            {mode === 'offset' ? 'Offset' : 'Multiply'}
          </button>
        </div>
      </div>
    </div>
  );
};
