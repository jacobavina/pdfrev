import React, { useEffect, useMemo, useState } from 'react';
import { Crop, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { parsePageList } from '../../core/pages/pageNumbers';
import type { CropPreview, CropRequest } from '../../services/documentEditService';
import { showToast } from '../../services/toastService';
import { formatPageSize } from './DocumentPropertiesDialog';

type Unit = 'mm' | 'in' | 'pt';
const PT_PER_UNIT: Record<Unit, number> = { mm: 72 / 25.4, in: 72, pt: 1 };
type Scope = 'current' | 'all' | 'range';

/**
 * Crop Pages (ADR-0113): recorta márgenes de las páginas elegidas (CropBox del PDF) y pasa las marcas al nuevo
 * origen. El recorte no borra nada del archivo: "Restore full page" devuelve la página entera.
 */
export const CropPagesDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'crop');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  const pdfBytes = useDocumentStore((s) => s.pdfBytes);
  const markupCount = useMarkupStore((s) => s.markups.length);

  const [unit, setUnit] = useState<Unit>('mm');
  const [m, setM] = useState({ top: '10', right: '10', bottom: '10', left: '10' });
  const [scope, setScope] = useState<Scope>('current');
  const [range, setRange] = useState('');
  const [preview, setPreview] = useState<CropPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const pages = useMemo(() => {
    if (scope === 'current') return [currentPage];
    if (scope === 'all') return Array.from({ length: numPages }, (_, i) => i);
    return parsePageList(range, numPages);
  }, [scope, range, currentPage, numPages]);

  const margins = useMemo(() => {
    const f = PT_PER_UNIT[unit];
    const n = (v: string) => Math.max(0, Number(v) || 0) * f;
    return { top: n(m.top), right: n(m.right), bottom: n(m.bottom), left: n(m.left) };
  }, [m, unit]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Qué pasaría con estos márgenes: tamaño resultante y marcas que no cabrían
  useEffect(() => {
    if (!open || !pages || !pdfBytes) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void import('../../services/documentEditService').then((svc) =>
      svc.previewCrop({ pages, margins }).then((p) => !cancelled && setPreview(p))
    );
    return () => {
      cancelled = true;
    };
  }, [open, pages, margins, pdfBytes, markupCount]);

  if (!open) return null;

  const outsideTotal = preview ? Object.values(preview.outside).reduce((a, b) => a + b, 0) : 0;
  const problem = !pages
    ? 'Type the pages like 1-3, 5, 8-10.'
    : preview && preview.tooSmall.length > 0
    ? `These margins leave page ${preview.tooSmall[0] + 1} too small.`
    : outsideTotal > 0
    ? `${outsideTotal} markup${outsideTotal === 1 ? '' : 's'} would fall outside the crop. Move or delete them, or use smaller margins.`
    : null;

  const run = async (req: CropRequest) => {
    setBusy(true);
    try {
      const svc = await import('../../services/documentEditService');
      const res = await svc.executeCropPages(req);
      showToast(res.message);
      if (res.ok) close(null);
    } finally {
      setBusy(false);
    }
  };

  const input = (key: keyof typeof m, label: string) => (
    <label className="flex items-center gap-2">
      <span className="w-14 text-gray-400">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        data-testid={`crop-${key}`}
        value={m[key]}
        onChange={(e) => setM((prev) => ({ ...prev, [key]: e.target.value }))}
        className="ui-input w-20"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => close(null)}>
      <div
        role="dialog"
        aria-label="Crop pages"
        data-testid="crop-pages-dialog"
        className="w-[440px] max-w-[94vw] bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border">
          <Crop size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Crop pages</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-gray-400">Trims the margins of the pages. Nothing is deleted from the file: Restore full page brings them back.</p>
          <div className="flex items-center gap-2">
            <span className="w-14 text-gray-400">Units</span>
            <select data-testid="crop-unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="ui-input">
              <option value="mm">Millimetres</option>
              <option value="in">Inches</option>
              <option value="pt">Points</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {input('top', 'Top')}
            {input('bottom', 'Bottom')}
            {input('left', 'Left')}
            {input('right', 'Right')}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-gray-400 mb-1">Apply to</legend>
            {(
              [
                ['current', `Current page (${currentPage + 1})`],
                ['all', `All pages (${numPages})`],
                ['range', 'Pages'],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="crop-scope" data-testid={`crop-scope-${id}`} checked={scope === id} onChange={() => setScope(id)} className="accent-cad-accent" />
                {label}
                {id === 'range' && (
                  <input
                    type="text"
                    data-testid="crop-range"
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
          {preview?.resultSize && !problem && (
            <p className="text-gray-300" data-testid="crop-result">
              Page {preview.resultSize.pageIndex + 1} will measure {formatPageSize(preview.resultSize)}.
            </p>
          )}
          {problem && (
            <p className="text-amber-400" data-testid="crop-problem">
              {problem}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 h-12 border-t border-cad-border">
          <button type="button" data-testid="crop-restore" disabled={!pages || busy} className="ui-btn !px-3 disabled:opacity-40" onClick={() => pages && void run({ pages, restore: true })}>
            Restore full page
          </button>
          <span className="flex-1" />
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="crop-apply"
            disabled={!pages || !!problem || busy}
            className="ui-btn ui-btn-primary !px-3 disabled:opacity-40"
            onClick={() => pages && void run({ pages, margins })}
          >
            Crop
          </button>
        </div>
      </div>
    </div>
  );
};
