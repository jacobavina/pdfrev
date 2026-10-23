import React, { useEffect, useState } from 'react';
import { Ruler, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useToolStore } from '../../store/useToolStore';
import { SKETCH_SHAPES, MAX_POLYGON_SIDES, MIN_POLYGON_SIDES, sketchProblem, sketchToScale, type SketchShape, type SketchSpec } from '../../core/markup/sketchToScale';
import { showToast } from '../../services/toastService';

/**
 * Sketch to Scale (ADR-0128): crea una forma con medidas reales, en las unidades de la escala de la página, centrada en la
 * hoja actual. Después se mueve como cualquier marca.
 */
export const SketchToScaleDialog: React.FC = () => {
  const open = useUiStore((s) => s.sketchScaleOpen);
  const close = useUiStore((s) => s.setSketchScaleOpen);
  const page = useDocumentStore((s) => s.currentPageIndex);
  const calib = useCalibrationStore((s) => s.calibrations[page]);
  const unit = calib?.unit ?? 'mm';

  const [shape, setShape] = useState<SketchShape>('rectangle');
  const [width, setWidth] = useState('4');
  const [height, setHeight] = useState('3');
  const [angle, setAngle] = useState('0');
  const [sides, setSides] = useState('6');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const spec: SketchSpec = {
    shape,
    width: Number(width),
    height: shape === 'circle' && height.trim() === '' ? Number(width) : Number(height),
    angle: Number(angle),
    sides: Number(sides),
  };
  const problem = sketchProblem(spec);

  const apply = () => {
    if (problem) return;
    const { pageDimensions, scale } = useDocumentStore.getState();
    const dim = pageDimensions[page];
    if (!dim) {
      showToast('The page is not ready yet.');
      return;
    }
    // pageDimensions guarda el tamaño de la página a la escala de la vista: aquí se necesita en puntos PDF
    const dims = { width: dim.width / (scale || 1), height: dim.height / (scale || 1) };
    const tool = useToolStore.getState();
    const center = { x: 0.5, y: 0.5 };
    const result = sketchToScale(spec, {
      pageIndex: page,
      center,
      calibration: useCalibrationStore.getState().getEffectiveCalibration(page, [center]),
      dims,
      style: tool.currentStyle,
      author: tool.author,
      layer: tool.activeLayer,
    });
    if (!result.ok) {
      showToast(result.reason);
      return;
    }
    const store = useMarkupStore.getState();
    store.addMarkups([result.markup], 'Sketch to Scale');
    store.setSelectedMarkupIds([result.markup.id]);
    close(false);
    showToast('Drawn in the middle of the page. Drag it into place.');
  };

  const field = (label: string, value: string, set: (v: string) => void, testId: string, suffix?: string, min = 0) => (
    <label className="flex items-center gap-2">
      <span className="w-28 text-gray-400">{label}</span>
      <input type="number" min={min} step="any" data-testid={testId} value={value} onChange={(e) => set(e.target.value)} className="ui-input w-24" />
      {suffix && <span className="text-gray-500">{suffix}</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={() => close(false)}>
      <div
        role="dialog"
        aria-label="Sketch to scale"
        data-testid="sketch-dialog"
        className="w-[400px] max-w-[94vw] bg-cad-panel border border-cad-border rounded-xl shadow-float text-xs text-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Enter' && !problem && apply()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-cad-border">
          <Ruler size={18} className="text-gray-400" />
          <span className="font-semibold text-cad-strong text-base">Sketch to scale</span>
          <button onClick={() => close(false)} title="Close" className="ml-auto p-1 rounded hover:bg-cad-hover">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-gray-400">Draws a shape with exact real-world measurements, using the scale of this page.</p>
          {!calib && (
            <p className="text-amber-400" data-testid="sketch-uncalibrated">
              This page has no scale yet: the measurements are paper millimetres.
            </p>
          )}
          <label className="flex items-center gap-2">
            <span className="w-28 text-gray-400">Shape</span>
            <select data-testid="sketch-shape" value={shape} onChange={(e) => setShape(e.target.value as SketchShape)} className="ui-input">
              {SKETCH_SHAPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {(shape === 'rectangle' || shape === 'circle') && (
            <>
              {field('Width', width, setWidth, 'sketch-width', unit)}
              {field('Height', height, setHeight, 'sketch-height', unit)}
            </>
          )}
          {shape === 'line' && (
            <>
              {field('Length', width, setWidth, 'sketch-width', unit)}
              {field('Angle', angle, setAngle, 'sketch-angle', 'degrees', -360)}
            </>
          )}
          {shape === 'polygon' && (
            <>
              {field('Side length', width, setWidth, 'sketch-width', unit)}
              {field('Sides', sides, setSides, 'sketch-sides', `${MIN_POLYGON_SIDES}–${MAX_POLYGON_SIDES}`, MIN_POLYGON_SIDES)}
            </>
          )}
          {problem && (
            <p className="text-amber-400" data-testid="sketch-problem">
              {problem}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border">
          <button type="button" className="ui-btn !px-3" onClick={() => close(false)}>
            Cancel
          </button>
          <button type="button" data-testid="sketch-apply" disabled={!!problem} className="ui-btn ui-btn-primary !px-3 disabled:opacity-40" onClick={apply}>
            Draw
          </button>
        </div>
      </div>
    </div>
  );
};
