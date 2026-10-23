import React, { useEffect, useState } from 'react';
import { Minimize2, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { QUALITY_PRESETS, type ReduceQuality, type ReduceReport } from '../../core/pdf/reduceSize';
import { showToast } from '../../services/toastService';

const formatSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Reduce File Size (ADR-0126): baja la resolución de las imágenes grandes y las recomprime; lo vectorial no se toca. Muestra
 * cuánto se ahorró y por qué algunas imágenes quedaron igual.
 */
export const ReduceSizeDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'reduce');
  const close = useUiStore((s) => s.setPageToolDialog);
  const size = useDocumentStore((s) => s.pdfBytes?.length ?? 0);
  const [quality, setQuality] = useState<ReduceQuality>('medium');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ReduceReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReport(null);
    setFailure(null);
    setProgress(null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !progress && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, progress]);

  if (!open) return null;

  const run = async () => {
    setReport(null);
    setFailure(null);
    setProgress({ done: 0, total: 0 });
    try {
      const svc = await import('../../services/documentEditService');
      const res = await svc.executeReduceSize(quality, (done, total) => setProgress({ done, total }));
      if (res.report) setReport(res.report);
      if (!res.ok) setFailure(res.message);
      showToast(res.message);
    } finally {
      setProgress(null);
    }
  };

  const saved = report ? report.before - report.after : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => !progress && close(null)}>
      <div
        role="dialog"
        aria-label="Reduce file size"
        data-testid="reduce-size-dialog"
        className="w-[440px] max-w-[94vw] bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border">
          <Minimize2 size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Reduce file size</span>
          <button onClick={() => !progress && close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-gray-300" data-testid="reduce-current">
            Current size: <span className="ui-data">{formatSize(report ? report.after : size)}</span>
          </p>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-gray-400 mb-1">Quality</legend>
            {(Object.keys(QUALITY_PRESETS) as ReduceQuality[]).map((q) => (
              <label key={q} className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="reduce-quality" data-testid={`reduce-quality-${q}`} checked={quality === q} onChange={() => setQuality(q)} className="accent-cad-accent mt-0.5" />
                <span>
                  {QUALITY_PRESETS[q].label}
                  <span className="block text-gray-500">{QUALITY_PRESETS[q].description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {progress && (
            <p className="text-gray-300" data-testid="reduce-progress">
              Processing images{progress.total > 0 ? ` (${Math.min(progress.done + 1, progress.total)} of ${progress.total})` : ''}…
            </p>
          )}
          {report && (
            <div data-testid="reduce-report" className={failure ? 'text-amber-400' : 'text-emerald-400'}>
              {failure ? failure : `Saved ${formatSize(saved)}: ${formatSize(report.before)} → ${formatSize(report.after)}.`}
              <span className="block text-gray-400">
                {report.imagesReduced} of {report.imagesSeen} image{report.imagesSeen === 1 ? '' : 's'} reduced.
                {report.skipped.map((s) => ` ${s.count} left as is: ${s.cause.toLowerCase()}.`).join('')}
              </span>
            </div>
          )}
          {failure && !report && <p className="text-amber-400">{failure}</p>}
          <p className="text-gray-500">The images are replaced in the open document and this cannot be undone. Save a copy first if you may need the original.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border">
          <button type="button" className="ui-btn !px-3" disabled={!!progress} onClick={() => close(null)}>
            {report && !failure ? 'Close' : 'Cancel'}
          </button>
          <button type="button" data-testid="reduce-apply" disabled={!!progress} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void run()}>
            Reduce
          </button>
        </div>
      </div>
    </div>
  );
};
