import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ruler, ChevronRight, Scale, FileSpreadsheet } from 'lucide-react';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useToolStore } from '../../store/useToolStore';
import { useUiStore } from '../../store/useUiStore';
import { computeMeasureTotals, measureCategoryOf, MeasureTotal } from '../../core/measurements/totals';

const CATEGORY_LABEL = { length: 'Longitud', area: 'Área', count: 'Conteo' } as const;

function formatTotal(t: MeasureTotal, precision: number): string {
  if (t.category === 'count') return `${t.total} u`;
  if (t.category === 'area') return `${t.total.toFixed(precision)} ${t.unit}²`;
  return `${t.total.toFixed(precision)} ${t.unit}`;
}

/**
 * Panel de mediciones (ADR-0017): escala de la página, totales de takeoff agrupados por tipo y unidad,
 * y lista de mediciones con navegación. Plegable, como el resto de paneles laterales derechos.
 */
export const MeasurementsPanel: React.FC<{ defaultCollapsed?: boolean }> = ({ defaultCollapsed = true }) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [scope, setScope] = useState<'page' | 'document'>('page');
  const { markups, selectedMarkupIds, setSelectedMarkupIds } = useMarkupStore();
  const { currentPageIndex, setCurrentPage, pdfBytes } = useDocumentStore();
  const { calibrations, getPageCalibration, setPendingCalibrationPoints, setCalibrationModalOpen } =
    useCalibrationStore();
  const { setActiveTool } = useToolStore();

  const openRequest = useUiStore((s) => s.measurementsOpenRequest);
  const initialRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest !== initialRequest.current) setIsCollapsed(false);
  }, [openRequest]);

  const pageFilter = scope === 'page' ? currentPageIndex : undefined;
  const totals = useMemo(() => computeMeasureTotals(markups, pageFilter), [markups, pageFilter]);
  const measureMarkups = useMemo(
    () => markups.filter((m) => measureCategoryOf(m) && (pageFilter === undefined || m.pageIndex === pageFilter)),
    [markups, pageFilter]
  );

  const calib = getPageCalibration(currentPageIndex);
  const isCalibrated = calibrations[currentPageIndex] !== undefined;
  // Los totales pueden sumar marcas de páginas con escalas distintas: precisión fija de 2 decimales
  const precision = 2;

  if (isCollapsed) {
    return (
      <aside
        data-testid="measurements-panel"
        data-collapsed="true"
        className="w-10 bg-cad-panel border-l border-cad-border flex flex-col items-center py-3 select-none z-10"
      >
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 text-gray-400 hover:text-cad-strong hover:bg-cad-hover rounded mb-3 transition-colors"
          title="Expandir mediciones"
          data-testid="expand-measurements-btn"
        >
          <Ruler size={16} />
        </button>
        <span className="text-[10px] text-gray-500 font-medium rotate-90 whitespace-nowrap mt-6">Mediciones</span>
      </aside>
    );
  }

  return (
    <aside
      data-testid="measurements-panel"
      data-collapsed="false"
      className="w-72 bg-cad-panel border-l border-cad-border flex flex-col text-xs select-none min-h-0"
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-cad-border shrink-0">
        <span className="font-semibold text-gray-300 uppercase tracking-wider">Mediciones</span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-gray-400 hover:text-cad-strong hover:bg-cad-hover rounded transition-colors"
          title="Colapsar mediciones"
          data-testid="collapse-measurements-btn"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Escala de la página */}
        <section className="rounded border border-cad-border bg-cad-ribbon p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Escala · pág. {currentPageIndex + 1}</span>
            <span
              className={`px-1.5 rounded text-[10px] ${
                isCalibrated
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              }`}
            >
              {isCalibrated ? 'Calibrada' : 'Sin calibrar'}
            </span>
          </div>
          <div data-testid="measurements-scale" className="font-mono text-gray-200">
            {isCalibrated ? `1 ${calib.unit} = ${(1 / calib.scale).toFixed(2)} pt` : `Escala de papel (${calib.unit})`}
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={!pdfBytes}
              onClick={() => setActiveTool('calibrate')}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-cad-border hover:bg-cad-hover disabled:opacity-40"
              title="Trazar una distancia conocida sobre el plano"
            >
              <Scale size={12} /> Calibrar con 2 puntos
            </button>
            <button
              type="button"
              disabled={!pdfBytes}
              onClick={() => {
                setPendingCalibrationPoints([]);
                setCalibrationModalOpen(true);
              }}
              className="px-2 py-1 rounded border border-cad-border hover:bg-cad-hover disabled:opacity-40"
              title="Escribir la escala numéricamente"
            >
              Escala…
            </button>
          </div>
        </section>

        {/* Totales */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-gray-300">Totales</span>
            <div className="flex rounded border border-cad-border overflow-hidden text-[11px]">
              {(['page', 'document'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`measurements-scope-${s}`}
                  onClick={() => setScope(s)}
                  className={`px-2 py-0.5 ${scope === s ? 'bg-cad-accent text-white' : 'hover:bg-cad-hover'}`}
                >
                  {s === 'page' ? 'Página' : 'Documento'}
                </button>
              ))}
            </div>
          </div>
          {totals.length === 0 ? (
            <p data-testid="measurements-empty" className="text-gray-500 leading-relaxed">
              Sin mediciones {scope === 'page' ? 'en esta página' : 'en el documento'}. Use Longitud, Área o Conteo
              en la cinta (grupo Medición).
            </p>
          ) : (
            <table data-testid="measurements-totals" className="w-full border-collapse">
              <thead>
                <tr className="text-gray-500 text-[10px] uppercase">
                  <th className="text-left font-medium pb-1">Tipo</th>
                  <th className="text-right font-medium pb-1">Elem.</th>
                  <th className="text-right font-medium pb-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <React.Fragment key={`${t.category}-${t.unit}`}>
                    <tr className="border-t border-cad-border" data-testid={`measurements-total-${t.category}`}>
                      <td className="py-1 text-gray-200">{CATEGORY_LABEL[t.category]}</td>
                      <td className="py-1 text-right font-mono text-gray-400">{t.items}</td>
                      <td className="py-1 text-right font-mono text-cad-strong">{formatTotal(t, precision)}</td>
                    </tr>
                    {t.category === 'area' && t.perimeter !== undefined && (
                      <tr>
                        <td className="pb-1 pl-3 text-gray-500">Perímetro</td>
                        <td />
                        <td className="pb-1 text-right font-mono text-gray-400">
                          {t.perimeter.toFixed(precision)} {t.unit}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Lista de mediciones */}
        {measureMarkups.length > 0 && (
          <section>
            <div className="font-semibold text-gray-300 mb-1">Detalle</div>
            <ul className="space-y-0.5">
              {measureMarkups.map((m) => {
                const selected = selectedMarkupIds.includes(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPage(m.pageIndex);
                        setSelectedMarkupIds([m.id]);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded text-left ${
                        selected ? 'bg-cad-accent text-white' : 'hover:bg-cad-hover text-gray-200'
                      }`}
                    >
                      <span className="truncate">
                        {CATEGORY_LABEL[measureCategoryOf(m)!]} · pág. {m.pageIndex + 1}
                      </span>
                      <span className="font-mono">{m.measurement?.formatted}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <div className="p-2 border-t border-cad-border shrink-0">
        <button
          type="button"
          onClick={() => useUiStore.getState().requestExport('csv')}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border border-cad-border hover:bg-cad-hover"
          title="Exportar la lista de marcas con sus medidas a CSV (Excel)"
        >
          <FileSpreadsheet size={13} /> Exportar a CSV
        </button>
      </div>
    </aside>
  );
};
