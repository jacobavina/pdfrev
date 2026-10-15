import React, { useEffect, useState } from 'react';
import { Files, Bookmark, Layers, Eye, EyeOff, ChevronRight, ChevronDown } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { listPdfLayers, OptionalContentConfigLike } from '../../core/pdf/pdfLayers';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore, LeftPanelTab, NO_LAYER } from '../../store/useUiStore';
import { ThumbnailsSidebar } from '../ThumbnailsSidebar';

const TABS: { id: LeftPanelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'pages', label: 'Thumbnails', icon: <Files size={16} /> },
  { id: 'bookmarks', label: 'Bookmarks', icon: <Bookmark size={16} /> },
  { id: 'layers', label: 'Layers', icon: <Layers size={16} /> },
];

const PanelShell: React.FC<{ title: string; testId: string; children: React.ReactNode }> = ({
  title,
  testId,
  children,
}) => (
  <aside data-testid={testId} className="w-60 bg-cad-panel border-r border-cad-border flex flex-col select-none min-h-0 text-[12px]">
    <div className="h-10 px-3 border-b border-cad-border flex items-center ui-panel-title shrink-0">
      {title}
    </div>
    <div className="flex-1 overflow-y-auto text-[12px] text-gray-200">{children}</div>
  </aside>
);

// ---------------------------------------------------------------- Marcadores (índice del PDF)

interface OutlineNode {
  title: string;
  dest: unknown;
  items: OutlineNode[];
}

