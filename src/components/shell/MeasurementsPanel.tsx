import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ruler, ChevronRight, ChevronDown, FileSpreadsheet } from 'lucide-react';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useToolStore } from '../../store/useToolStore';
import { useUiStore } from '../../store/useUiStore';
import { computeMeasureTotals, measureCategoryOf, MeasureTotal } from '../../core/measurements/totals';
import { markupTypeLabel } from '../../core/markup/typeLabels';
import { PageCalibration } from '../../types/markup';
import {
  BUILT_IN_SCALE_PRESETS,
  DISPLAY_UNITS,
  DISPLAY_UNIT_LABELS,
  PAPER_UNITS,
  DisplayUnit,
  PaperUnit,
  ScalePreset,
  buildCalibration,
  convertLength,
  describeCalibration,
  displayUnitOf,
  formatFeetInches,
  parseFeetInches,
  precisionOptions,
} from '../../core/measurements/scale';
import { formatWithCalibration } from '../../core/measurements/scale';
import { rescaleVolumeDepth } from '../../core/measurements/calculate';
import { captionStyleOf } from '../../core/markup/measureCaption';

const CATEGORY_LABEL = { length: 'Length', area: 'Area', count: 'Count', volume: 'Volume', other: 'Other' } as const;
const USER_PRESETS_KEY = 'rea-scale-presets';

function readUserPresets(): ScalePreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_PRESETS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.id === 'string') : [];
  } catch {
    return [];
  }
}

function formatTotal(t: MeasureTotal, precision: number): string {
  if (t.category === 'count') return `${t.total} ea`;
  if (t.category === 'area') return `${t.total.toFixed(precision)} ${t.unit}²`;
  if (t.category === 'volume') return `${t.total.toFixed(precision)} ${t.unit}³`;
  return `${t.total.toFixed(precision)} ${t.unit}`;
}

/** Relación del panel a partir de una calibración (o de la escala por defecto de papel). */
function ratioOf(c: PageCalibration) {
  if (c.ratio) return c.ratio;
  const display = displayUnitOf(c);
  // 1 mm de papel equivale a scale × (pt por mm) unidades reales
  const real = c.scale * convertLength(1, 'mm', 'pt');
  return { paperValue: 1, paperUnit: 'mm' as PaperUnit, realValue: Number(real.toPrecision(6)), realUnit: display };
}

function precisionKeyOf(c: PageCalibration): string {
  return c.fractionDenominator ? `f${c.fractionDenominator}` : `d${c.precision ?? 2}`;
}

const inputCls =
  'h-7 rounded border border-cad-border bg-cad-dark px-1.5 text-gray-200 focus:outline-none focus:border-cad-accent';

/** Sección plegable con rótulo y línea, como los paneles Format de Foxit/Revu. */
const Section: React.FC<{ title: string; testId?: string; children: React.ReactNode }> = ({ title, testId, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <section data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 text-gray-300 font-semibold mb-1.5"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{title}</span>
        <span className="flex-1 border-t border-cad-border ml-1" />
      </button>
      {open && <div className="pl-3 space-y-2">{children}</div>}
    </section>
  );
};

/** Snap: íconos propios (punto final, punto medio, más cercano). */
const SNAP_TITLES = {
  endpoint: 'Snap to endpoints',
  midpoint: 'Snap to midpoints',
  intersection: 'Snap to intersections',
  nearest: 'Snap to nearest point on a line',
} as const;

const SnapIcon: React.FC<{ kind: 'endpoint' | 'midpoint' | 'nearest' | 'intersection' }> = ({ kind }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    {kind === 'intersection' ? <path d="M4 20 20 4M4 4l16 16" /> : <path d="M4 20 20 4" />}
    {kind === 'intersection' && <circle cx="12" cy="12" r="3.5" stroke="#a78bfa" />}
    {kind === 'endpoint' && <rect x="16" y="1" width="6" height="6" stroke="#a78bfa" />}
    {kind === 'midpoint' && <path d="m12 8.5 3.5 6h-7z" stroke="#a78bfa" />}
    {kind === 'nearest' && <path d="M9.5 9.5h5v5h-5zM12 12l7 7" stroke="#a78bfa" />}
  </svg>
);

