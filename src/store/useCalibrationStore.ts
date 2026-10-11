import { create } from 'zustand';
import { PageCalibration, MarkupPoint, MeasurementUnit } from '../types/markup';
import { DEFAULT_PAGE_CALIBRATION } from '../core/measurements/calculate';

interface CalibrationState {
  calibrations: Record<number, PageCalibration>;
  pendingCalibrationPoints: MarkupPoint[];
  isCalibrationModalOpen: boolean;

  setPageCalibration: (pageIndex: number, calibration: PageCalibration) => void;
  getPageCalibration: (pageIndex: number) => PageCalibration;
  clearCalibration: (pageIndex: number) => void;
  setPendingCalibrationPoints: (points: MarkupPoint[]) => void;
  setCalibrationModalOpen: (open: boolean) => void;
  calibrateFromPoints: (
    pageIndex: number,
    ptDistance: number,
    realLength: number,
    unit: MeasurementUnit,
    precision?: number
  ) => void;
}

export const useCalibrationStore = create<CalibrationState>((set, get) => ({
  calibrations: {},
  pendingCalibrationPoints: [],
  isCalibrationModalOpen: false,

  setPageCalibration: (pageIndex, calibration) => {
    // Guardas estrictas contra valores no numéricos o menores o iguales a 0
    if (!Number.isFinite(calibration.scale) || calibration.scale <= 0) {
      console.warn('[Calibration] Escala inválida rechazada:', calibration.scale);
      return;
    }
    set((state) => ({
      calibrations: {
        ...state.calibrations,
        [pageIndex]: { ...calibration },
      },
    }));
  },

  getPageCalibration: (pageIndex) => {
    return get().calibrations[pageIndex] ?? { ...DEFAULT_PAGE_CALIBRATION };
  },

  clearCalibration: (pageIndex) => {
    set((state) => {
      const next = { ...state.calibrations };
      delete next[pageIndex];
      return { calibrations: next };
    });
  },

  setPendingCalibrationPoints: (points) => {
    set({ pendingCalibrationPoints: points });
  },

  setCalibrationModalOpen: (open) => {
    set({ isCalibrationModalOpen: open });
  },

  calibrateFromPoints: (pageIndex, ptDistance, realLength, unit, precision = 2) => {
    if (!Number.isFinite(ptDistance) || ptDistance <= 0) {
      console.warn('[Calibration] ptDistance debe ser un número positivo');
      return;
    }
    if (!Number.isFinite(realLength) || realLength <= 0) {
      console.warn('[Calibration] realLength debe ser un número positivo');
      return;
    }

    const scale = realLength / ptDistance;
    const calibration: PageCalibration = {
      scale,
      unit,
      precision,
      rawInputLength: realLength,
      rawInputUnit: unit,
      ptDistance,
    };

    get().setPageCalibration(pageIndex, calibration);
    set({
      pendingCalibrationPoints: [],
      isCalibrationModalOpen: false,
    });
  },
}));
