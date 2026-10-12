import React, { useState } from 'react';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { MeasurementUnit, VALID_MEASUREMENT_UNITS } from '../types/markup';

interface CalibrationModalProps {
  pageIndex: number;
  pageSizePt: { width: number; height: number };
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  pageIndex,
  pageSizePt,
}) => {
  const {
    isCalibrationModalOpen,
    pendingCalibrationPoints,
    setCalibrationModalOpen,
    calibrateFromPoints,
    setPageCalibration,
  } = useCalibrationStore();

  const [realLengthStr, setRealLengthStr] = useState<string>('10');
  const [unit, setUnit] = useState<MeasurementUnit>('m');
  const [precision, setPrecision] = useState<number>(2);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isCalibrationModalOpen) return null;

  // Si hay 2 puntos pendientes, calcular la distancia en puntos PDF
  let ptDistance = 100;
  if (pendingCalibrationPoints.length >= 2) {
    const p1 = pendingCalibrationPoints[0];
    const p2 = pendingCalibrationPoints[1];
    const dx = (p2.x - p1.x) * pageSizePt.width;
    const dy = (p2.y - p1.y) * pageSizePt.height;
    ptDistance = Math.hypot(dx, dy);
  }

  const handleConfirm = () => {
    const parsedLength = parseFloat(realLengthStr);
    if (!Number.isFinite(parsedLength) || parsedLength <= 0) {
      setErrorMessage('Please enter a valid length greater than zero.');
      return;
    }

    if (pendingCalibrationPoints.length >= 2) {
      calibrateFromPoints(pageIndex, ptDistance, parsedLength, unit, precision);
    } else {
      // Calibración directa
      const scale = parsedLength / ptDistance;
      setPageCalibration(pageIndex, {
        scale,
        unit,
        precision,
        rawInputLength: parsedLength,
        rawInputUnit: unit,
        ptDistance,
      });
      setCalibrationModalOpen(false);
    }
  };

  const handleCancel = () => {
    setErrorMessage(null);
    setCalibrationModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="calibration-modal"
    >
      <div className="w-96 rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
          Calibrate Page Scale ({pageIndex + 1})
        </h3>

        {pendingCalibrationPoints.length >= 2 && (
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Distance measured on the drawing: <strong>{ptDistance.toFixed(2)} pt</strong>
          </p>
        )}

        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Known real length
            </label>
            <input
              type="number"
              step="any"
              min="0.0001"
              value={realLengthStr}
              onChange={(e) => {
                setRealLengthStr(e.target.value);
                setErrorMessage(null);
              }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-cad-strong"
              data-testid="calibration-length-input"
              placeholder="e.g. 10.0"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Unit
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-cad-strong"
              data-testid="calibration-unit-select"
            >
              {VALID_MEASUREMENT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Precision
            </label>
            <select
              value={precision}
              onChange={(e) => setPrecision(parseInt(e.target.value, 10))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-cad-strong"
              data-testid="calibration-precision-select"
            >
              <option value={1}>1 decimal (0.0)</option>
              <option value={2}>2 decimals (0.00)</option>
              <option value={3}>3 decimals (0.000)</option>
              <option value={4}>4 decimals (0.0000)</option>
            </select>
          </div>
        </div>

        {errorMessage && (
          <div
            className="mb-4 text-xs font-semibold text-red-600 dark:text-red-400"
            role="alert"
            data-testid="calibration-error-msg"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            data-testid="calibration-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            data-testid="calibration-confirm-btn"
          >
            Calibrate
          </button>
        </div>
      </div>
    </div>
  );
};
