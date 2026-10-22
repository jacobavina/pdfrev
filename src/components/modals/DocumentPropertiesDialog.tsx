import React, { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { readDocumentProperties, type DocumentProperties } from '../../core/pages/documentProperties';

const PT_PER_MM = 72 / 25.4;

const formatBytes = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);
const formatDate = (d: Date | null): string => (d ? d.toLocaleString() : '—');

/** Tamaño en milímetros y pulgadas, como se imprime en la hoja. */
export function formatPageSize(size: { width: number; height: number }): string {
  return `${(size.width / PT_PER_MM).toFixed(0)} × ${(size.height / PT_PER_MM).toFixed(0)} mm (${(size.width / 72).toFixed(2)} × ${(size.height / 72).toFixed(2)} in)`;
}

/**
 * Document Properties (ADR-0113): datos del PDF abierto; título, autor, asunto y palabras clave se pueden editar.
 */
export const DocumentPropertiesDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'properties');
  const close = useUiStore((s) => s.setPageToolDialog);
  const pdfBytes = useDocumentStore((s) => s.pdfBytes);
  const fileName = useDocumentStore((s) => s.fileName);
  const filePath = useDocumentStore((s) => s.filePath);
  const [props, setProps] = useState<DocumentProperties | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [subject, setSubject] = useState('');
  const [keywords, setKeywords] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !pdfBytes) return;
    let cancelled = false;
    setProps(null);
    setError(null);
    readDocumentProperties(pdfBytes)
      .then((p) => {
        if (cancelled) return;
        setProps(p);
        setTitle(p.title);
        setAuthor(p.author);
        setSubject(p.subject);
        setKeywords(p.keywords);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, pdfBytes, close]);

  if (!open) return null;

  const changed = props !== null && (title !== props.title || author !== props.author || subject !== props.subject || keywords !== props.keywords);

  const apply = async () => {
    const svc = await import('../../services/documentEditService');
    if (await svc.executeUpdateProperties({ title, author, subject, keywords })) close(null);
  };

  const row = (label: string, value: React.ReactNode, testId?: string) => (
    <div className="flex gap-3 py-1" data-testid={testId}>
      <span className="w-28 shrink-0 text-gray-400">{label}</span>
      <span className="flex-1 min-w-0 break-words text-gray-200">{value}</span>
    </div>
  );
  const field = (label: string, value: string, set: (v: string) => void, testId: string) => (
    <label className="flex items-center gap-3 py-1">
      <span className="w-28 shrink-0 text-gray-400">{label}</span>
      <input type="text" data-testid={testId} value={value} onChange={(e) => set(e.target.value)} className="ui-input flex-1 min-w-0" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => close(null)}>
      <div
        role="dialog"
        aria-label="Document properties"
        data-testid="document-properties-dialog"
        className="w-[520px] max-w-[94vw] max-h-[88vh] flex flex-col bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border shrink-0">
          <FileText size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Document properties</span>
          <button onClick={() => close(null)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="text-red-400">{error}</p>}
          {!props && !error && <p className="text-gray-400">Reading the document…</p>}
          {props && (
            <>
              <h3 className="ui-section-title mb-1">Description</h3>
              {field('Title', title, setTitle, 'props-title')}
              {field('Author', author, setAuthor, 'props-author')}
              {field('Subject', subject, setSubject, 'props-subject')}
              {field('Keywords', keywords, setKeywords, 'props-keywords')}
              <h3 className="ui-section-title mt-4 mb-1">Document</h3>
              {row('File', fileName || '—', 'props-file')}
              {row('Location', filePath || 'Not saved yet', 'props-location')}
              {row('File size', formatBytes(props.fileSize), 'props-size')}
              {row('Pages', props.pageCount, 'props-pages')}
              {row('Page size', props.firstPageSize ? `${formatPageSize(props.firstPageSize)}${props.mixedPageSizes ? ' — sizes vary' : ''}` : '—', 'props-page-size')}
              {row('PDF version', props.version || '—', 'props-version')}
              {row('Encrypted', props.encrypted ? 'Yes' : 'No', 'props-encrypted')}
              {row('Created', formatDate(props.created))}
              {row('Modified', formatDate(props.modified))}
              {row('Created with', props.creator || '—')}
              {row('PDF producer', props.producer || '—')}
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border shrink-0">
          <button type="button" className="ui-btn !px-3" onClick={() => close(null)}>
            Close
          </button>
          <button type="button" data-testid="props-apply" disabled={!changed} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={() => void apply()}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
