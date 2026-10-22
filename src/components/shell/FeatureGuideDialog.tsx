import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { FEATURE_GUIDE, searchGuide } from '../../core/help/featureGuide';

/**
 * Guía de funciones (ADR-0100): Help ▸ Feature Guide. Secciones a la izquierda, buscador arriba y, de cada función,
 * qué hace, dónde está y cómo se usa.
 */
export const FeatureGuideDialog: React.FC = () => {
  const open = useUiStore((s) => s.featureGuideOpen);
  const setOpen = useUiStore((s) => s.setFeatureGuideOpen);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<string>(FEATURE_GUIDE[0].id);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const results = useMemo(() => searchGuide(query), [query]);
  if (!open) return null;

  const searching = query.trim().length > 0;
  const shown = searching ? results : FEATURE_GUIDE.find((s) => s.id === section)!.entries.map((e) => ({ ...e, section: '' }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Feature guide"
        data-testid="feature-guide"
        className="w-[860px] max-w-[94vw] h-[80vh] flex flex-col bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-cad-border shrink-0">
          <BookOpen size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Feature Guide</span>
          <div className="relative flex-1 max-w-sm ml-4">
            <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              data-testid="feature-guide-search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a function, a shortcut or a menu…"
              className="ui-input w-full pl-8"
            />
          </div>
          <button onClick={() => setOpen(false)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          <nav className="w-44 shrink-0 border-r border-cad-border p-2 overflow-y-auto" aria-label="Sections">
            {FEATURE_GUIDE.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`feature-guide-section-${s.id}`}
                onClick={() => {
                  setQuery('');
                  setSection(s.id);
                }}
                className={`w-full text-left px-2 py-1.5 rounded-md hover:bg-cad-hover ${!searching && section === s.id ? 'bg-cad-hover text-cad-strong' : 'text-gray-300'}`}
              >
                {s.title}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="feature-guide-results">
            {searching && (
              <div className="text-2xs uppercase tracking-wider text-gray-500">
                {results.length} result{results.length === 1 ? '' : 's'}
              </div>
            )}
            {shown.length === 0 && <div className="text-gray-400">Nothing matches “{query}”.</div>}
            {shown.map((e) => (
              <article key={e.id} data-testid={`feature-guide-entry-${e.id}`} className="border-b border-cad-border/60 pb-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-cad-strong">{e.title}</h3>
                  {e.shortcut && <kbd className="ui-data text-gray-400 whitespace-nowrap">{e.shortcut}</kbd>}
                </div>
                <p className="mt-1 text-gray-300">{e.summary}</p>
                <ol className="mt-2 list-decimal pl-5 space-y-0.5 text-gray-300">
                  {e.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="mt-2 text-2xs text-gray-500">
                  {e.section ? `${e.section} · ` : ''}Where: {e.where}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
