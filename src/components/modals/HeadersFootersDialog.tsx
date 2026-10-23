import React, { useEffect, useMemo, useState } from 'react';
import { PanelTop, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { DEFAULT_NUMBER_COLOR, parsePageList } from '../../core/pages/pageNumbers';
import { EMPTY_SLOTS, HEADER_FOOTER_FIELDS, baseFileName, hasAnySlot, resolveSlots, type HeaderFooterOptions, type HeaderFooterSlots } from '../../core/pages/headersFooters';
import { showToast } from '../../services/toastService';

type Scope = 'all' | 'current' | 'range';

const SLOT_LABELS: { key: keyof HeaderFooterSlots; label: string }[] = [
  { key: 'headerLeft', label: 'Left' },
  { key: 'headerCenter', label: 'Centre' },
  { key: 'headerRight', label: 'Right' },
  { key: 'footerLeft', label: 'Left' },
  { key: 'footerCenter', label: 'Centre' },
  { key: 'footerRight', label: 'Right' },
];

/**
 * Headers & Footers (ADR-0114): hasta seis textos por página, con campos que se rellenan por página, estampados como
 * contenido del PDF.
 */
export const HeadersFootersDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'headerFooter');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  const fileName = useDocumentStore((s) => s.fileName);

  const [slots, setSlots] = useState<HeaderFooterSlots>({ ...EMPTY_SLOTS, footerCenter: 'Page {n} of {total}' });
  const [fontSize, setFontSize] = useState('9');
  const [marginMm, setMarginMm] = useState('10');
  const [color, setColor] = useState(DEFAULT_NUMBER_COLOR);
  const [font, setFont] = useState<HeaderFooterOptions['font']>('Helvetica');
  const [startAt, setStartAt] = useState('1');
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

  const size = Number(fontSize);
  const start = Math.max(0, Math.floor(Number(startAt) || 0));
  const problem = !pages
    ? 'Type the pages like 1-3, 5, 8-10.'
    : !hasAnySlot(slots)
    ? 'Write some text in at least one of the six boxes.'
    : !(size >= 4 && size <= 72)
    ? 'The size must be between 4 and 72 pt.'
    : null;

  const sample = useMemo(() => {
    if (!pages || problem) return [];
    const opts: HeaderFooterOptions = {
      slots,
      fontSize: size,
      margin: 0,
      color,
      font,
      startAt: start,
      pages,
      fileName: fileName ?? '',
      title: baseFileName(fileName ?? ''),
      now: new Date(),
    };
    return resolveSlots(opts, 0, pages[0], numPages);
  }, [pages, problem, slots, size, color, font, start, fileName, numPages]);

  if (!open) return null;

  const run = async () => {
    if (!pages || problem) return;
    setBusy(true);
    try {
      const svc = await import('../../services/pageToolsService');
      const { readDocumentProperties } = await import('../../core/pages/documentProperties');
      const bytes = useDocumentStore.getState().pdfBytes;
      const title = bytes ? (await readDocumentProperties(bytes)).title : '';
      const res = await svc.executeHeadersFooters({
        slots,
        fontSize: size,
        margin: Math.max(0, Number(marginMm) || 0) * (72 / 25.4),
        color,
        font,
        startAt: start,
        pages,
        fileName: fileName ?? '',
        title: title || baseFileName(fileName ?? ''),
        now: new Date(),
      });
      showToast(res.message);
      if (res.ok) close(null);
    } finally {
      setBusy(false);
    }
  };

  const slotInput = (key: keyof HeaderFooterSlots, label: string) => (
    <label key={key} className="flex flex-col gap-1">
      <span className="text-gray-400">{label}</span>
      <input
        type="text"
        data-testid={`hf-${key}`}
        value={slots[key]}
        onChange={(e) => setSlots((prev) => ({ ...prev, [key]: e.target.value }))}
        className="ui-input w-full"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => close(null)}>
      <div
        role="dialog"
        aria-label="Headers and footers"
        data-testid="headers-footers-dialog"
        className="w-[560px] max-w-[94vw] max-h-[92vh] overflow-y-auto bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border sticky top-0 bg-cad-panel">
          <PanelTop size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Headers &amp; footers</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <h3 className="ui-section-title">Header</h3>
          <div className="grid grid-cols-3 gap-3">{SLOT_LABELS.slice(0, 3).map((s) => slotInput(s.key, s.label))}</div>
          <h3 className="ui-section-title">Footer</h3>
          <div className="grid grid-cols-3 gap-3">{SLOT_LABELS.slice(3).map((s) => slotInput(s.key, s.label))}</div>
          <p className="text-gray-500">
            Fields:{' '}
            {HEADER_FOOTER_FIELDS.map((f) => (
              <span key={f} className="ui-data mr-2">
                {f}
              </span>
            ))}
            <br />
            number, last number, sheet, sheets, date, time, file name, document title.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <label className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Size (pt)</span>
              <input type="number" min={4} max={72} data-testid="hf-size" value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="ui-input w-16" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Margin (mm)</span>
              <input type="number" min={0} step="any" data-testid="hf-margin" value={marginMm} onChange={(e) => setMarginMm(e.target.value)} className="ui-input w-16" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Start at</span>
              <input type="number" min={0} data-testid="hf-start" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="ui-input w-16" />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Colour</span>
              <input type="color" data-testid="hf-color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 rounded border border-cad-border bg-transparent" />
            </label>
            <label className="flex items-center gap-2 col-span-2">
              <span className="w-20 text-gray-400">Font</span>
              <select data-testid="hf-font" value={font} onChange={(e) => setFont(e.target.value as typeof font)} className="ui-input">
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
              </select>
            </label>
          </div>
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
                <input type="radio" name="hf-scope" data-testid={`hf-scope-${id}`} checked={scope === id} onChange={() => setScope(id)} className="accent-cad-accent" />
                {label}
                {id === 'range' && (
                  <input
                    type="text"
                    data-testid="hf-range"
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
            <p className="text-amber-400" data-testid="hf-problem">
              {problem}
            </p>
          ) : (
            <p className="text-gray-300" data-testid="hf-sample">
              The first page will show: {sample.map((s) => <span key={s.position} className="ui-data mr-2">{s.text}</span>)}
            </p>
          )}
          <p className="text-gray-500">The text becomes part of the page content and cannot be undone. Save a copy first if you may need the original.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border sticky bottom-0 bg-cad-panel">
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="hf-apply" disabled={!!problem || busy} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Add to pages
          </button>
        </div>
      </div>
    </div>
  );
};
