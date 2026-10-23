import React, { useEffect, useMemo, useState } from 'react';
import { Scissors, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { describePart, partFileNames, partsEvery, partsFromRanges, MAX_SPLIT_PARTS } from '../../core/pages/pageSplit';
import { baseFileName } from '../../core/pages/headersFooters';
import { showToast } from '../../services/toastService';

type Mode = 'every' | 'ranges';

/**
 * Split Document (ADR-0114): reparte las páginas en varios PDF, cada N páginas o con los rangos que se escriban. Los
 * archivos llevan las marcas del documento.
 */
export const SplitDocumentDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'split');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);
  const fileName = useDocumentStore((s) => s.fileName);

  const [mode, setMode] = useState<Mode>('every');
  const [every, setEvery] = useState('1');
  const [ranges, setRanges] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const parts = useMemo(() => (mode === 'every' ? partsEvery(Number(every), numPages) : partsFromRanges(ranges, numPages)), [mode, every, ranges, numPages]);
  const names = useMemo(() => (parts ? partFileNames(baseFileName(fileName ?? 'document.pdf'), parts) : []), [parts, fileName]);

  if (!open) return null;

  const problem = !parts
    ? mode === 'every'
      ? `Type a whole number of pages, and no more than ${MAX_SPLIT_PARTS} files.`
      : `Type the parts like 1-3; 4-6; 8 (this document has ${numPages} pages).`
    : parts.length < 2 && parts[0]?.length === numPages
    ? 'That would give one file with every page. Choose fewer pages per file.'
    : null;

  const run = async () => {
    if (!parts || problem) return;
    setBusy(true);
    try {
      const svc = await import('../../services/pageToolsService');
      const res = await svc.executeSplitDocument(parts);
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
        aria-label="Split document"
        data-testid="split-document-dialog"
        className="w-[480px] max-w-[94vw] max-h-[90vh] flex flex-col bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border shrink-0">
          <Scissors size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Split document</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-gray-400">Saves the pages as several PDF files, with the markups they carry. This document is not changed.</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="split-mode" data-testid="split-mode-every" checked={mode === 'every'} onChange={() => setMode('every')} className="accent-cad-accent" />
            A file every
            <input
              type="number"
              min={1}
              data-testid="split-every"
              value={every}
              onFocus={() => setMode('every')}
              onChange={(e) => {
                setEvery(e.target.value);
                setMode('every');
              }}
              className="ui-input w-16"
            />
            page(s)
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="split-mode" data-testid="split-mode-ranges" checked={mode === 'ranges'} onChange={() => setMode('ranges')} className="accent-cad-accent mt-1.5" />
            <span className="flex-1 flex flex-col gap-1">
              These parts (one file each, separated by ; or a new line)
              <textarea
                data-testid="split-ranges"
                rows={3}
                placeholder={'1-3; 4-6; 8, 10'}
                value={ranges}
                onFocus={() => setMode('ranges')}
                onChange={(e) => {
                  setRanges(e.target.value);
                  setMode('ranges');
                }}
                className="ui-input w-full"
              />
            </span>
          </label>
          {problem ? (
            <p className="text-amber-400" data-testid="split-problem">
              {problem}
            </p>
          ) : (
            <div data-testid="split-preview">
              <p className="text-gray-300 mb-1">
                {parts!.length} file{parts!.length === 1 ? '' : 's'}:
              </p>
              <ul className="max-h-40 overflow-y-auto border border-cad-border rounded-md divide-y divide-cad-border">
                {parts!.slice(0, 50).map((p, i) => (
                  <li key={i} className="flex items-center gap-2 px-2 py-1">
                    <span className="flex-1 min-w-0 truncate ui-data">{names[i]}</span>
                    <span className="text-gray-500">pages {describePart(p)}</span>
                  </li>
                ))}
                {parts!.length > 50 && <li className="px-2 py-1 text-gray-500">…and {parts!.length - 50} more</li>}
              </ul>
            </div>
          )}
          <p className="text-gray-500">In the desktop app you choose the folder; a file with the same name there is replaced. In the browser the files are downloaded one by one.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border shrink-0">
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="split-apply" disabled={!!problem || busy} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Split
          </button>
        </div>
      </div>
    </div>
  );
};
