import React, { useEffect, useMemo, useState } from 'react';
import { DoorClosed, Download, Plus } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { PanelShell } from '../shell/PanelShell';
import { formatSpaceArea, formatSpaceLength, spaceRows, totalsByUnit, type SpaceRow } from '../../core/measurements/spaces';
import { exportSpacesCsv, makeSpacesFromSelection, removeSpaces, selectedAreasForSpaces, updateSpace } from '../../core/measurements/spaceActions';

/** Campo de texto que guarda al salir de él o con Enter, y vuelve a lo guardado con Escape. */
const CommitInput: React.FC<{ value: string; onCommit: (v: string) => void; testId: string; label: string; className?: string; disabled?: boolean }> = ({ value, onCommit, testId, label, className, disabled }) => {
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
      className={`ui-input !h-6 ${className ?? ''}`}
    />
  );
};

/**
 * Panel Spaces (ADR-0118): las salas del documento. Cada espacio es una medición de área con número y nombre; el panel los
 * agrupa por nivel (página), suma áreas y perímetros y exporta la tabla.
 */
export const SpacesPanel: React.FC = () => {
  const markups = useMarkupStore((s) => s.markups);
  const selected = useMarkupStore((s) => s.selectedMarkupIds);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  const pageLabels = useDocumentStore((s) => s.pageLabels);

  const rows = useMemo(() => spaceRows(markups), [markups]);
  const canMake = useMemo(() => selectedAreasForSpaces().length > 0, [markups, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const out: { pageIndex: number; rows: SpaceRow[] }[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.pageIndex === r.pageIndex) last.rows.push(r);
      else out.push({ pageIndex: r.pageIndex, rows: [r] });
    }
    return out;
  }, [rows]);
  const totals = useMemo(() => totalsByUnit(rows), [rows]);
  const level = (i: number) => (pageLabels?.[i] ? `${pageLabels[i]}` : `Page ${i + 1}`);

  const go = (r: SpaceRow) => {
    useDocumentStore.getState().setCurrentPage(r.pageIndex);
    useMarkupStore.getState().setSelectedMarkupIds([r.id]);
  };

  return (
    <PanelShell title="Spaces" testId="spaces-panel">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-cad-border">
        <button
          type="button"
          data-testid="spaces-make"
          disabled={!canMake}
          onClick={() => makeSpacesFromSelection()}
          title="Turn the selected Area measurements into spaces"
          className="ui-btn !h-6 !px-1.5 !text-2xs flex items-center gap-1 disabled:opacity-40"
        >
          <Plus size={16} /> Make space
        </button>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="spaces-export"
          disabled={rows.length === 0}
          onClick={() => void exportSpacesCsv()}
          title="Export the spaces as a CSV table"
          className="ui-btn !h-6 !px-1.5 !text-2xs flex items-center gap-1 disabled:opacity-40"
        >
          <Download size={16} /> CSV
        </button>
      </div>
      {rows.length === 0 && (
        <div className="p-3 text-gray-500" data-testid="spaces-empty">
          No spaces yet. Draw an Area (Measure tab), select it and press Make space; then give it a number and a name here.
        </div>
      )}
      {groups.map((g) => {
        const sub = totalsByUnit(g.rows);
        return (
          <section key={g.pageIndex} data-testid={`spaces-level-${g.pageIndex}`}>
            <h3 className={`flex items-center justify-between px-2 py-1 text-2xs font-medium border-b border-cad-border ${g.pageIndex === currentPage ? 'text-cad-accent' : 'text-gray-500'}`}>
              <span>{level(g.pageIndex)}</span>
              <span data-testid={`spaces-subtotal-${g.pageIndex}`}>{sub.map((t) => formatSpaceArea(t.area, t.unit)).join(' + ')}</span>
            </h3>
            <ul>
              {g.rows.map((r) => (
                <li key={r.id} data-testid={`space-row-${r.id}`} className="px-2 py-1 hover:bg-cad-hover border-b border-cad-border/50">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => go(r)} title="Go to this space" className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle">
                      <DoorClosed size={16} />
                    </button>
                    <CommitInput value={r.number} testId={`space-number-${r.id}`} label="Number" disabled={r.locked} className="w-14" onCommit={(v) => updateSpace(r.id, { number: v, name: r.name })} />
                    <CommitInput value={r.name} testId={`space-name-${r.id}`} label="Name" disabled={r.locked} className="flex-1 min-w-0" onCommit={(v) => updateSpace(r.id, { number: r.number, name: v })} />
                    <button
                      type="button"
                      data-testid={`space-remove-${r.id}`}
                      disabled={r.locked}
                      onClick={() => removeSpaces([r.id])}
                      title="Stop treating this area as a space (the measurement stays)"
                      className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                  <div className="pl-7 pt-0.5 text-2xs text-gray-400" data-testid={`space-figures-${r.id}`}>
                    {formatSpaceArea(r.area, r.unit)}
                    {r.perimeter !== null && ` · perimeter ${formatSpaceLength(r.perimeter, r.unit)}`}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {totals.length > 0 && (
        <div className="px-2 py-2 border-t border-cad-border text-gray-300" data-testid="spaces-total">
          {totals.map((t) => (
            <div key={t.unit} className="flex justify-between">
              <span>
                Total · {t.count} space{t.count === 1 ? '' : 's'}
              </span>
              <span className="ui-data">{formatSpaceArea(t.area, t.unit)}</span>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
};
