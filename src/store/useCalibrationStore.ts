import { create } from 'zustand';
import { PageCalibration, MarkupPoint, MeasurementUnit, MeasurementViewport } from '../types/markup';
import { DEFAULT_PAGE_CALIBRATION } from '../core/measurements/calculate';
import { getEffectiveCalibrationForPoints } from '../core/measurements/viewports';

interface CalibrationState {
  calibrations: Record<number, PageCalibration>;
  /** Escalas leídas del PDF al abrirlo (ADR-0025): al guardar solo se reescriben las páginas que cambien. */
  importedCalibrations: Record<number, PageCalibration>;
  /** Sustituye todas las escalas por las del documento recién abierto. */
  loadDocumentCalibrations: (calibrations: Record<number, PageCalibration>) => void;
  /** Escalas definidas o cambiadas por el usuario desde que se abrió el PDF. */
  changedCalibrations: () => Record<number, PageCalibration>;

  /** Viewports de medición por página (ADR-0076): cada viewport tiene su propia escala. */
  viewports: Record<number, MeasurementViewport[]>;
  importedViewports: Record<number, MeasurementViewport[]>;
  loadDocumentViewports: (viewports: Record<number, MeasurementViewport[]>) => void;
  changedViewports: () => Record<number, MeasurementViewport[]>;
  getViewports: (pageIndex: number) => MeasurementViewport[];
  addViewport: (viewport: MeasurementViewport) => void;
  updateViewport: (pageIndex: number, vpId: string, patch: Partial<MeasurementViewport>) => void;
  removeViewport: (pageIndex: number, vpId: string) => void;
  getEffectiveCalibration: (pageIndex: number, points?: MarkupPoint[]) => PageCalibration;

  pendingCalibrationPoints: MarkupPoint[];
  isCalibrationModalOpen: boolean;

  setPageCalibration: (pageIndex: number, calibration: PageCalibration) => void;
  getPageCalibration: (pageIndex: number) => PageCalibration;
  clearCalibration: (pageIndex: number) => void;
  /** Aplica la misma escala a varias páginas ("Add scale to more pages" de Revu). */
  applyCalibrationToPages: (pageIndices: number[], calibration: PageCalibration) => void;
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
  importedCalibrations: {},

  loadDocumentCalibrations: (calibrations) =>
    set({ calibrations: { ...calibrations }, importedCalibrations: { ...calibrations } }),

  changedCalibrations: () => {
    const { calibrations, importedCalibrations } = get();
    const out: Record<number, PageCalibration> = {};
    for (const [k, cal] of Object.entries(calibrations)) {
      const before = importedCalibrations[Number(k)];
      if (!before || JSON.stringify(before) !== JSON.stringify(cal)) out[Number(k)] = cal;
    }
    return out;
  },

  viewports: {},
  importedViewports: {},

  loadDocumentViewports: (viewports) =>
    set({ viewports: { ...viewports }, importedViewports: { ...viewports } }),

  changedViewports: () => {
    const { viewports, importedViewports } = get();
    const out: Record<number, MeasurementViewport[]> = {};
    for (const [k, vps] of Object.entries(viewports)) {
      const before = importedViewports[Number(k)];
      if (!before || JSON.stringify(before) !== JSON.stringify(vps)) out[Number(k)] = vps;
    }
    return out;
  },

  getViewports: (pageIndex) => get().viewports[pageIndex] ?? [],

  addViewport: (vp) => {
    set((state) => {
      const p = vp.pageIndex;
      const list = state.viewports[p] ? [...state.viewports[p], vp] : [vp];
      return {
        viewports: { ...state.viewports, [p]: list },
      };
    });
  },

  updateViewport: (pageIndex, vpId, patch) => {
    set((state) => {
      const list = state.viewports[pageIndex] ?? [];
      const next = list.map((v) => (v.id === vpId ? { ...v, ...patch } : v));
      return {
        viewports: { ...state.viewports, [pageIndex]: next },
      };
    });
  },

  removeViewport: (pageIndex, vpId) => {
    set((state) => {
      const list = state.viewports[pageIndex] ?? [];
      const next = list.filter((v) => v.id !== vpId);
      const updated = { ...state.viewports };
      if (next.length === 0) {
        delete updated[pageIndex];
      } else {
        updated[pageIndex] = next;
      }
      return { viewports: updated };
    });
  },

  getEffectiveCalibration: (pageIndex, points) => {
    const pageCalib = get().getPageCalibration(pageIndex);
    const vps = get().viewports[pageIndex];
    return getEffectiveCalibrationForPoints(pageCalib, points, vps);
  },
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

  applyCalibrationToPages: (pageIndices, calibration) => {
    if (!Number.isFinite(calibration.scale) || calibration.scale <= 0) return;
    set((state) => {
      const next = { ...state.calibrations };
      for (const i of pageIndices) next[i] = { ...calibration };
      return { calibrations: next };
    });
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
