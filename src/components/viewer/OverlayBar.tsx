import React, { useEffect } from 'react';
import { ArrowLeftRight, Eye, EyeOff, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RotateCcw, Crosshair } from 'lucide-react';
import { describeLinear } from '../../core/compare/overlayAlign';
import { showToast } from '../../services/toastService';
import { useOverlayStore } from '../../store/useOverlayStore';
import { useDocumentStore } from '../../store/useDocumentStore';

/**
 * Barra de Overlay Pages (ADR-0038) sobre el visor: leyenda de colores (página actual / comparada), página comparada,
 * intercambiar colores, ocultar cada capa, alinear con desplazamientos de 1 pt (10 pt con Mayús) y cerrar.
 */
export const OverlayBar: React.FC = () => {
  const o = useOverlayStore();
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  // Esc cancela la alineación por puntos
  useEffect(() => {
    if (!o.align.picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useOverlayStore.getState().cancelAlign();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [o.align.picking]);
  if (!o.active) return null;

  // Siguiente punto que pide la alineación (ADR-0050): primero en la página actual y luego el mismo en la comparada
  const pairs = Math.min(o.align.base.length, o.align.other.length);
  const onBase = o.align.base.length === o.align.other.length;
  const pointNo = (onBase ? o.align.base.length : o.align.other.length) + 1;
  const lin = describeLinear(o.matrix);
  const aligned = Math.abs(lin.scale - 1) > 1e-4 || Math.abs(lin.rotationDeg) > 1e-3;
  const apply = () => {
    if (!o.applyAlign()) showToast('Those points cannot align the drawings: pick points that are apart (and not in a line, with 3).');
  };

  const step = (e: React.MouseEvent) => (e.shiftKey ? 10 : 1);
  const iconBtn = 'ui-btn !h-7 !w-7 !p-0';

  return (
    <div
      data-testid="overlay-bar"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-cad-panel border border-cad-border shadow-float text-xs text-gray-200 whitespace-nowrap"
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
        {o.showBase ? <Eye size={16} className="text-gray-400" /> : <EyeOff size={16} className="text-gray-400" />}
      </button>

      <button type="button" data-testid="overlay-swap" onClick={o.swapColors} title="Swap colors" className={iconBtn}>
        <ArrowLeftRight size={16} />
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
          {o.showOther ? <Eye size={16} className="text-gray-400 shrink-0" /> : <EyeOff size={16} className="text-gray-400 shrink-0" />}
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
          <ChevronLeft size={16} />
        </button>
        <button type="button" data-testid="overlay-nudge-up" onClick={(e) => o.nudge(0, -step(e))} className={iconBtn}>
          <ChevronUp size={16} />
        </button>
        <button type="button" data-testid="overlay-nudge-down" onClick={(e) => o.nudge(0, step(e))} className={iconBtn}>
          <ChevronDown size={16} />
        </button>
        <button type="button" data-testid="overlay-nudge-right" onClick={(e) => o.nudge(step(e), 0)} className={iconBtn}>
          <ChevronRight size={16} />
        </button>
      </span>
      <span data-testid="overlay-offset" className="ui-data text-gray-400 min-w-[86px] text-center">
        {o.offset.x}, {o.offset.y} pt
        {aligned && ` · ×${lin.scale.toFixed(3)} · ${lin.rotationDeg.toFixed(2)}°`}
      </span>
      {/* Alinear por puntos: 2 pares (desplazar, girar y escalar) o 3 (también deformación) */}
      {o.align.picking ? (
        <span data-testid="overlay-align-steps" className="flex items-center gap-1.5 pl-1">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: onBase ? o.baseColor : o.otherColor }} />
          <span className="text-gray-300">
            Point {pointNo} on the {onBase ? 'current page' : 'compared page'}
          </span>
          <button
            type="button"
            data-testid="overlay-align-apply"
            disabled={pairs < 2 || !onBase}
            onClick={apply}
            className="ui-btn ui-btn-primary !h-7 !px-2.5"
            title="Align with the points picked (2 points: move, rotate and scale; 3: also skew)"
          >
            Apply
          </button>
          <button type="button" data-testid="overlay-align-cancel" onClick={o.cancelAlign} className="ui-btn !h-7 !px-2" title="Cancel (Esc)">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          data-testid="overlay-align"
          onClick={o.startAlign}
          className="ui-btn !h-7 !px-2"
          title="Align by points: click a point on the current page, then the same point on the compared page (2 or 3 pairs)"
        >
          <Crosshair size={16} />
          Align
        </button>
      )}
      <button type="button" data-testid="overlay-reset-offset" onClick={o.resetOffset} title="Reset alignment" className={iconBtn}>
        <RotateCcw size={16} />
      </button>

      <span className="w-px h-4 bg-cad-border" />
      <button type="button" data-testid="overlay-close" onClick={o.close} title="Close overlay" className={iconBtn}>
        <X size={16} />
      </button>
    </div>
  );
};

export default OverlayBar;
