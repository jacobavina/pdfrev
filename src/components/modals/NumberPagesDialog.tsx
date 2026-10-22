import React, { useEffect, useMemo, useState } from 'react';
import { ListOrdered, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { DEFAULT_NUMBER_COLOR, DEFAULT_NUMBER_FORMAT, formatPageNumber, parsePageList, type NumberPosition } from '../../core/pages/pageNumbers';
import { showToast } from '../../services/toastService';

type Scope = 'all' | 'current' | 'range';
const POSITIONS: { id: NumberPosition; label: string }[] = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-center', label: 'Top centre' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-center', label: 'Bottom centre' },
  { id: 'bottom-right', label: 'Bottom right' },
];

/**
 * Number Pages (ADR-0113): estampa en cada página elegida un texto con su número, como contenido del PDF.
 */
export const NumberPagesDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'number');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);

  const [format, setFormat] = useState(DEFAULT_NUMBER_FORMAT);
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [fontSize, setFontSize] = useState('10');
  const [marginMm, setMarginMm] = useState('10');
  const [color, setColor] = useState(DEFAULT_NUMBER_COLOR);
  const [startAt, setStartAt] = useState('1');
  const [font, setFont] = useState<'Helvetica' | 'Times' | 'Courier'>('Helvetica');
  const [scope, setScope] = useState<Scope>('all');
  const [range, setRange] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const pages = useMemo(() => {
    if (scope === 'all') return Array.from({ length: numPages }, (_, i) => i);
    if (scope === 'current') return [currentPage];
    return parsePageList(range, numPages);
  }, [scope, range, numPages, currentPage]);

  const start = Math.max(0, Math.floor(Number(startAt) || 0));
  const size = Number(fontSize);
  const sample = pages ? formatPageNumber(format, { n: start, total: start + pages.length - 1, page: pages[0] + 1, pages: numPages }) : '';
  const problem = !pages
    ? 'Type the pages like 1-3, 5, 8-10.'
    : !format.trim()
    ? 'Write the text to stamp, for example: Page {n} of {total}.'
    : !(size >= 4 && size <= 72)
    ? 'The size must be between 4 and 72 pt.'
    : null;

  if (!open) return null;

  const run = async () => {
    if (!pages || problem) return;
    setBusy(true);
    try {
      const svc = await import('../../services/documentEditService');
      const res = await svc.executeNumberPages({
        format,
        position,
        fontSize: size,
        margin: Math.max(0, Number(marginMm) || 0) * (72 / 25.4),
        color,
        startAt: start,
        pages,
        font,
      });
      showToast(res.message);
      if (res.ok) close(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => close(null)}>
      <div
        role="dialog"
        aria-label="Number pages"
        data-testid="number-pages-dialog"
        className="w-[460px] max-w-[94vw] bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border">
          <ListOrdered size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Number pages</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <span className="w-20 text-gray-400">Text</span>
            <input type="text" data-testid="number-format" value={format} onChange={(e) => setFormat(e.target.value)} className="ui-input flex-1" />
          </label>
          <p className="text-gray-500 -mt-1 pl-[88px]">
            <span className="ui-data">{'{n}'}</span> number, <span className="ui-data">{'{total}'}</span> last number, <span className="ui-data">{'{page}'}</span> sheet,{' '}
            <span className="ui-data">{'{pages}'}</span> sheets
          </p>
          <label className="flex items-center gap-2">
            <span className="w-20 text-gray-400">Position</span>
            <select data-testid="number-position" value={position} onChange={(e) => setPosition(e.target.value as NumberPosition)} className="ui-input">
              {POSITIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <label className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Size (pt)</span>
              <input type="number" min={4} max={72} data-testid="number-size" value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="ui-input w-16" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Margin (mm)</span>
              <input type="number" min={0} step="any" data-testid="number-margin" value={marginMm} onChange={(e) => setMarginMm(e.target.value)} className="ui-input w-16" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Start at</span>
              <input type="number" min={0} data-testid="number-start" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="ui-input w-16" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Colour</span>
              <input type="color" data-testid="number-color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 rounded border border-cad-border bg-transparent" />
            </label>
            <label className="flex items-center gap-2 col-span-2">
              <span className="w-20 text-gray-400">Font</span>
              <select data-testid="number-font" value={font} onChange={(e) => setFont(e.target.value as typeof font)} className="ui-input">
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
              </select>
            </label>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-gray-400 mb-1">Number</legend>
            {(
              [
                ['all', `All pages (${numPages})`],
                ['current', `Current page (${currentPage + 1})`],
                ['range', 'Pages'],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="number-scope" data-testid={`number-scope-${id}`} checked={scope === id} onChange={() => setScope(id)} className="accent-cad-accent" />
                {label}
                {id === 'range' && (
                  <input
                    type="text"
                    data-testid="number-range"
                    placeholder="1-3, 5"
                    value={range}
                    onFocus={() => setScope('range')}
                    onChange={(e) => {
                      setRange(e.target.value);
                      setScope('range');
                    }}
                    className="ui-input w-32"
                  />
                )}
              </label>
            ))}
          </fieldset>
          {problem ? (
            <p className="text-amber-400" data-testid="number-problem">
              {problem}
            </p>
          ) : (
            <p className="text-gray-300" data-testid="number-sample">
              The first page will read: <span className="ui-data">{sample}</span>
            </p>
          )}
          <p className="text-gray-500">The numbers become part of the page content and cannot be undone. Save a copy first if you may need the original.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border">
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="number-apply" disabled={!!problem || busy} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Number pages
          </button>
        </div>
      </div>
    </div>
  );
};
