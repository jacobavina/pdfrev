import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ExternalLink, FileText, Link2, Trash2, TriangleAlert } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { PanelShell } from '../shell/PanelShell';
import { filterLinks, groupLinksByPage, isBrokenLink, markupLinkEntries, targetLabel, type LinkEntry, type LinkFilter } from '../../core/links/linkList';

/**
 * Panel Links (ADR-0116): todos los enlaces del documento, agrupados por página. Un clic lleva a la página del enlace y
 * selecciona la marca; el botón de la fila sigue el enlace; los enlaces de REA se pueden borrar.
 */
export const LinksPanel: React.FC = () => {
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const numPages = useDocumentStore((s) => s.numPages);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  const markups = useMarkupStore((s) => s.markups);
  const [pdfLinks, setPdfLinks] = useState<LinkEntry[] | null>(null);
  const [filter, setFilter] = useState<LinkFilter>('all');

  // Los enlaces de REA son marcas; los del PDF se leen de sus anotaciones (cada vez que cambia el documento)
  const markupLinks = useMemo(() => markupLinkEntries(markups), [markups]);
  const reaIds = useMemo(() => new Set(markups.map((m) => m.id)), [markups]);

  useEffect(() => {
    let cancelled = false;
    setPdfLinks(null);
    void import('../../services/linkListService').then((svc) =>
      svc.readPdfLinks(pdfDoc, reaIds, () => cancelled).then((links) => !cancelled && setPdfLinks(links))
    );
    return () => {
      cancelled = true;
    };
    // reaIds cambia con cada marca nueva: basta con releer cuando cambia el documento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc]);

  const all = useMemo(() => [...markupLinks, ...(pdfLinks ?? [])], [markupLinks, pdfLinks]);
  const shown = useMemo(() => filterLinks(all, filter, numPages), [all, filter, numPages]);
  const groups = useMemo(() => groupLinksByPage(shown), [shown]);
  const broken = useMemo(() => all.filter((e) => isBrokenLink(e.target, numPages)).length, [all, numPages]);

  const select = (e: LinkEntry) => {
    useDocumentStore.getState().setCurrentPage(e.pageIndex);
    if (e.markupId) useMarkupStore.getState().setSelectedMarkupIds([e.markupId]);
  };

  const follow = async (e: LinkEntry) => {
    const svc = await import('../../services/linkService');
    if (e.target.kind === 'url') await svc.openExternalUrl(e.target.url);
    else if (e.target.kind === 'page') svc.goToPageNumber(e.target.page);
  };

  return (
    <PanelShell title="Links" testId="links-panel">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-cad-border">
        <select data-testid="links-filter" value={filter} onChange={(e) => setFilter(e.target.value as LinkFilter)} className="ui-input !h-6 flex-1 min-w-0">
          <option value="all">All links</option>
          <option value="url">Web and email</option>
          <option value="page">Go to page</option>
          <option value="broken">Broken</option>
        </select>
        <span className="text-gray-400 shrink-0" data-testid="links-count">
          {shown.length}
          {broken > 0 && <span className="text-amber-400"> · {broken} broken</span>}
        </span>
      </div>
      {pdfLinks === null && <div className="px-3 py-2 text-gray-500">Reading the links of the document…</div>}
      {pdfLinks !== null && groups.length === 0 && (
        <div className="p-3 text-gray-500" data-testid="links-empty">
          {all.length === 0 ? 'This document has no links. Add one with Hyperlink in the Insert tab.' : 'No links match this filter.'}
        </div>
      )}
      {groups.map((g) => (
        <section key={g.pageIndex} data-testid={`links-page-${g.pageIndex}`}>
          <h3 className={`px-2 py-1 text-2xs font-medium border-b border-cad-border ${g.pageIndex === currentPage ? 'text-cad-accent' : 'text-gray-500'}`}>Page {g.pageIndex + 1}</h3>
          <ul>
            {g.entries.map((e) => {
              const isBroken = isBrokenLink(e.target, numPages);
              return (
                <li key={e.key} data-testid={`link-row-${e.key}`} className="group flex items-center gap-1.5 px-2 py-1 hover:bg-cad-hover">
                  <button type="button" onClick={() => select(e)} className="flex-1 min-w-0 flex items-center gap-1.5 text-left" title={targetLabel(e.target)}>
                    {e.target.kind === 'url' ? <Link2 size={16} className="shrink-0 text-gray-400" /> : <FileText size={16} className="shrink-0 text-gray-400" />}
                    <span className={`truncate ${isBroken ? 'text-gray-500 line-through' : ''}`}>{targetLabel(e.target)}</span>
                    {isBroken && <TriangleAlert size={16} className="shrink-0 text-amber-400" aria-label="Broken link" />}
                    {e.source === 'pdf' && <span className="shrink-0 text-2xs text-gray-500">PDF</span>}
                  </button>
                  {!isBroken && (
                    <button type="button" data-testid={`link-follow-${e.key}`} onClick={() => void follow(e)} title={e.target.kind === 'url' ? 'Open the link' : 'Go to the page'} className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle">
                      {e.target.kind === 'url' ? <ExternalLink size={16} /> : <ArrowRight size={16} />}
                    </button>
                  )}
                  {e.markupId && !e.locked && (
                    <button
                      type="button"
                      data-testid={`link-delete-${e.key}`}
                      onClick={() => useMarkupStore.getState().deleteMarkup(e.markupId!)}
                      title="Delete the link"
                      className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </PanelShell>
  );
};