/**
 * Panel de medición (ADR-0025), con la estructura de Format › Measure de Foxit: Scale (Calibrate, presets,
 * relación personalizada, escala Y separada, precisión), Distance Properties, Snap, Settings, totales y exportación.
 */
export const MeasurementsPanel: React.FC<{ defaultCollapsed?: boolean }> = ({ defaultCollapsed = true }) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [scope, setScope] = useState<'page' | 'document'>('page');
  const { markups, selectedMarkupIds, setSelectedMarkupIds } = useMarkupStore();
  const { currentPageIndex, setCurrentPage, pdfBytes, numPages } = useDocumentStore();
  const { calibrations, getPageCalibration, setPageCalibration, applyCalibrationToPages } = useCalibrationStore();
  const {
    setActiveTool,
    measureLabel,
    setMeasureLabel,
    volumeDepth,
    setVolumeDepth,
    measureCaption,
    setMeasureCaption,
    measureLeaders,
    setMeasureLeaders,
  } = useToolStore();
  const showRulers = useUiStore((s) => s.showRulers);
  const setShowRulers = useUiStore((s) => s.setShowRulers);
  const updateMarkup = useMarkupStore((s) => s.updateMarkup);
  const snap = useUiStore((s) => s.snap);
  const setSnap = useUiStore((s) => s.setSnap);
  const showMeasureLabels = useUiStore((s) => s.showMeasureLabels);
  const setShowMeasureLabels = useUiStore((s) => s.setShowMeasureLabels);

  const openRequest = useUiStore((s) => s.measurementsOpenRequest);
  const initialRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest !== initialRequest.current) setIsCollapsed(false);
  }, [openRequest]);

  const calib = getPageCalibration(currentPageIndex);

  // Distancia seleccionada: el campo Caption edita la suya; si no, el de las distancias nuevas (ADR-0032)
  const selectedLength =
    selectedMarkupIds.length === 1 ? markups.find((m) => m.id === selectedMarkupIds[0] && m.type === 'length') : undefined;

  // Volumen seleccionado: el campo Depth edita su profundidad; si no, la de las mediciones nuevas
  const selectedVolume =
    selectedMarkupIds.length === 1 ? markups.find((m) => m.id === selectedMarkupIds[0] && m.type === 'volume') : undefined;
  const onDepthChange = (depth: number) => {
    if (!(depth > 0) || !Number.isFinite(depth)) return;
    if (!selectedVolume) {
      setVolumeDepth(depth);
      return;
    }
    const oldDepth = Number(selectedVolume.customFields?.volumeDepth ?? 1);
    const precision = getPageCalibration(selectedVolume.pageIndex).precision ?? 2;
    const measurement = selectedVolume.measurement
      ? rescaleVolumeDepth(selectedVolume.measurement, oldDepth, depth, precision)
      : null;
    updateMarkup(selectedVolume.id, {
      customFields: { ...selectedVolume.customFields, volumeDepth: depth },
      ...(measurement ? { measurement, text: measurement.formatted } : {}),
    });
  };
  const isCalibrated = calibrations[currentPageIndex] !== undefined;
  const display = displayUnitOf(calib);
  const ratio = ratioOf(calib);

  // Borrador del formulario (se aplica a la página al cambiar cualquier valor válido)
  const [userPresets, setUserPresets] = useState<ScalePreset[]>(readUserPresets);
  const [mode, setMode] = useState<'preset' | 'custom'>(calib.presetId ? 'preset' : 'custom');
  const [paperValue, setPaperValue] = useState(String(ratio.paperValue));
  const [paperUnit, setPaperUnit] = useState<PaperUnit>(ratio.paperUnit);
  const [realText, setRealText] = useState(
    ratio.realUnit === 'ftin' ? formatFeetInches(ratio.realValue) : String(ratio.realValue)
  );
  const [realUnit, setRealUnit] = useState<DisplayUnit>(ratio.realUnit);
  const [separateY, setSeparateY] = useState(Boolean(ratio.y));
  const [yPaper, setYPaper] = useState(String(ratio.y?.paperValue ?? ratio.paperValue));
  const [yRealText, setYRealText] = useState(String(ratio.y?.realValue ?? ratio.realValue));
  const [precision, setPrecision] = useState(precisionKeyOf(calib));
  const [error, setError] = useState<string | null>(null);

  // Al cambiar de página, el formulario muestra la escala de esa página
  const pageKey = `${currentPageIndex}|${isCalibrated}`;
  const lastPageKey = useRef(pageKey);
  useEffect(() => {
    if (lastPageKey.current === pageKey) return;
    lastPageKey.current = pageKey;
    const c = useCalibrationStore.getState().getPageCalibration(currentPageIndex);
    const r = ratioOf(c);
    setMode(c.presetId ? 'preset' : 'custom');
    setPaperValue(String(r.paperValue));
    setPaperUnit(r.paperUnit);
    setRealText(r.realUnit === 'ftin' ? formatFeetInches(r.realValue) : String(r.realValue));
    setRealUnit(r.realUnit);
    setSeparateY(Boolean(r.y));
    setPrecision(precisionKeyOf(c));
    setError(null);
  }, [pageKey, currentPageIndex]);

  const parseReal = (text: string, unit: DisplayUnit) => (unit === 'ftin' ? parseFeetInches(text) : Number(text));

  /** Aplica la escala del formulario a la página activa. */
  const apply = (over: Partial<{
    paperValue: string;
    paperUnit: PaperUnit;
    realText: string;
    realUnit: DisplayUnit;
    display: DisplayUnit;
    precision: string;
    separateY: boolean;
    yPaper: string;
    yRealText: string;
    preset: ScalePreset | null;
  }> = {}) => {
    const pv = Number(over.paperValue ?? paperValue);
    const pu = over.paperUnit ?? paperUnit;
    const ru = over.realUnit ?? realUnit;
    const rv = parseReal(over.realText ?? realText, ru);
    const disp = over.display ?? display;
    const sepY = over.separateY ?? separateY;
    const preset = over.preset ?? null;
    const prec = over.precision ?? precision;
    // La precisión debe existir para la unidad de presentación
    const validPrec = precisionOptions(disp).some((o) => o.value === prec) ? prec : precisionOptions(disp)[2].value;
    const cal = buildCalibration({
      paperValue: preset ? preset.paperValue : pv,
      paperUnit: preset ? preset.paperUnit : pu,
      realValue: preset ? preset.realValue : rv,
      realUnit: preset ? preset.realUnit : ru,
      display: disp,
      precision: validPrec,
      ...(sepY && !preset
        ? { y: { paperValue: Number(over.yPaper ?? yPaper), paperUnit: pu, realValue: parseReal(over.yRealText ?? yRealText, ru), realUnit: ru } }
        : {}),
      ...(preset ? { presetId: preset.id } : {}),
    });
    if (!cal) {
      setError('Enter positive values for both sides of the scale.');
      return null;
    }
    setError(null);
    if (validPrec !== prec) setPrecision(validPrec);
    setPageCalibration(currentPageIndex, cal);
    return cal;
  };

  const allPresets = [...BUILT_IN_SCALE_PRESETS, ...userPresets];

  const addPreset = () => {
    const pv = Number(paperValue);
    const rv = parseReal(realText, realUnit);
    if (!(pv > 0) || !(rv > 0)) {
      setError('Enter positive values for both sides of the scale.');
      return;
    }
    const real = realUnit === 'ftin' ? formatFeetInches(rv) : `${rv} ${DISPLAY_UNIT_LABELS[realUnit]}`;
    const preset: ScalePreset = {
      id: `u-${Date.now()}`,
      label: `${pv} ${paperUnit} = ${real}`,
      paperValue: pv,
      paperUnit,
      realValue: rv,
      realUnit,
      group: 'Custom',
    };
    const next = [...userPresets, preset];
    setUserPresets(next);
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(next));
    } catch {
      setError('The preset could not be saved on this device; it is available only in this session.');
    }
    setMode('preset');
    apply({ preset });
  };

  const pageFilter = scope === 'page' ? currentPageIndex : undefined;
  const totals = useMemo(() => computeMeasureTotals(markups, pageFilter), [markups, pageFilter]);
  const measureMarkups = useMemo(
    () => markups.filter((m) => measureCategoryOf(m) && (pageFilter === undefined || m.pageIndex === pageFilter)),
    [markups, pageFilter]
  );

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
          title="Expand measurements"
          data-testid="expand-measurements-btn"
        >
          <Ruler size={16} />
        </button>
        <span className="text-[10px] text-gray-500 font-medium rotate-90 whitespace-nowrap mt-6">Measure</span>
      </aside>
    );
  }

  const selectedPreset = calib.presetId ? allPresets.find((p) => p.id === calib.presetId) : undefined;

  return (
    <aside
      data-testid="measurements-panel"
      data-collapsed="false"
      className="w-80 bg-cad-panel border-l border-cad-border flex flex-col text-xs select-none min-h-0"
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-cad-border shrink-0">
        <span className="font-semibold text-gray-300 uppercase tracking-wider">Measure</span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-gray-400 hover:text-cad-strong hover:bg-cad-hover rounded transition-colors"
          title="Collapse measurements"
          data-testid="collapse-measurements-btn"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <Section title="Scale" testId="measure-scale-section">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Page {currentPageIndex + 1}</span>
            <span
              data-testid="measurements-scale"
              className={`px-1.5 rounded text-[11px] font-mono ${
                isCalibrated
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              }`}
            >
              {isCalibrated ? describeCalibration(calib) : `Paper scale (${calib.unit})`}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              data-testid="measure-calibrate-btn"
              disabled={!pdfBytes}
              onClick={() => setActiveTool('calibrate')}
              className="flex-1 py-1.5 rounded border border-cad-border hover:bg-cad-hover disabled:opacity-40"
              title="Draw a known distance on the drawing"
            >
              Calibrate
            </button>
            <button
              type="button"
              data-testid="measure-add-preset-btn"
              disabled={!pdfBytes}
              onClick={addPreset}
              className="flex-1 py-1.5 rounded border border-cad-border hover:bg-cad-hover disabled:opacity-40"
              title="Save the custom scale as a preset"
            >
              Add Preset
            </button>
          </div>
          <div className="flex gap-4">
            {(['preset', 'custom'] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer text-gray-300">
                <input
                  type="radio"
                  name="scale-mode"
                  data-testid={`measure-mode-${m}`}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="accent-cad-accent"
                />
                {m === 'preset' ? 'Preset' : 'Custom'}
              </label>
            ))}
          </div>

          {mode === 'preset' ? (
            <select
              data-testid="measure-preset-select"
              value={selectedPreset?.id ?? ''}
              onChange={(e) => {
                const preset = allPresets.find((p) => p.id === e.target.value);
                if (preset) apply({ preset, display: preset.realUnit === 'mm' ? display : preset.realUnit });
              }}
              disabled={!pdfBytes}
              className={`${inputCls} w-full`}
            >
              <option value="" disabled>
                Select a scale…
              </option>
              {(['Metric', 'Architectural', 'Engineering', 'Custom'] as const).map((g) => {
                const items = allPresets.filter((p) => p.group === g);
                return items.length ? (
                  <optgroup key={g} label={g}>
                    {items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <input
                  data-testid="measure-paper-value"
                  value={paperValue}
                  onChange={(e) => setPaperValue(e.target.value)}
                  onBlur={() => apply()}
                  className={`${inputCls} w-14 text-right`}
                  inputMode="decimal"
                />
                <select
                  data-testid="measure-paper-unit"
                  value={paperUnit}
                  onChange={(e) => {
                    setPaperUnit(e.target.value as PaperUnit);
                    apply({ paperUnit: e.target.value as PaperUnit });
                  }}
                  className={inputCls}
                >
                  {PAPER_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <span className="text-gray-400 px-0.5">=</span>
                <input
                  data-testid="measure-real-value"
                  value={realText}
                  onChange={(e) => setRealText(e.target.value)}
                  onBlur={() => apply()}
                  className={`${inputCls} w-20 text-right`}
                />
                <select
                  data-testid="measure-real-unit"
                  value={realUnit}
                  onChange={(e) => {
                    const u = e.target.value as DisplayUnit;
                    setRealUnit(u);
                    apply({ realUnit: u, display: u });
                  }}
                  className={inputCls}
                >
                  {DISPLAY_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {DISPLAY_UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="measure-separate-y"
                  checked={separateY}
                  onChange={(e) => {
                    setSeparateY(e.target.checked);
                    apply({ separateY: e.target.checked });
                  }}
                  className="accent-cad-accent"
                />
                Separate Y Scale
              </label>
              {separateY && (
                <div className="flex items-center gap-1" data-testid="measure-y-row">
                  <span className="text-gray-500 w-3">Y</span>
                  <input
                    data-testid="measure-y-paper"
                    value={yPaper}
                    onChange={(e) => setYPaper(e.target.value)}
                    onBlur={() => apply()}
                    className={`${inputCls} w-12 text-right`}
                  />
                  <span className="text-gray-400">{paperUnit} =</span>
                  <input
                    data-testid="measure-y-real"
                    value={yRealText}
                    onChange={(e) => setYRealText(e.target.value)}
                    onBlur={() => apply()}
                    className={`${inputCls} w-20 text-right`}
                  />
                  <span className="text-gray-400">{DISPLAY_UNIT_LABELS[realUnit]}</span>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-16">Precision:</span>
            <select
              data-testid="measure-precision"
              value={precision}
              onChange={(e) => {
                setPrecision(e.target.value);
                apply({ precision: e.target.value, ...(mode === 'preset' && selectedPreset ? { preset: selectedPreset } : {}) });
              }}
              className={`${inputCls} flex-1`}
            >
              {precisionOptions(display).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p role="alert" data-testid="measure-scale-error" className="text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <button
            type="button"
            data-testid="measure-apply-all-pages"
            disabled={!pdfBytes || numPages < 2}
            onClick={() =>
              applyCalibrationToPages(
                Array.from({ length: numPages }, (_, i) => i),
                useCalibrationStore.getState().getPageCalibration(currentPageIndex)
              )
            }
            className="w-full py-1 rounded border border-cad-border hover:bg-cad-hover disabled:opacity-40"
          >
            Apply scale to all pages
          </button>
        </Section>

        <Section title="Distance Properties">
          <label className="flex items-center gap-2">
            <span className="text-gray-400 w-16">Label:</span>
            <input
              data-testid="measure-label"
              value={measureLabel}
              onChange={(e) => setMeasureLabel(e.target.value)}
              placeholder="e.g. Wall"
              className={`${inputCls} flex-1`}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-gray-400 w-16">Length:</span>
            <select
              data-testid="measure-length-unit"
              value={display}
              onChange={(e) => {
                const u = e.target.value as DisplayUnit;
                apply({ display: u, ...(mode === 'preset' && selectedPreset ? { preset: selectedPreset } : {}) });
              }}
              disabled={!pdfBytes}
              className={`${inputCls} flex-1`}
            >
              {DISPLAY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {DISPLAY_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-gray-400 w-16">Caption:</span>
            <select
              data-testid="measure-caption"
              value={selectedLength ? captionStyleOf(selectedLength.customFields?.captionStyle) : measureCaption}
              onChange={(e) => {
                const v = e.target.value === 'top' ? 'top' : 'inline';
                if (selectedLength) {
                  updateMarkup(selectedLength.id, { customFields: { ...selectedLength.customFields, captionStyle: v } });
                } else {
                  setMeasureCaption(v);
                }
              }}
              className={`${inputCls} flex-1`}
              title="Where the distance value goes, like Caption Style in Acrobat"
            >
              <option value="inline">Inside the line</option>
              <option value="top">On top of the line</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer" title="Like Acrobat: after the second click, a third click sets how far the line sits from the measured points">
            <input
              type="checkbox"
              data-testid="measure-leaders"
              checked={measureLeaders}
              onChange={(e) => setMeasureLeaders(e.target.checked)}
              className="accent-cad-accent"
            />
            Leader lines (third click sets the offset)
          </label>
        </Section>

        <Section title="Volume Properties">
          <label className="flex items-center gap-2">
            <span className="text-gray-400 w-16">Depth:</span>
            <input
              data-testid="measure-volume-depth"
              type="number"
              min={0}
              step="any"
              value={selectedVolume ? Number(selectedVolume.customFields?.volumeDepth ?? 1) : volumeDepth}
              onChange={(e) => onDepthChange(Number(e.target.value))}
              className={`${inputCls} flex-1`}
            />
            <span className="text-gray-400">{calib.unit}</span>
          </label>
          <p className="text-gray-500 leading-snug">
            {selectedVolume ? 'Depth of the selected volume.' : 'Depth for new Volume measurements.'}
          </p>
        </Section>

        <Section title="Snap" testId="measure-snap-section">
          <div className="flex gap-1">
            {(['endpoint', 'midpoint', 'intersection', 'nearest'] as const).map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`snap-${k}`}
                aria-pressed={snap[k]}
                onClick={() => setSnap({ [k]: !snap[k] })}
                title={SNAP_TITLES[k]}
                className={`p-1.5 rounded border ${
                  snap[k] ? 'border-cad-accent bg-cad-accent/20 text-cad-strong' : 'border-transparent text-gray-400 hover:bg-cad-hover'
                }`}
              >
                <SnapIcon kind={k} />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              data-testid="snap-content"
              checked={snap.content}
              onChange={(e) => setSnap({ content: e.target.checked })}
              className="accent-cad-accent"
            />
            Snap to drawing (lines of the PDF)
          </label>
        </Section>

        <Section title="Settings">
          <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              data-testid="measure-show-results"
              checked={showMeasureLabels}
              onChange={(e) => setShowMeasureLabels(e.target.checked)}
              className="accent-cad-accent"
            />
            Show Result Information
          </label>
          <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              data-testid="measure-show-rulers"
              checked={showRulers}
              onChange={(e) => setShowRulers(e.target.checked)}
              className="accent-cad-accent"
            />
            Rulers (Ctrl+R)
          </label>
        </Section>

        <Section title="Totals">
          <div className="flex items-center justify-end">
            <div className="flex rounded border border-cad-border overflow-hidden text-[11px]">
              {(['page', 'document'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`measurements-scope-${s}`}
                  onClick={() => setScope(s)}
                  className={`px-2 py-0.5 ${scope === s ? 'bg-cad-accent text-white' : 'hover:bg-cad-hover'}`}
                >
                  {s === 'page' ? 'Page' : 'Document'}
                </button>
              ))}
            </div>
          </div>
          {totals.length === 0 ? (
            <p data-testid="measurements-empty" className="text-gray-500 leading-relaxed">
              No measurements {scope === 'page' ? 'on this page' : 'in the document'}. Use Length, Area or Count
              on the ribbon (Measure group).
            </p>
          ) : (
            <table data-testid="measurements-totals" className="w-full border-collapse">
              <thead>
                <tr className="text-gray-500 text-[10px] uppercase">
                  <th className="text-left font-medium pb-1">Type</th>
                  <th className="text-right font-medium pb-1">Qty</th>
                  <th className="text-right font-medium pb-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <React.Fragment key={`${t.category}-${t.unit}`}>
                    <tr className="border-t border-cad-border" data-testid={`measurements-total-${t.category}`}>
                      <td className="py-1 text-gray-200">{CATEGORY_LABEL[t.category]}</td>
                      <td className="py-1 text-right font-mono text-gray-400">{t.items}</td>
                      <td className="py-1 text-right font-mono text-cad-strong">
                        {t.category === 'length' && calib.format === 'ftin' && t.unit === 'ft'
                          ? formatWithCalibration(t.total, calib)
                          : formatTotal(t, 2)}
                      </td>
                    </tr>
                    {t.category === 'area' && t.perimeter !== undefined && (
                      <tr>
                        <td className="pb-1 pl-3 text-gray-500">Perimeter</td>
                        <td />
                        <td className="pb-1 text-right font-mono text-gray-400">
                          {t.perimeter.toFixed(2)} {t.unit}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
          {measureMarkups.length > 0 && (
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
                        {markupTypeLabel(m.type)} · p. {m.pageIndex + 1}
                      </span>
                      <span className="font-mono">{m.measurement?.formatted}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Export">
          <button
            type="button"
            onClick={() => useUiStore.getState().requestExport('csv')}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border border-cad-border hover:bg-cad-hover"
            title="Export the markups list with measurements to CSV (Excel)"
          >
            <FileSpreadsheet size={13} /> Export to CSV
          </button>
        </Section>
      </div>
    </aside>
  );
};
