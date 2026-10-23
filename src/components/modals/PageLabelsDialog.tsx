import React, { useEffect, useMemo, useState } from 'react';
import { Hash, Plus, Trash2, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { buildPageLabelsMap, type PageLabelRange, type PageLabelStyle } from '../../core/pdf/pageLabels';
import { showToast } from '../../services/toastService';

interface Row {
  key: number;
  start: string;
  style: PageLabelStyle | '';
  prefix: string;
  startNum: string;
}

const STYLES: { id: PageLabelStyle | ''; label: string }[] = [
  { id: 'D', label: '1, 2, 3' },
  { id: 'R', label: 'I, II, III' },
  { id: 'r', label: 'i, ii, iii' },
  { id: 'A', label: 'A, B, C' },
  { id: 'a', label: 'a, b, c' },
  { id: '', label: 'Prefix only' },
];

let rowKey = 0;
const toRow = (r: PageLabelRange): Row => ({ key: ++rowKey, start: String(r.startPage + 1), style: r.style ?? '', prefix: r.prefix ?? '', startNum: String(r.startNum ?? 1) });

/**
 * Page Labels (ADR-0124): cómo se numeran las páginas en el visor y en la lista de miniaturas ("Cover", "i, ii", "A-101…").
 * Cada fila es un rango que empieza en una página y llega hasta el siguiente.
 */
export const PageLabelsDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'labels');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);
  const pdfBytes = useDocumentStore((s) => s.pdfBytes);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !pdfBytes) return;
    let cancelled = false;
    setRows(null);
    void import('../../core/pdf/pageLabels').then(async (m) => {
      const ranges = await m.readPageLabelRanges(pdfBytes);
      if (!cancelled) setRows(ranges.length > 0 ? ranges.map(toRow) : [toRow({ startPage: 0, style: 'D' })]);
    });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, pdfBytes, close]);

  const parsed = useMemo((): { error?: string; ranges?: PageLabelRange[] } | null => {
    if (!rows) return null;
    const ranges: PageLabelRange[] = [];
    const seen = new Set<number>();
    for (const r of rows) {
      const start = Number(r.start);
      const num = Number(r.startNum);
      if (!Number.isInteger(start) || start < 1 || start > numPages) return { error: `The start page must be between 1 and ${numPages}.` };
      if (seen.has(start)) return { error: `Two rows start on page ${start}.` };
      if (!Number.isInteger(num) || num < 1) return { error: 'The first number must be 1 or more.' };
      seen.add(start);
      ranges.push({ startPage: start - 1, style: r.style || undefined, prefix: r.prefix || undefined, startNum: num });
    }
    return { ranges };
  }, [rows, numPages]);

  const preview = useMemo(() => {
    if (!parsed?.ranges) return [];
    const map = buildPageLabelsMap(parsed.ranges, numPages);
    return Array.from({ length: Math.min(numPages, 12) }, (_, i) => map[i]);
  }, [parsed, numPages]);

  if (!open) return null;

  const update = (key: number, patch: Partial<Row>) => setRows((prev) => prev && prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () =>
    setRows((prev) => {
      const last = prev && prev.length > 0 ? Math.max(...prev.map((r) => Number(r.start) || 1)) : 0;
      return [...(prev ?? []), toRow({ startPage: Math.min(numPages - 1, last), style: 'D' })];
    });

  const run = async (ranges: PageLabelRange[]) => {
    setBusy(true);
    try {
      const svc = await import('../../services/pageToolsService');
      const res = await svc.executePageLabels(ranges);
      showToast(res.message);
      if (res.ok) close(null);
    } finally {
      setBusy(false);
    }
  };

  const error = parsed?.error ?? null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => close(null)}>
      <div
        role="dialog"
        aria-label="Page labels"
        data-testid="page-labels-dialog"
        className="w-[560px] max-w-[94vw] max-h-[90vh] flex flex-col bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border shrink-0">
          <Hash size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Page labels</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-gray-400">The label is the name the viewer shows for a page (for example "A-101" or "ii"). Each row starts on a page and runs until the next row.</p>
          {!rows && <p className="text-gray-500">Reading the labels…</p>}
          {rows && (
            <div className="flex flex-col gap-1.5" data-testid="labels-rows">
              <div className="grid grid-cols-[4.5rem_9rem_1fr_5rem_1.75rem] gap-2 text-2xs text-gray-500">
                <span>From page</span>
                <span>Style</span>
                <span>Prefix</span>
                <span>First no.</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div key={r.key} className="grid grid-cols-[4.5rem_9rem_1fr_5rem_1.75rem] gap-2 items-center" data-testid={`labels-row-${i}`}>
                  <input type="number" min={1} max={numPages} data-testid={`labels-start-${i}`} value={r.start} onChange={(e) => update(r.key, { start: e.target.value })} className="ui-input !h-6" />
                  <select data-testid={`labels-style-${i}`} value={r.style} onChange={(e) => update(r.key, { style: e.target.value as PageLabelStyle | '' })} className="ui-input !h-6">
                    {STYLES.map((s) => (
                      <option key={s.id || 'none'} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input type="text" data-testid={`labels-prefix-${i}`} value={r.prefix} onChange={(e) => update(r.key, { prefix: e.target.value })} className="ui-input !h-6" />
                  <input type="number" min={1} data-testid={`labels-first-${i}`} value={r.startNum} disabled={!r.style} onChange={(e) => update(r.key, { startNum: e.target.value })} className="ui-input !h-6 disabled:opacity-40" />
                  <button type="button" data-testid={`labels-remove-${i}`} disabled={rows.length === 1} onClick={() => setRows((prev) => prev && prev.filter((x) => x.key !== r.key))} title="Remove this range" className="p-0.5 rounded text-gray-400 hover:text-cad-strong disabled:opacity-30">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div>
                <button type="button" data-testid="labels-add" onClick={add} className="ui-btn !h-6 !px-1.5 !text-2xs flex items-center gap-1">
                  <Plus size={16} /> Add range
                </button>
              </div>
            </div>
          )}
          {error ? (
            <p className="text-amber-400" data-testid="labels-problem">
              {error}
            </p>
          ) : (
            rows && (
              <p className="text-gray-300" data-testid="labels-preview">
                Pages will read: <span className="ui-data">{preview.join(' · ')}</span>
                {numPages > preview.length ? ' …' : ''}
              </p>
            )
          )}
        </div>
        <div className="flex items-center gap-2 px-4 h-12 border-t border-cad-border shrink-0">
          <button type="button" data-testid="labels-clear" disabled={busy || !rows} className="ui-btn !px-3 disabled:opacity-40" onClick={() => void run([])}>
            Remove all labels
          </button>
          <span className="flex-1" />
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="labels-apply" disabled={!!error || busy || !parsed} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => parsed?.ranges && void run(parsed.ranges)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
