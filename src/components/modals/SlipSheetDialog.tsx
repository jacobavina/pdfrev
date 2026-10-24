import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { matchSheets } from '../../core/pages/slipSheet';
import { showToast } from '../../services/toastService';

interface Source {
  name: string;
  bytes: Uint8Array;
  keys: (string | null)[];
}

const NONE = -1;

/**
 * Slip Sheet (ADR-0129): sustituye las láminas del documento por las de una revisión nueva, emparejadas por su número de
 * lámina, y conserva las marcas. Cada emparejamiento se puede cambiar a mano antes de aplicar.
 */
export const SlipSheetDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'slip');
  const close = useUiStore((s) => s.setPageToolDialog);
  const numPages = useDocumentStore((s) => s.numPages);

  const [source, setSource] = useState<Source | null>(null);
  const [oldKeys, setOldKeys] = useState<(string | null)[]>([]);
  const [choice, setChoice] = useState<number[]>([]);
  const [by, setBy] = useState<('sheet' | 'order' | null)[]>([]);
  const [auto, setAuto] = useState<number[]>([]);
  const [keep, setKeep] = useState(true);
  const [appendNew, setAppendNew] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSource(null);
    setChoice([]);
    setKeep(true);
    setAppendNew(false);
  }, [open]);
  // El cierre con Escape va aparte: si dependiera de `busy` al elegir el archivo se reiniciaría el diálogo
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, busy]);

  const used = useMemo(() => new Set(choice.filter((c) => c !== NONE)), [choice]);
  const unmatchedNew = useMemo(() => (source ? source.keys.map((_, i) => i).filter((i) => !used.has(i)) : []), [source, used]);
  const duplicated = useMemo(() => choice.filter((c, i) => c !== NONE && choice.indexOf(c) !== i).length > 0, [choice]);

  if (!open) return null;

  const choose = async () => {
    const { pickPdf } = await import('../../services/overlayService');
    const picked = await pickPdf('Choose the PDF with the new revision');
    if (!picked) return;
    setBusy(true);
    try {
      const svc = await import('../../services/pageToolsService');
      const [newKeys, current] = await Promise.all([svc.readSheetKeys(picked.bytes), svc.readSheetKeys(useDocumentStore.getState().pdfBytes!)]);
      const matches = matchSheets(current, newKeys);
      setOldKeys(current);
      setSource({ name: picked.name, bytes: picked.bytes, keys: newKeys });
      setChoice(matches.map((m) => m.newIndex ?? NONE));
      setAuto(matches.map((m) => m.newIndex ?? NONE));
      setBy(matches.map((m) => m.by));
    } catch (err) {
      showToast(`Could not read that PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const pairs = choice.flatMap((c, oldIndex) => (c === NONE ? [] : [{ oldIndex, newIndex: c }]));
  const problem = !source
    ? 'Choose the PDF that has the new revision.'
    : duplicated
    ? 'A new sheet is chosen for two pages. Each new sheet can replace one page only.'
    : pairs.length === 0 && !(appendNew && unmatchedNew.length > 0)
    ? 'No page has a new sheet. Choose them in the list, or check that the sheet numbers are written on the drawings.'
    : null;

  const run = async () => {
    if (!source || problem) return;
    setBusy(true);
    try {
      const svc = await import('../../services/pageToolsService');
      const res = await svc.executeSlipSheet({ source: { name: source.name, bytes: source.bytes }, pairs, append: appendNew ? unmatchedNew : [], keepMarkups: keep });
      showToast(res.message);
      if (res.ok) close(null);
    } finally {
      setBusy(false);
    }
  };

  const label = (key: string | null, i: number) => `${i + 1}${key ? ` · ${key}` : ''}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => !busy && close(null)}>
      <div
        role="dialog"
        aria-label="Slip sheet"
        data-testid="slip-dialog"
        className="w-[520px] max-w-[94vw] max-h-[90vh] flex flex-col bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border shrink-0">
          <ArrowRightLeft size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Slip sheet</span>
          <button onClick={() => !busy && close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-gray-400">Replaces the sheets of this set with a new revision, matching them by sheet number (A-101, S-2.01…), and keeps your markups.</p>
          <div className="flex items-center gap-2">
            <button type="button" data-testid="slip-choose" disabled={busy} className="ui-btn !px-3" onClick={() => void choose()}>
              {source ? 'Choose another PDF…' : 'Choose the new revision…'}
            </button>
            {source && (
              <span className="text-gray-300 truncate" data-testid="slip-source">
                {source.name} · {source.keys.length} sheet{source.keys.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {source && (
            <>
              <ul className="max-h-64 overflow-y-auto border border-cad-border rounded-md divide-y divide-cad-border" data-testid="slip-rows">
                {Array.from({ length: numPages }, (_, i) => (
                  <li key={i} className="flex items-center gap-2 px-2 py-1" data-testid={`slip-row-${i}`}>
                    <span className="w-28 shrink-0 truncate text-gray-300">Page {label(oldKeys[i] ?? null, i)}</span>
                    <span className="text-gray-500">→</span>
                    <select
                      data-testid={`slip-select-${i}`}
                      aria-label={`New sheet for page ${i + 1}`}
                      value={choice[i] ?? NONE}
                      onChange={(e) => setChoice((prev) => prev.map((c, k) => (k === i ? Number(e.target.value) : c)))}
                      className="ui-input !h-6 flex-1 min-w-0"
                    >
                      <option value={NONE}>Keep this page</option>
                      {source.keys.map((k, n) => (
                        <option key={n} value={n}>
                          New {label(k, n)}
                        </option>
                      ))}
                    </select>
                    <span className="w-14 shrink-0 text-gray-500" data-testid={`slip-by-${i}`}>
                      {choice[i] === NONE || choice[i] === undefined ? '' : choice[i] === auto[i] ? (by[i] === 'sheet' ? 'by sheet' : 'by order') : 'manual'}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" data-testid="slip-keep" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="accent-cad-accent" />
                Keep the markups of the replaced pages
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" data-testid="slip-append" checked={appendNew} disabled={unmatchedNew.length === 0} onChange={(e) => setAppendNew(e.target.checked)} className="accent-cad-accent" />
                Add the {unmatchedNew.length} new sheet{unmatchedNew.length === 1 ? '' : 's'} with no match at the end
              </label>
              <p className="text-gray-500" data-testid="slip-summary">
                {pairs.length} of {numPages} page{numPages === 1 ? '' : 's'} will be replaced. Markups stay at the same place relative to the page, so check them if the new sheets have a different size.
              </p>
            </>
          )}
          {problem && (
            <p className="text-amber-400" data-testid="slip-problem">
              {problem}
            </p>
          )}
          <p className="text-gray-500">This cannot be undone with Undo. Save a copy first if you may need the original.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border shrink-0">
          <button type="button" className="ui-btn !px-3" disabled={busy} onClick={() => close(null)}>
            Cancel
          </button>
          <button type="button" data-testid="slip-apply" disabled={!!problem || busy} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Slip sheets
          </button>
        </div>
      </div>
    </div>
  );
};
