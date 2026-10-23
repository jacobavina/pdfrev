import React, { useEffect, useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { parsePageList } from '../../core/pages/pageNumbers';
import { DEFAULT_PRINT_DPI, LARGE_PRINT_JOB_PAGES, PRINT_DPIS, type PrintDpi, type PrintScale } from '../../core/print/printLayout';
import { showToast } from '../../services/toastService';

type Scope = 'current' | 'all' | 'range';

/**
 * Print (ADR-0115): elige páginas, si salen las marcas, el ajuste a la hoja y la calidad, y abre el diálogo de
 * impresión del sistema.
 */
export const PrintDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'print');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  const markupCount = useMarkupStore((s) => s.markups.filter((m) => !m.hidden).length);

  const [scope, setScope] = useState<Scope>('all');
  const [range, setRange] = useState('');
  const [withMarkups, setWithMarkups] = useState(true);
  const [scale, setScale] = useState<PrintScale>('fit');
  const [dpi, setDpi] = useState<PrintDpi>(DEFAULT_PRINT_DPI);
  const [grayscale, setGrayscale] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setProgress(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !progress && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, progress]);

  const pages = useMemo(() => {
    if (scope === 'current') return [currentPage];
    if (scope === 'all') return Array.from({ length: numPages }, (_, i) => i);
    return parsePageList(range, numPages);
  }, [scope, range, currentPage, numPages]);

  if (!open) return null;

  const problem = !pages ? 'Type the pages like 1-3, 5, 8-10.' : null;
  const busy = progress !== null;

  const run = async () => {
    if (!pages || problem) return;
    setProgress({ done: 0, total: pages.length });
    try {
      const svc = await import('../../services/printService');
      const res = await svc.printDocument({ pages, withMarkups, dpi, scale, grayscale, onProgress: (done, total) => setProgress({ done, total }) });
      if (!res.ok) showToast(res.message);
      close(null);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => !busy && close(null)}>
      <div
        role="dialog"
        aria-label="Print"
        data-testid="print-dialog"
        className="w-[440px] max-w-[94vw] bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border">
          <Printer size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Print</span>
          <button onClick={() => !busy && close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-gray-400 mb-1">Pages</legend>
            {(
              [
                ['all', `All pages (${numPages})`],
                ['current', `Current page (${currentPage + 1})`],
                ['range', 'Pages'],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="print-scope" data-testid={`print-scope-${id}`} checked={scope === id} onChange={() => setScope(id)} className="accent-cad-accent" />
                {label}
                {id === 'range' && (
                  <input
                    type="text"
                    data-testid="print-range"
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
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-gray-400 mb-1">Content</legend>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="print-content" data-testid="print-with-markups" checked={withMarkups} onChange={() => setWithMarkups(true)} className="accent-cad-accent" />
              Drawing and markups{markupCount > 0 ? ` (${markupCount})` : ''}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="print-content" data-testid="print-without-markups" checked={!withMarkups} onChange={() => setWithMarkups(false)} className="accent-cad-accent" />
              Drawing only
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-gray-400 mb-1">Size</legend>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="print-scale" data-testid="print-scale-fit" checked={scale === 'fit'} onChange={() => setScale('fit')} className="accent-cad-accent" />
              Fit to the paper you choose next
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="print-scale" data-testid="print-scale-actual" checked={scale === 'actual'} onChange={() => setScale('actual')} className="accent-cad-accent" />
              Actual size of each page (the paper must be as large as the page)
            </label>
          </fieldset>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="text-gray-400">Quality</span>
              <select data-testid="print-dpi" value={dpi} onChange={(e) => setDpi(Number(e.target.value) as PrintDpi)} className="ui-input">
                {PRINT_DPIS.map((d) => (
                  <option key={d} value={d}>
                    {d} dpi
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" data-testid="print-gray" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} className="accent-cad-accent" />
              Black and white
            </label>
          </div>
          {problem && (
            <p className="text-amber-400" data-testid="print-problem">
              {problem}
            </p>
          )}
          {pages && pages.length > LARGE_PRINT_JOB_PAGES && (
            <p className="text-amber-400" data-testid="print-large">
              {pages.length} pages will take a while to prepare. Print fewer pages at a time, or lower the quality.
            </p>
          )}
          {busy && (
            <p className="text-gray-300" data-testid="print-progress">
              Preparing page {Math.min(progress!.done + 1, progress!.total)} of {progress!.total}…
            </p>
          )}
          <p className="text-gray-500">The pages are prepared here and then the system print dialog opens, where you choose the printer, paper and copies.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border">
          <button type="button" className="ui-btn !px-3" disabled={busy} onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="print-apply" disabled={!!problem || busy} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Print…
          </button>
        </div>
      </div>
    </div>
  );
};
