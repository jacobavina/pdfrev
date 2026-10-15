import React, { useState } from 'react';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import {
  buildCalibration,
  convertLength,
  describeCalibration,
  DisplayUnit,
  DISPLAY_UNITS,
  DISPLAY_UNIT_LABELS,
  displayUnitOf,
  parseFeetInches,
  precisionOptions,
} from '../core/measurements/scale';

interface CalibrationModalProps {
  pageIndex: number;
  pageSizePt: { width: number; height: number };
}

const LAST_UNIT_KEY = 'rea-calibrate-unit';

function readLastUnit(): DisplayUnit | null {
  try {
    const u = localStorage.getItem(LAST_UNIT_KEY);
    return u && (DISPLAY_UNITS as string[]).includes(u) ? (u as DisplayUnit) : null;
  } catch {
    return null;
  }
}

function rememberUnit(u: DisplayUnit) {
  try {
    localStorage.setItem(LAST_UNIT_KEY, u);
  } catch {
    // Preferencia no persistible: se aplica solo en esta sesión
  }
}

const defaultPrecision = (u: DisplayUnit) => (u === 'ftin' || u === 'in' ? 'f16' : 'd2');

/**
 * Calibración por dos puntos (ADR-0031), como Calibrate de Revu: se marca una distancia conocida en el plano (con
 * snap) y aquí se escribe cuánto mide en realidad. Acepta pies-pulgadas (140' o 140'-6 1/2") y puede aplicarse a
 * todas las páginas.
 */
export const CalibrationModal: React.FC<CalibrationModalProps> = ({ pageIndex, pageSizePt }) => {
  const {
    isCalibrationModalOpen,
    pendingCalibrationPoints,
    setCalibrationModalOpen,
    setPendingCalibrationPoints,
    setPageCalibration,
    applyCalibrationToPages,
    calibrations,
  } = useCalibrationStore();
  const numPages = useDocumentStore((s) => s.numPages);

  const current = calibrations[pageIndex];
  const initialUnit: DisplayUnit = current ? displayUnitOf(current) : readLastUnit() ?? 'm';
  const [realText, setRealText] = useState<string>('10');
  const [unit, setUnit] = useState<DisplayUnit>(initialUnit);
  const [precision, setPrecision] = useState<string>(defaultPrecision(initialUnit));
  const [allPages, setAllPages] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isCalibrationModalOpen) return null;

  const close = () => {
    setErrorMessage(null);
    setPendingCalibrationPoints([]);
    setCalibrationModalOpen(false);
  };

  const hasPoints = pendingCalibrationPoints.length >= 2;
  let ptDistance = 0;
  if (hasPoints) {
    const [p1, p2] = pendingCalibrationPoints;
    ptDistance = Math.hypot((p2.x - p1.x) * pageSizePt.width, (p2.y - p1.y) * pageSizePt.height);
  }

  const handleConfirm = () => {
    const value = unit === 'ftin' || unit === 'ft' ? parseFeetInches(realText) : Number(realText);
    if (!Number.isFinite(value) || value <= 0) {
      setErrorMessage(unit === 'ftin' ? "Enter a positive length, e.g. 140' or 12'-6\"." : 'Please enter a valid length greater than zero.');
      return;
    }
    if (!(ptDistance > 0)) {
      setErrorMessage('The two points are too close together. Pick them again.');
      return;
    }
    // Se guarda como relación legible "1 in = …" (imperial) o "1 cm = …" (métrico), como la muestra Revu
    const paperUnit = unit === 'in' || unit === 'ft' || unit === 'ftin' ? 'in' : 'cm';
    const cal = buildCalibration({
      paperValue: 1,
      paperUnit,
      realValue: value / convertLength(ptDistance, 'pt', paperUnit),
      realUnit: unit,
      display: unit,
      precision: precisionOptions(unit).some((o) => o.value === precision) ? precision : defaultPrecision(unit),
    });
    if (!cal) {
      setErrorMessage('Please enter a valid length greater than zero.');
      return;
    }
    rememberUnit(unit);
    if (allPages && numPages > 1) {
      applyCalibrationToPages(
        Array.from({ length: numPages }, (_, i) => i),
        cal
      );
    } else {
      setPageCalibration(pageIndex, cal);
    }
    close();
  };

  const pickPoints = () => {
    close();
    useToolStore.getState().setActiveTool('calibrate');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]" data-testid="calibration-modal">
      <div className="w-[400px] rounded-xl bg-cad-panel border border-cad-border p-5 shadow-[0_24px_64px_rgba(0,0,0,0.38)] text-[12px] text-gray-200">
        <h3 className="mb-3 text-[14px] font-semibold text-cad-strong">Calibrate Page Scale ({pageIndex + 1})</h3>

        {!hasPoints ? (
          <>
            <p className="mb-4 text-[12px] text-gray-400" data-testid="calibration-no-points">
              Click the start and the end of a known distance on the drawing. Snap helps you land exactly on its
              extension lines.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="ui-btn"
                data-testid="calibration-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={pickPoints}
                className="ui-btn ui-btn-primary"
                data-testid="calibration-pick-points"
              >
                Pick two points
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-[12px] text-gray-400" data-testid="calibration-measured">
              Distance on the drawing: <strong>{ptDistance.toFixed(2)} pt</strong>
              {current && (
                <>
                  {' '}
                  (currently {describeCalibration(current)})
                </>
              )}
            </p>

            <div className="mb-4 space-y-3">
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="mb-1 block text-[11.5px] text-gray-400">Known distance</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={realText}
                    onChange={(e) => {
                      setRealText(e.target.value);
                      setErrorMessage(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirm();
                    }}
                    className="w-full ui-input"
                    data-testid="calibration-length-input"
                    placeholder={unit === 'ftin' ? "e.g. 140' or 12'-6\"" : 'e.g. 10.0'}
                    autoFocus
                  />
                </label>
                <label className="w-36">
                  <span className="mb-1 block text-[11.5px] text-gray-400">Unit</span>
                  <select
                    value={unit}
                    onChange={(e) => {
                      const u = e.target.value as DisplayUnit;
                      setUnit(u);
                      if (!precisionOptions(u).some((o) => o.value === precision)) setPrecision(defaultPrecision(u));
                    }}
                    className="w-full ui-input"
                    data-testid="calibration-unit-select"
                  >
                    {DISPLAY_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {DISPLAY_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11.5px] text-gray-400">Precision</span>
                <select
                  value={precision}
                  onChange={(e) => setPrecision(e.target.value)}
                  className="w-full ui-input"
                  data-testid="calibration-precision-select"
                >
                  {precisionOptions(unit).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {numPages > 1 && (
                <label className="flex items-center gap-2 text-[12px] text-gray-300">
                  <input
                    type="checkbox"
                    checked={allPages}
                    onChange={(e) => setAllPages(e.target.checked)}
                    data-testid="calibration-apply-all"
                  />
                  Apply to all pages
                </label>
              )}
            </div>

            {errorMessage && (
              <div className="mb-4 text-xs font-semibold text-red-600 dark:text-red-400" role="alert" data-testid="calibration-error-msg">
                {errorMessage}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="ui-btn"
                data-testid="calibration-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="ui-btn ui-btn-primary"
                data-testid="calibration-confirm-btn"
              >
                Calibrate
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
