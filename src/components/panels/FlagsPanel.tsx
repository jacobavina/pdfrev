import React, { useMemo, useState } from 'react';
import { Flag, FlagOff } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { PanelShell } from '../shell/PanelShell';
import { flagTitle, flaggedMarkups } from '../../core/markup/flags';
import { markupTypeLabel } from '../../core/markup/typeLabels';
import type { Markup } from '../../types/markup';

type Scope = 'all' | 'page';

/**
 * Panel Flags (ADR-0117): las marcas con bandera, agrupadas por página. Un clic lleva a la marca; la bandera de la fila
 * se quita con su botón y "Remove all" las quita todas (con Undo).
 */
export const FlagsPanel: React.FC = () => {
  const markups = useMarkupStore((s) => s.markups);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  const [scope, setScope] = useState<Scope>('all');

  const flagged = useMemo(() => flaggedMarkups(markups), [markups]);
  const shown = useMemo(() => (scope === 'page' ? flagged.filter((m) => m.pageIndex === currentPage) : flagged), [flagged, scope, currentPage]);
  const groups = useMemo(() => {
    const out: { pageIndex: number; items: Markup[] }[] = [];
    for (const m of shown) {
      const last = out[out.length - 1];
      if (last && last.pageIndex === m.pageIndex) last.items.push(m);
      else out.push({ pageIndex: m.pageIndex, items: [m] });
    }
    return out;
  }, [shown]);

  const go = (m: Markup) => {
    useDocumentStore.getState().setCurrentPage(m.pageIndex);
    useMarkupStore.getState().setSelectedMarkupIds([m.id]);
  };

  return (
    <PanelShell title="Flags" testId="flags-panel">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-cad-border">
        <select data-testid="flags-scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="ui-input !h-6 flex-1 min-w-0">
          <option value="all">All flags</option>
          <option value="page">This page</option>
        </select>
        <span className="text-gray-400 shrink-0" data-testid="flags-count">
          {shown.length}
        </span>
        <button
          type="button"
          data-testid="flags-clear"
          disabled={flagged.length === 0}
          onClick={() => useMarkupStore.getState().setMarkupsFlagged(flagged.map((m) => m.id), false)}
          title="Remove every flag (Undo brings them back)"
          className="ui-btn !h-6 !px-1.5 !text-2xs disabled:opacity-40"
        >
          Remove all
        </button>
      </div>
      {groups.length === 0 && (
        <div className="p-3 text-gray-500" data-testid="flags-empty">
          {flagged.length === 0 ? 'No flagged markups. Select a markup and press Ctrl+Alt+F to flag it for later.' : 'No flags on this page.'}
        </div>
      )}
      {groups.map((g) => (
        <section key={g.pageIndex} data-testid={`flags-page-${g.pageIndex}`}>
          <h3 className={`px-2 py-1 text-2xs font-medium border-b border-cad-border ${g.pageIndex === currentPage ? 'text-cad-accent' : 'text-gray-500'}`}>Page {g.pageIndex + 1}</h3>
          <ul>
            {g.items.map((m) => (
              <li key={m.id} data-testid={`flag-row-${m.id}`} className="group flex items-center gap-1.5 px-2 py-1 hover:bg-cad-hover">
                <button type="button" onClick={() => go(m)} className="flex-1 min-w-0 flex items-start gap-1.5 text-left" title={flagTitle(m)}>
                  <Flag size={16} className="shrink-0 mt-0.5 text-amber-400" />
                  <span className="min-w-0">
                    <span className="block truncate">{flagTitle(m)}</span>
                    <span className="block truncate text-2xs text-gray-500">
                      {markupTypeLabel(m.type)} · {m.author} · {m.status}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  data-testid={`flag-remove-${m.id}`}
                  onClick={() => useMarkupStore.getState().setMarkupsFlagged([m.id], false)}
                  title="Remove the flag"
                  className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle"
                >
                  <FlagOff size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PanelShell>
  );
};
