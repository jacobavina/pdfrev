import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Download, Eraser } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { PanelShell } from '../shell/PanelShell';
import { formProgress, formRows, type FormRow } from '../../core/markup/formList';
import { clearAllFields, exportFormCsv, goToNextEmptyField, setFieldValue } from '../../core/markup/formActions';

/** Texto que guarda al salir del campo o con Enter y vuelve a lo guardado con Escape. */
const CommitText: React.FC<{ value: string; disabled: boolean; testId: string; label: string; onCommit: (v: string) => void }> = ({ value, disabled, testId, label, onCommit }) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      type="text"
      data-testid={testId}
      aria-label={label}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="ui-input !h-6 w-full"
    />
  );
};

/**
 * Panel Forms (ADR-0121): los campos de formulario del documento, por página, con su valor editable, el avance, ir al
 * siguiente campo vacío y exportar los valores. Las firmas están en el panel Signatures.
 */
export const FormsPanel: React.FC = () => {
  const markups = useMarkupStore((s) => s.markups);
  const selected = useMarkupStore((s) => s.selectedMarkupIds);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);

  const rows = useMemo(() => formRows(markups), [markups]);
  const progress = useMemo(() => formProgress(rows), [rows]);
  const groups = useMemo(() => {
    const out: { pageIndex: number; rows: FormRow[] }[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.pageIndex === r.pageIndex) last.rows.push(r);
      else out.push({ pageIndex: r.pageIndex, rows: [r] });
    }
    return out;
  }, [rows]);

  const go = (r: FormRow) => {
    useDocumentStore.getState().setCurrentPage(r.pageIndex);
    useMarkupStore.getState().setSelectedMarkupIds([r.id]);
  };

  return (
    <PanelShell title="Forms" testId="forms-panel">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-cad-border">
        <span className="text-gray-300 shrink-0" data-testid="forms-progress">
          {progress.filled} of {progress.total} filled
        </span>
        <span className="flex-1" />
        <button type="button" data-testid="forms-next-empty" disabled={rows.length === 0} onClick={() => goToNextEmptyField(selected[0])} title="Go to the next empty field" className="ui-btn !h-6 !px-1.5 disabled:opacity-40">
          <ArrowDownToLine size={16} />
        </button>
        <button type="button" data-testid="forms-clear" disabled={progress.filled === 0} onClick={() => clearAllFields()} title="Clear every field (Undo brings them back)" className="ui-btn !h-6 !px-1.5 disabled:opacity-40">
          <Eraser size={16} />
        </button>
        <button type="button" data-testid="forms-export" disabled={rows.length === 0} onClick={() => void exportFormCsv()} title="Export the values as a CSV table" className="ui-btn !h-6 !px-1.5 disabled:opacity-40">
          <Download size={16} />
        </button>
      </div>
      {rows.length === 0 && (
        <div className="p-3 text-gray-500" data-testid="forms-empty">
          This document has no form fields. Add them with Tools ▸ Form, or open a PDF that already has a form.
        </div>
      )}
      {groups.map((g) => (
        <section key={g.pageIndex} data-testid={`forms-page-${g.pageIndex}`}>
          <h3 className={`px-2 py-1 text-2xs font-medium border-b border-cad-border ${g.pageIndex === currentPage ? 'text-cad-accent' : 'text-gray-500'}`}>Page {g.pageIndex + 1}</h3>
          <ul>
            {g.rows.map((r) => (
              <li key={r.id} data-testid={`form-row-${r.id}`} className={`px-2 py-1 border-b border-cad-border/50 hover:bg-cad-hover ${selected.includes(r.id) ? 'bg-cad-hover' : ''}`}>
                <button type="button" onClick={() => go(r)} className="flex items-center gap-1.5 w-full text-left" title="Go to this field">
                  <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${r.filled ? 'bg-cad-accent' : 'bg-gray-600'}`} />
                  <span className="flex-1 min-w-0 truncate">{r.name}</span>
                  <span className="shrink-0 text-2xs text-gray-500">{r.typeLabel}</span>
                </button>
                <div className="pl-3 pt-0.5">
                  {r.type === 'text' && <CommitText value={r.value} disabled={r.locked} testId={`form-value-${r.id}`} label={`${r.name} value`} onCommit={(v) => setFieldValue(r, v)} />}
                  {(r.type === 'checkbox' || r.type === 'radio') && (
                    <label className="flex items-center gap-1.5 text-gray-300">
                      <input type="checkbox" data-testid={`form-check-${r.id}`} checked={r.filled} disabled={r.locked} onChange={(e) => setFieldValue(r, e.target.checked ? 'Yes' : 'Off')} className="accent-cad-accent" />
                      {r.type === 'radio' ? `Selected (${r.radioValue || 'choice'})` : 'Checked'}
                    </label>
                  )}
                  {(r.type === 'dropdown' || r.type === 'listbox') && (
                    <select data-testid={`form-select-${r.id}`} aria-label={`${r.name} value`} value={r.value} disabled={r.locked} onChange={(e) => setFieldValue(r, e.target.value)} className="ui-input !h-6 w-full">
                      <option value="">—</option>
                      {r.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PanelShell>
  );
};
