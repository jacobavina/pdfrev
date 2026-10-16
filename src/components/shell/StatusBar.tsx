import React from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Search, Crosshair, List } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useSearchStore } from '../../store/useSearchStore';
import { useUiStore } from '../../store/useUiStore';
import { goToPage } from './appActions';
import { describeCalibration } from '../../core/measurements/scale';
import { SinglePageIcon, ContinuousIcon, FitPageIcon, FitWidthIcon } from './customIcons';

const Divider = () => <div className="h-4 w-px bg-cad-border mx-1.5 shrink-0" />;

/**
 * Barra de estado inferior (ADR-0017): navegación de páginas, zoom y rotación de la vista, escala de la
 * página activa (clic para calibrar), coordenadas del cursor en unidades reales, selección y guardado.
 */
export const StatusBar: React.FC = () => {
  const { numPages, currentPageIndex, scale, zoomIn, zoomOut, resetZoom, rotateClockwise, pdfBytes, filePath } =
    useDocumentStore();
  const { markups, selectedMarkupIds, isDirty } = useMarkupStore();
  const { calibrations, getPageCalibration } = useCalibrationStore();
  const cursorPt = useUiStore((s) => s.cursorPt);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const requestFit = useUiStore((s) => s.requestFit);
  const markupsListOpen = useUiStore((s) => s.markupsListOpen);
  const toggleMarkupsList = useUiStore((s) => s.toggleMarkupsList);
  const pageDims = useDocumentStore((s) => s.pageDimensions[s.currentPageIndex]);
  // Tamaño de la hoja activa (la dimensión guardada está en píxeles a la escala del último render)
  const sheetCm =
    pageDims && scale > 0
      ? { w: ((pageDims.width / scale) / 72) * 2.54, h: ((pageDims.height / scale) / 72) * 2.54 }
      : null;
  const modeBtn = (active: boolean) =>
    `p-0.5 rounded hover:bg-cad-hover hover:text-cad-strong ${active ? 'bg-cad-hover text-cad-strong' : ''}`;

  const isCalibrated = calibrations[currentPageIndex] !== undefined;
  const calib = getPageCalibration(currentPageIndex);
  const precision = calib.precision ?? 2;
  const fmt = (pt: number) => (pt * calib.scale).toFixed(precision);

  return (
    <footer
      data-testid="status-bar"
      className="h-[26px] min-w-0 bg-cad-status border-t border-cad-border flex items-center px-2 text-[11px] text-gray-400 select-none overflow-x-auto thin-scroll"
    >
      {/* Lista de marcas (ADR-0060): cerrada, como en Revu, solo queda este botón */}
      <button
        type="button"
        data-testid="markups-list-toggle"
        onClick={toggleMarkupsList}
        aria-pressed={markupsListOpen}
        className={`h-[22px] w-[26px] mr-1.5 -ml-1 grid place-items-center rounded ${
          markupsListOpen ? 'bg-cad-accent/20 text-cad-accent' : 'hover:bg-cad-hover hover:text-cad-strong'
        }`}
        title="Markups List (Alt+L)"
      >
        <List size={15} />
      </button>
      {/* Navegación de páginas */}
      <button
        type="button"
        onClick={() => goToPage(-1)}
        disabled={currentPageIndex <= 0}
        className="p-0.5 rounded hover:bg-cad-hover hover:text-cad-strong disabled:opacity-30"
        title="Previous page"
      >
        <ChevronLeft size={15} />
      </button>
      <span data-testid="page-indicator" className="tabular-nums px-1 whitespace-nowrap">
        {numPages > 0 ? `${currentPageIndex + 1} / ${numPages}` : '— / —'}
      </span>
      <button
        type="button"
        onClick={() => goToPage(1)}
        disabled={currentPageIndex >= numPages - 1}
        className="p-0.5 rounded hover:bg-cad-hover hover:text-cad-strong disabled:opacity-30"
        title="Next page"
      >
        <ChevronRight size={15} />
      </button>

      <Divider />

      {/* Zoom y rotación */}
      <button type="button" onClick={zoomOut} className="p-0.5 rounded hover:bg-cad-hover" title="Zoom out (-)">
        <ZoomOut size={14} />
      </button>
      <button
        type="button"
        onClick={resetZoom}
        className="tabular-nums px-1.5 rounded hover:bg-cad-hover min-w-[3.25rem]"
        title="Reset zoom to 100%"
      >
        {Math.round(scale * 100)}%
      </button>
      <button type="button" onClick={zoomIn} className="p-0.5 rounded hover:bg-cad-hover" title="Zoom in (+)">
        <ZoomIn size={14} />
      </button>
      <button type="button" onClick={rotateClockwise} className="p-0.5 rounded hover:bg-cad-hover ml-0.5" title="Rotate 90°">
        <RotateCw size={13} />
      </button>

      <Divider />

      {/* Modo de visualización y ajuste (ADR-0019) */}
      <button
        type="button"
        data-testid="view-single-btn"
        aria-pressed={viewMode === 'single'}
        onClick={() => setViewMode('single')}
        className={modeBtn(viewMode === 'single')}
        title="Single page (Ctrl+4)"
      >
        <SinglePageIcon />
      </button>
      <button
        type="button"
        data-testid="view-continuous-btn"
        aria-pressed={viewMode === 'continuous'}
        onClick={() => setViewMode('continuous')}
        className={modeBtn(viewMode === 'continuous')}
        title="Continuous pages (Ctrl+5)"
      >
        <ContinuousIcon />
      </button>
      <button
        type="button"
        data-testid="fit-page-btn"
        onClick={() => requestFit('page')}
        disabled={!pdfBytes}
        className={modeBtn(false) + ' ml-1 disabled:opacity-30'}
        title="Fit page (Ctrl+9)"
      >
        <FitPageIcon />
      </button>
      <button
        type="button"
        data-testid="fit-width-btn"
        onClick={() => requestFit('width')}
        disabled={!pdfBytes}
        className={modeBtn(false) + ' disabled:opacity-30'}
        title="Fit width (Ctrl+0)"
      >
        <FitWidthIcon />
      </button>

      <Divider />

      {/* Escala de la página (clic para calibrar) */}
      {pdfBytes && (
        <button
          type="button"
          data-testid="calibration-indicator"
          // La escala se edita en el panel Measure (ADR-0031); desde allí, Calibrate marca dos puntos
          onClick={() => useUiStore.getState().requestMeasurementsPanel()}
          className="flex items-center gap-1.5 px-1.5 rounded hover:bg-cad-hover hover:text-cad-strong whitespace-nowrap"
          title="Open the Measure panel to calibrate or adjust this page's scale"
        >
          <span className={`w-2 h-2 rounded-full ${isCalibrated ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="tabular-nums">
            {isCalibrated
              ? `Scale: ${describeCalibration(calib)}`
              : `Scale not set (paper scale, ${calib.unit})`}
          </span>
        </button>
      )}

      <Divider />

      {/* Coordenadas del cursor en unidades reales */}
      <span data-testid="cursor-coordinates" className="flex items-center gap-1 tabular-nums whitespace-nowrap min-w-[11rem]">
        <Crosshair size={12} className="text-gray-500" />
        {cursorPt ? `X ${fmt(cursorPt.x)}  Y ${fmt(cursorPt.y)} ${calib.unit}` : '—'}
      </span>

      <div className="flex-1" />

      {sheetCm && (
        <>
          <span
            data-testid="sheet-size"
            className="tabular-nums whitespace-nowrap"
            title={`${(sheetCm.w / 2.54).toFixed(2)} × ${(sheetCm.h / 2.54).toFixed(2)} in`}
          >
            {sheetCm.w.toFixed(2)} × {sheetCm.h.toFixed(2)} cm
          </span>
          <Divider />
        </>
      )}

      <span className="whitespace-nowrap">
        {markups.length} {markups.length === 1 ? 'markup' : 'markups'}
        {selectedMarkupIds.length > 0 && ` · ${selectedMarkupIds.length} selected`}
      </span>

      <Divider />

      <span
        data-testid="save-state"
        className={`whitespace-nowrap ${!filePath ? 'text-gray-500' : isDirty ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
      >
        {!filePath ? 'Demo' : isDirty ? '● Unsaved changes' : 'Saved'}
      </span>

      <Divider />

      <button
        type="button"
        data-testid="search-toggle-btn"
        onClick={() => useSearchStore.getState().setIsOpen(true)}
        className="p-0.5 rounded hover:bg-cad-hover hover:text-cad-strong"
        title="Find text in drawing (Ctrl+F)"
      >
        <Search size={13} />
      </button>
    </footer>
  );
};
