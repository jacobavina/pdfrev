import React, { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Layers, Trash2, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { MAX_BATCH_FILES, type BatchInput, type BatchOp, type BatchResult } from '../../services/batchOps';
import type { NumberPosition } from '../../core/pages/pageNumbers';
import { QUALITY_PRESETS, type ReduceQuality } from '../../core/pdf/reduceSize';
import { showToast } from '../../services/toastService';

type Kind = BatchOp['kind'];

const formatSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Batch (ADR-0125): aplica una operación a varios PDF sin abrirlos: aplanar las marcas, numerar las páginas o girarlas. Cada
 * archivo se guarda con un sufijo (`_flattened`, `_numbered`, `_rotated90`) y al final hay un informe.
 */
export const BatchDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'batch');
  const close = useUiStore((s) => s.setPageToolDialog);
  const [files, setFiles] = useState<BatchInput[]>([]);
  const [kind, setKind] = useState<Kind>('flatten');
  const [format, setFormat] = useState('Page {n} of {total}');
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [degrees, setDegrees] = useState<90 | 180 | 270>(90);
  const [quality, setQuality] = useState<ReduceQuality>('medium');
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [where, setWhere] = useState('');

  // Al abrirse empieza de cero; el cierre con Escape no reinicia nada (por eso va en otro efecto)
  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setResults(null);
    setRunning(null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !running && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, running]);

  if (!open) return null;

  const add = async () => {
    const { pickBatchFiles } = await import('../../services/batchService');
    const picked = await pickBatchFiles();
    if (picked.length === 0) return;
    setResults(null);
    setFiles((prev) => {
      const known = new Set(prev.map((f) => f.name.toLowerCase() + f.bytes.length));
      const fresh = picked.filter((f) => !known.has(f.name.toLowerCase() + f.bytes.length));
      return [...prev, ...fresh].slice(0, MAX_BATCH_FILES);
    });
  };

  const op = (): BatchOp => (kind === 'flatten' ? { kind } : kind === 'rotate' ? { kind, degrees } : kind === 'reduce' ? { kind, quality } : { kind, format, position, fontSize: 9, marginPt: 28 });
  const problem = files.length === 0 ? 'Add the PDF files to process.' : kind === 'number' && !format.trim() ? 'Write the text to stamp, for example: Page {n} of {total}.' : null;

  const run = async () => {
    const svc = await import('../../services/batchService');
    const sink = await svc.chooseBatchSink();
    if (!sink) return;
    setWhere(sink.where);
    setResults(null);
    setRunning({ done: 0, total: files.length });
    try {
      const { runBatch } = await import('../../services/batchOps');
      const all = await runBatch(files, op(), sink.save, (done, total) => setRunning({ done, total }));
      setResults(all);
      const failed = all.filter((r) => !r.ok).length;
      showToast(failed === 0 ? `${all.length} file${all.length === 1 ? '' : 's'} processed.` : `${all.length - failed} processed, ${failed} failed. See the report.`);
    } finally {
      setRunning(null);
    }
  };

  const failed = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => !running && close(null)}>
      <div
        role="dialog"
        aria-label="Batch"
        data-testid="batch-dialog"
        className="w-[520px] max-w-[94vw] max-h-[90vh] flex flex-col bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border shrink-0">
          <Layers size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Batch</span>
          <button onClick={() => !running && close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-gray-400">Applies one operation to many PDF files without opening them. The originals are not changed: each result is saved with a suffix.</p>
          <div className="flex items-center gap-2">
            <button type="button" data-testid="batch-add" disabled={!!running} className="ui-btn !px-3" onClick={() => void add()}>
              Add PDF files…
            </button>
            <span className="text-gray-500" data-testid="batch-count">
              {files.length} file{files.length === 1 ? '' : 's'}
            </span>
          </div>
          {files.length > 0 && (
            <ul className="max-h-36 overflow-y-auto border border-cad-border rounded-md divide-y divide-cad-border" data-testid="batch-files">
              {files.map((f, i) => {
                const r = results?.find((x) => x.input === f.name);
                return (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-2 py-1" data-testid={`batch-file-${i}`}>
                    {r && (r.ok ? <CircleCheck size={16} className="shrink-0 text-emerald-400" /> : <CircleAlert size={16} className="shrink-0 text-red-400" />)}
                    <span className="flex-1 min-w-0 truncate">{f.name}</span>
                    <span className="text-gray-500 shrink-0">{formatSize(f.bytes.length)}</span>
                    {r && !r.ok && (
                      <span className="text-red-400 truncate max-w-[10rem]" title={r.message}>
                        {r.message}
                      </span>
                    )}
                    <button type="button" disabled={!!running} onClick={() => setFiles((prev) => prev.filter((_, k) => k !== i))} title="Remove from the list" className="p-0.5 rounded text-gray-400 hover:text-cad-strong disabled:opacity-30">
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-gray-400 mb-1">Operation</legend>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="batch-kind" data-testid="batch-kind-flatten" checked={kind === 'flatten'} onChange={() => setKind('flatten')} className="accent-cad-accent" />
              Flatten the markups into the pages <span className="text-gray-500">(_flattened)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="batch-kind" data-testid="batch-kind-number" checked={kind === 'number'} onChange={() => setKind('number')} className="accent-cad-accent" />
              Number the pages <span className="text-gray-500">(_numbered)</span>
            </label>
            {kind === 'number' && (
              <div className="pl-6 flex items-center gap-2">
                <input type="text" data-testid="batch-format" aria-label="Text to stamp" value={format} onChange={(e) => setFormat(e.target.value)} className="ui-input !h-6 flex-1 min-w-0" />
                <select data-testid="batch-position" aria-label="Position" value={position} onChange={(e) => setPosition(e.target.value as NumberPosition)} className="ui-input !h-6">
                  <option value="top-left">Top left</option>
                  <option value="top-center">Top centre</option>
                  <option value="top-right">Top right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-center">Bottom centre</option>
                  <option value="bottom-right">Bottom right</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="batch-kind" data-testid="batch-kind-rotate" checked={kind === 'rotate'} onChange={() => setKind('rotate')} className="accent-cad-accent" />
              Rotate every page <span className="text-gray-500">(_rotated90, _rotated180, _rotated270)</span>
            </label>
            {kind === 'rotate' && (
              <div className="pl-6">
                <select data-testid="batch-degrees" aria-label="Degrees" value={degrees} onChange={(e) => setDegrees(Number(e.target.value) as 90 | 180 | 270)} className="ui-input !h-6">
                  <option value={90}>90° clockwise</option>
                  <option value={180}>180°</option>
                  <option value={270}>90° counterclockwise</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="batch-kind" data-testid="batch-kind-reduce" checked={kind === 'reduce'} onChange={() => setKind('reduce')} className="accent-cad-accent" />
              Reduce the file size <span className="text-gray-500">(_reduced)</span>
            </label>
            {kind === 'reduce' && (
              <div className="pl-6">
                <select data-testid="batch-quality" aria-label="Quality" value={quality} onChange={(e) => setQuality(e.target.value as ReduceQuality)} className="ui-input !h-6">
                  {(Object.keys(QUALITY_PRESETS) as ReduceQuality[]).map((q) => (
                    <option key={q} value={q}>
                      {QUALITY_PRESETS[q].label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>
          {problem && !results && (
            <p className="text-amber-400" data-testid="batch-problem">
              {problem}
            </p>
          )}
          {running && (
            <p className="text-gray-300" data-testid="batch-progress">
              Processing {Math.min(running.done + 1, running.total)} of {running.total}…
            </p>
          )}
          {results && (
            <p className={failed > 0 ? 'text-amber-400' : 'text-emerald-400'} data-testid="batch-summary">
              {results.length - failed} of {results.length} processed and saved in {where}
              {failed > 0 ? `; ${failed} failed.` : '.'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 h-12 border-t border-cad-border shrink-0">
          <button type="button" data-testid="batch-report" disabled={!results} className="ui-btn !px-3 disabled:opacity-40" onClick={() => results && void import('../../services/batchService').then((m) => m.saveBatchReport(results))}>
            Save report
          </button>
          <span className="flex-1" />
          <button type="button" className="ui-btn !px-3" disabled={!!running} onClick={() => close(null)}>
            {results ? 'Close' : 'Cancel'}
          </button>
          <button type="button" data-testid="batch-run" disabled={!!problem || !!running} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Run
          </button>
        </div>
      </div>
    </div>
  );
};
