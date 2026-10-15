import React from 'react';
import { ArrowLeftRight, Eye, EyeOff, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { useOverlayStore } from '../../store/useOverlayStore';
import { useDocumentStore } from '../../store/useDocumentStore';

/**
 * Barra de Overlay Pages (ADR-0038) sobre el visor: leyenda de colores (página actual / comparada), página comparada,
 * intercambiar colores, ocultar cada capa, alinear con desplazamientos de 1 pt (10 pt con Mayús) y cerrar.
 */
export const OverlayBar: React.FC = () => {
  const o = useOverlayStore();
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  if (!o.active) return null;

  const step = (e: React.MouseEvent) => (e.shiftKey ? 10 : 1);
  const iconBtn = 'ui-btn !h-7 !w-7 !p-0';

  return (
    <div
      data-testid="overlay-bar"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-cad-panel border border-cad-border shadow-[0_10px_32px_rgba(0,0,0,0.28)] text-[12px] text-gray-200 whitespace-nowrap"
    >
      <span className="ui-panel-title px-1">Overlay</span>
      <span className="w-px h-4 bg-cad-border" />

      {/* Página actual */}
      <button
        type="button"
        data-testid="overlay-toggle-base"
        aria-pressed={o.showBase}
        onClick={() => o.setShowBase(!o.showBase)}
        title={o.showBase ? 'Hide the current page' : 'Show the current page'}
        className="ui-btn !h-7 !px-2"
      >
        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: o.baseColor, opacity: o.showBase ? 1 : 0.3 }} />
        Current · p. {currentPage + 1}
        {o.showBase ? <Eye size={13} className="text-gray-400" /> : <EyeOff size={13} className="text-gray-400" />}
      </button>

      <button type="button" data-testid="overlay-swap" onClick={o.swapColors} title="Swap colors" className={iconBtn}>
        <ArrowLeftRight size={14} />
      </button>

      {/* Página comparada */}
      <span className="flex items-center gap-1.5 pl-1">
        <button
          type="button"
          data-testid="overlay-toggle-other"
          aria-pressed={o.showOther}
          onClick={() => o.setShowOther(!o.showOther)}
          title={o.showOther ? 'Hide the compared page' : 'Show the compared page'}
          className="ui-btn !h-7 !px-2 max-w-[220px]"
        >
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: o.otherColor, opacity: o.showOther ? 1 : 0.3 }} />
          <span className="truncate">{o.sourceName}</span>
          {o.showOther ? <Eye size={13} className="text-gray-400 shrink-0" /> : <EyeOff size={13} className="text-gray-400 shrink-0" />}
        </button>
        <select
          data-testid="overlay-page-select"
          value={o.otherPageIndex}
          onChange={(e) => o.setOtherPage(Number(e.target.value))}
          className="ui-input !h-7 w-[72px]"
          title="Page to compare"
        >
          {Array.from({ length: o.otherPageCount }, (_, i) => (
            <option key={i} value={i}>
              p. {i + 1}
            </option>
          ))}
        </select>
      </span>

      <span className="w-px h-4 bg-cad-border" />

      {/* Alinear: desplazamiento de la página comparada */}
      <span className="flex items-center" title="Align the compared page: 1 pt per click, 10 pt with Shift">
        <button type="button" data-testid="overlay-nudge-left" onClick={(e) => o.nudge(-step(e), 0)} className={iconBtn}>
          <ChevronLeft size={14} />
        </button>
        <button type="button" data-testid="overlay-nudge-up" onClick={(e) => o.nudge(0, -step(e))} className={iconBtn}>
          <ChevronUp size={14} />
        </button>
        <button type="button" data-testid="overlay-nudge-down" onClick={(e) => o.nudge(0, step(e))} className={iconBtn}>
          <ChevronDown size={14} />
        </button>
        <button type="button" data-testid="overlay-nudge-right" onClick={(e) => o.nudge(step(e), 0)} className={iconBtn}>
          <ChevronRight size={14} />
        </button>
      </span>
      <span data-testid="overlay-offset" className="tabular-nums text-gray-400 w-[86px] text-center">
        {o.offset.x}, {o.offset.y} pt
      </span>
      <button type="button" data-testid="overlay-reset-offset" onClick={o.resetOffset} title="Reset alignment" className={iconBtn}>
        <RotateCcw size={13} />
      </button>

      <span className="w-px h-4 bg-cad-border" />
      <button type="button" data-testid="overlay-close" onClick={o.close} title="Close overlay" className={iconBtn}>
        <X size={14} />
      </button>
    </div>
  );
};

export default OverlayBar;
