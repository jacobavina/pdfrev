import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { parsePageList } from '../../core/pages/pageNumbers';
import { insertionIndex } from '../../core/pages/insertPages';
import { showToast } from '../../services/toastService';

type Where = 'before' | 'after' | 'end';

/**
 * Insert Pages from File (ADR-0123): coloca páginas de otro PDF en este documento, antes o después de la página actual o
 * al final.
 */
export const InsertPagesDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'insert');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);

  const [source, setSource] = useState<{ name: string; bytes: Uint8Array; pageCount: number } | null>(null);
  const [pagesText, setPagesText] = useState('');
  const [where, setWhere] = useState<Where>('after');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSource(null);
    setPagesText('');
    setWhere('after');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const indices = useMemo(() => (source ? parsePageList(pagesText, source.pageCount) : null), [pagesText, source]);

  if (!open) return null;

  const choose = async () => {
    const { pickPdf } = await import('../../services/overlayService');
    const picked = await pickPdf('Choose the PDF with the pages to insert');
    if (!picked) return;
    try {
      const { pdfPageCount } = await import('../../core/pages/replacePages');
      const pageCount = await pdfPageCount(picked.bytes);
      setSource({ name: picked.name, bytes: picked.bytes, pageCount });
      setPagesText(pageCount === 1 ? '1' : `1-${pageCount}`);
    } catch (err) {
      showToast(`Could not read that PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const at = insertionIndex(where, currentPage, numPages);
  const problem = !source ? 'Choose the PDF that has the pages to insert.' : !indices ? `Type the pages like 1-3, 5 (that PDF has ${source.pageCount}).` : null;

  const run = async () => {
    if (!source || !indices || problem) return;
    setBusy(true);
    try {
      const svc = await import('../../services/pageToolsService');
      const res = await svc.executeInsertPages({ at, source: { name: source.name, bytes: source.bytes }, sourceIndices: indices });
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
        aria-label="Insert pages from file"
        data-testid="insert-pages-dialog"
        className="w-[440px] max-w-[94vw] bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border">
          <FilePlus2 size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Insert pages from file</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button type="button" data-testid="insert-choose" className="ui-btn !px-3" onClick={() => void choose()}>
              Choose PDF…
            </button>
            <span className="flex-1 min-w-0 truncate text-gray-300" data-testid="insert-source">
              {source ? `${source.name} (${source.pageCount} page${source.pageCount === 1 ? '' : 's'})` : 'No file chosen'}
            </span>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-24 text-gray-400">Pages to insert</span>
            <input type="text" data-testid="insert-pages" disabled={!source} value={pagesText} onChange={(e) => setPagesText(e.target.value)} className="ui-input w-32 disabled:opacity-50" />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-gray-400 mb-1">Insert</legend>
            {(
              [
                ['before', `Before page ${currentPage + 1}`],
                ['after', `After page ${currentPage + 1}`],
                ['end', `At the end (after page ${numPages})`],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="insert-where" data-testid={`insert-where-${id}`} checked={where === id} onChange={() => setWhere(id)} className="accent-cad-accent" />
                {label}
              </label>
            ))}
          </fieldset>
          {problem ? (
            <p className="text-amber-400" data-testid="insert-problem">
              {problem}
            </p>
          ) : (
            <p className="text-gray-300" data-testid="insert-summary">
              {indices!.length} page{indices!.length === 1 ? '' : 's'} will go in as page{indices!.length === 1 ? '' : 's'} {at + 1}
              {indices!.length > 1 ? `–${at + indices!.length}` : ''}. The document will have {numPages + indices!.length} pages. Markups of the later pages move with their pages.
            </p>
          )}
          <p className="text-gray-500">The change cannot be undone: save a copy first if you may need the original.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border">
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="insert-apply" disabled={!!problem || busy} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Insert
          </button>
        </div>
      </div>
    </div>
  );
};
