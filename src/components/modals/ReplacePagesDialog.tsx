import React, { useEffect, useMemo, useState } from 'react';
import { Replace, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { parsePageList } from '../../core/pages/pageNumbers';
import { showToast } from '../../services/toastService';

/**
 * Replace Pages (ADR-0114): sustituye páginas del documento por páginas de otro PDF.
 */
export const ReplacePagesDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'replace');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);

  const [source, setSource] = useState<{ name: string; bytes: Uint8Array; pageCount: number } | null>(null);
  const [targetText, setTargetText] = useState('');
  const [sourceText, setSourceText] = useState('1');
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSource(null);
    setTargetText(String(useDocumentStore.getState().currentPageIndex + 1));
    setSourceText('1');
    setKeep(true);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const targets = useMemo(() => parsePageList(targetText, numPages), [targetText, numPages]);
  const sourceIdx = useMemo(() => (source ? parsePageList(sourceText, source.pageCount) : null), [sourceText, source]);
  const sameCount = !!targets && !!sourceIdx && targets.length === sourceIdx.length;

  if (!open) return null;

  const choose = async () => {
    const { pickPdf } = await import('../../services/overlayService');
    const picked = await pickPdf('Choose the PDF with the new pages');
    if (!picked) return;
    try {
      const { pdfPageCount } = await import('../../core/pages/replacePages');
      const pageCount = await pdfPageCount(picked.bytes);
      setSource({ name: picked.name, bytes: picked.bytes, pageCount });
      setSourceText(pageCount === 1 ? '1' : `1-${Math.min(pageCount, targets?.length ?? 1)}`);
    } catch (err) {
      showToast(`Could not read that PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const problem = !source
    ? 'Choose the PDF that has the new pages.'
    : !targets
    ? `Type the pages to replace like 1-3, 5 (this document has ${numPages}).`
    : !sourceIdx
    ? `Type the replacement pages like 1-3 (that PDF has ${source.pageCount}).`
    : null;

  const run = async () => {
    if (!source || !targets || !sourceIdx || problem) return;
    setBusy(true);
    try {
      const svc = await import('../../services/pageToolsService');
      const res = await svc.executeReplacePages({ targets, source: { name: source.name, bytes: source.bytes }, sourceIndices: sourceIdx, keepMarkups: keep });
      showToast(res.message);
      if (res.ok) close(null);
    } finally {
      setBusy(false);
    }
  };

  const after = numPages - (targets?.length ?? 0) + (sourceIdx?.length ?? 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => close(null)}>
      <div
        role="dialog"
        aria-label="Replace pages"
        data-testid="replace-pages-dialog"
        className="w-[460px] max-w-[94vw] bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border">
          <Replace size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Replace pages</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-gray-400">Swaps pages of this document for pages of another PDF, for example when a sheet gets a new revision.</p>
          <div className="flex items-center gap-2">
            <button type="button" data-testid="replace-choose" className="ui-btn !px-3" onClick={() => void choose()}>
              Choose PDF…
            </button>
            <span className="flex-1 min-w-0 truncate text-gray-300" data-testid="replace-source">
              {source ? `${source.name} (${source.pageCount} page${source.pageCount === 1 ? '' : 's'})` : 'No file chosen'}
            </span>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-32 text-gray-400">Replace pages</span>
            <input type="text" data-testid="replace-targets" value={targetText} onChange={(e) => setTargetText(e.target.value)} className="ui-input w-32" />
            <span className="text-gray-500">of {numPages}</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-32 text-gray-400">With pages</span>
            <input type="text" data-testid="replace-source-pages" value={sourceText} disabled={!source} onChange={(e) => setSourceText(e.target.value)} className="ui-input w-32 disabled:opacity-50" />
            {source && <span className="text-gray-500">of {source.pageCount}</span>}
          </label>
          <label className={`flex items-center gap-2 ${sameCount ? 'cursor-pointer' : 'opacity-50'}`}>
            <input type="checkbox" data-testid="replace-keep" disabled={!sameCount} checked={keep && sameCount} onChange={(e) => setKeep(e.target.checked)} className="accent-cad-accent" />
            Keep the markups of the replaced pages
          </label>
          {problem ? (
            <p className="text-amber-400" data-testid="replace-problem">
              {problem}
            </p>
          ) : (
            <p className="text-gray-300" data-testid="replace-summary">
              {targets!.length} page{targets!.length === 1 ? '' : 's'} will be replaced by {sourceIdx!.length}. The document will have {after} page{after === 1 ? '' : 's'}.
              {!sameCount && ' Markups on the replaced pages are removed because the page count changes.'}
            </p>
          )}
          <p className="text-gray-500">
            If the new pages have a different size, kept markups may not line up. The change cannot be undone: save a copy first if you may need the original.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border">
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="replace-apply" disabled={!!problem || busy} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Replace
          </button>
        </div>
      </div>
    </div>
  );
};