const BookmarksPanel: React.FC = () => {
  const { pdfDoc, setCurrentPage } = useDocumentStore();
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setOutline(null);
    setError(null);
    if (!pdfDoc || typeof pdfDoc.getOutline !== 'function') return;
    pdfDoc
      .getOutline()
      .then((o) => {
        if (!cancelled) setOutline((o as unknown as OutlineNode[] | null) ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  const navigate = async (dest: unknown) => {
    if (!pdfDoc) return;
    try {
      const explicit = typeof dest === 'string' ? await pdfDoc.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit.length === 0) return;
      const ref = explicit[0];
      const index =
        typeof ref === 'number' ? ref : await pdfDoc.getPageIndex(ref as Parameters<typeof pdfDoc.getPageIndex>[0]);
      setCurrentPage(index);
    } catch (e) {
      setError(`Could not open the bookmark: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const renderNodes = (nodes: OutlineNode[], depth: number, prefix: string): React.ReactNode =>
    nodes.map((node, i) => {
      const key = `${prefix}${i}`;
      const hasChildren = node.items && node.items.length > 0;
      const isCollapsed = collapsed[key];
      return (
        <div key={key}>
          <div className="flex items-center hover:bg-cad-hover" style={{ paddingLeft: 6 + depth * 12 }}>
            <button
              type="button"
              className="w-4 h-5 flex items-center justify-center text-gray-500"
              onClick={() => hasChildren && setCollapsed({ ...collapsed, [key]: !isCollapsed })}
              aria-label={hasChildren ? (isCollapsed ? 'Expand' : 'Collapse') : undefined}
            >
              {hasChildren ? isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} /> : null}
            </button>
            <button
              type="button"
              className="flex-1 text-left py-1 pr-2 truncate"
              title={node.title}
              onClick={() => navigate(node.dest)}
            >
              {node.title}
            </button>
          </div>
          {hasChildren && !isCollapsed && renderNodes(node.items, depth + 1, `${key}-`)}
        </div>
      );
    });

  return (
    <PanelShell title="Bookmarks" testId="bookmarks-panel">
      {error && <div className="p-3 text-red-600 dark:text-red-400">{error}</div>}
      {!error && outline === null && pdfDoc && <div className="p-3 text-gray-500">Reading outline…</div>}
      {!error && outline !== null && outline.length === 0 && (
        <div data-testid="bookmarks-empty" className="p-3 text-gray-500 leading-relaxed">
          This document has no bookmarks.
        </div>
      )}
      {!error && outline && outline.length > 0 && <div className="py-1">{renderNodes(outline, 0, '')}</div>}
    </PanelShell>
  );
};

// ---------------------------------------------------------------- Capas (visibilidad de marcas)

/** Capas propias del PDF (/OCG, ADR-0024): las que exportan los programas de CAD, como el panel Layers de Revu. */
const PdfLayersSection: React.FC = () => {
  const ocConfig = useDocumentStore((s) => s.ocConfig);
  useDocumentStore((s) => s.ocVersion); // re-render al cambiar la visibilidad
  const { setPdfLayerVisible, setAllPdfLayersVisible } = useDocumentStore();
  const rows = listPdfLayers(ocConfig as OptionalContentConfigLike | null);

  return (
    <section data-testid="pdf-layers-section" className="border-b border-cad-border">
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="ui-section-title">PDF Layers ({rows.filter((r) => r.id).length})</span>
        {rows.length > 0 && (
          <span className="flex gap-1">
            <button
              type="button"
              data-testid="pdf-layers-show-all"
              onClick={() => setAllPdfLayersVisible(true)}
              className="ui-btn !h-6 !px-1.5 !text-[11px]"
            >
              Show all
            </button>
            <button
              type="button"
              data-testid="pdf-layers-hide-all"
              onClick={() => setAllPdfLayersVisible(false)}
              className="ui-btn !h-6 !px-1.5 !text-[11px]"
            >
              Hide all
            </button>
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-3 text-gray-500">This PDF has no layers.</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] text-gray-500 border-b border-cad-border">
              <th className="font-medium px-2 py-1">Layer</th>
              <th className="font-medium px-2 py-1 w-14 text-center">Visible</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.id ?? 'grp'}-${i}`} data-testid={`pdf-layer-row-${i}`} className="hover:bg-cad-hover">
                <td
                  className={`px-2 py-1 truncate max-w-0 ${row.id ? '' : 'font-semibold text-gray-300'} ${
                    row.id && !row.visible ? 'text-gray-500' : ''
                  }`}
                  style={{ paddingLeft: 8 + row.depth * 12 }}
                  title={row.name}
                >
                  {row.name}
                </td>
                <td className="px-2 py-1 text-center">
                  {row.id && (
                    <button
                      type="button"
                      data-testid={`pdf-layer-toggle-${i}`}
                      aria-pressed={row.visible}
                      onClick={() => setPdfLayerVisible(row.id!, !row.visible)}
                      title={row.visible ? 'Hide layer' : 'Show layer'}
                      className="p-0.5 rounded hover:bg-cad-subtle text-gray-400"
                    >
                      {row.visible ? <Eye size={14} className="text-cad-accent" /> : <EyeOff size={14} />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

const LayersPanel: React.FC = () => {
  const { markups } = useMarkupStore();
  const { hiddenLayers, toggleLayerVisibility } = useUiStore();

  const counts = new Map<string, number>();
  for (const m of markups) {
    const layer = m.layer ?? NO_LAYER;
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  const layers = [...counts.entries()].sort(([a], [b]) => {
    if (a === NO_LAYER) return 1;
    if (b === NO_LAYER) return -1;
    return a.localeCompare(b, 'en');
  });

  return (
    <PanelShell title="Layers" testId="layers-panel">
      <PdfLayersSection />
      <div className="px-3 pt-3 pb-1.5 ui-section-title">Markup Layers</div>
      {layers.length === 0 ? (
        <div className="p-3 text-gray-500">There are no markups in the document.</div>
      ) : (
        <ul className="py-1">
          {layers.map(([layer, count]) => {
            const hidden = hiddenLayers.includes(layer);
            return (
              <li key={layer || '__none'} className="flex items-center gap-2 px-2 py-1 hover:bg-cad-hover">
                <button
                  type="button"
                  data-testid={`layer-toggle-${layer || 'sin-capa'}`}
                  onClick={() => toggleLayerVisibility(layer)}
                  title={hidden ? 'Show layer' : 'Hide layer'}
                  aria-pressed={!hidden}
                  className="p-0.5 rounded hover:bg-cad-subtle text-gray-400"
                >
                  {hidden ? <EyeOff size={14} /> : <Eye size={14} className="text-cad-accent" />}
                </button>
                <span className={`flex-1 truncate ${hidden ? 'text-gray-500 line-through' : ''}`}>
                  {layer || 'No layer'}
                </span>
                <span className="ui-badge">{count}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-3 py-2 text-[11px] text-gray-500 leading-snug border-t border-cad-border">
        Hiding a layer hides its markups on the drawing and prevents selecting them. The PDF is not modified.
      </p>
    </PanelShell>
  );
};

// ---------------------------------------------------------------- Dock

/** Panel izquierdo con pestañas verticales (ADR-0017). */
export const LeftDock: React.FC = () => {
  const { leftTab, leftOpen, setLeftTab } = useUiStore();
  const { pdfDoc } = useDocumentStore();

  return (
    <div className="flex min-h-0" data-testid="left-dock">
      <nav aria-label="Document panels" className="rail-left w-11 bg-cad-panel border-r border-cad-border flex flex-col items-center py-2 gap-1 shrink-0">
        {TABS.map((tab) => {
          const active = leftOpen && leftTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`left-tab-${tab.id}`}
              onClick={() => setLeftTab(tab.id)}
              title={tab.label}
              aria-pressed={active}
              className="rail-btn"
            >
              {tab.icon}
            </button>
          );
        })}
      </nav>
      {leftOpen && pdfDoc && leftTab === 'pages' && <ThumbnailsSidebar />}
      {leftOpen && pdfDoc && leftTab === 'bookmarks' && <BookmarksPanel />}
      {leftOpen && leftTab === 'layers' && <LayersPanel />}
    </div>
  );
};
