import { describe, it, expect, beforeEach } from 'vitest';
import { useCalibrationStore } from './useCalibrationStore';
import { DEFAULT_PAGE_CALIBRATION } from '../core/measurements/calculate';

describe('useCalibrationStore', () => {
  beforeEach(() => {
    useCalibrationStore.setState({
      calibrations: {},
      pendingCalibrationPoints: [],
      isCalibrationModalOpen: false,
    });
  });

  it('retorna DEFAULT_PAGE_CALIBRATION si la página no está calibrada', () => {
    const cal = useCalibrationStore.getState().getPageCalibration(0);
    expect(cal.scale).toBe(DEFAULT_PAGE_CALIBRATION.scale);
    expect(cal.unit).toBe(DEFAULT_PAGE_CALIBRATION.unit);
  });

  it('establece y recupera calibración por página independientemente', () => {
    useCalibrationStore.getState().setPageCalibration(0, {
      scale: 0.02,
      unit: 'm',
      precision: 3,
    });

    useCalibrationStore.getState().setPageCalibration(1, {
      scale: 2.54,
      unit: 'cm',
      precision: 2,
    });

    const cal0 = useCalibrationStore.getState().getPageCalibration(0);
    const cal1 = useCalibrationStore.getState().getPageCalibration(1);

    expect(cal0.scale).toBe(0.02);
    expect(cal0.unit).toBe('m');
    expect(cal1.scale).toBe(2.54);
    expect(cal1.unit).toBe('cm');
  });

  it('rechaza con guardas valores inválidos (0, negativos, NaN)', () => {
    useCalibrationStore.getState().setPageCalibration(0, {
      scale: 0,
      unit: 'm',
    });
    expect(useCalibrationStore.getState().calibrations[0]).toBeUndefined();

    useCalibrationStore.getState().setPageCalibration(0, {
      scale: -5,
      unit: 'm',
    });
    expect(useCalibrationStore.getState().calibrations[0]).toBeUndefined();

    useCalibrationStore.getState().setPageCalibration(0, {
      scale: NaN,
      unit: 'm',
    });
    expect(useCalibrationStore.getState().calibrations[0]).toBeUndefined();
  });

  it('calibrateFromPoints calcula la escala correcta y cierra el modal', () => {
    useCalibrationStore.setState({ isCalibrationModalOpen: true });

    // Distancia en PDF = 200 pt, longitud real = 10 m -> escala = 10 / 200 = 0.05 m/pt
    useCalibrationStore.getState().calibrateFromPoints(0, 200, 10, 'm', 2);

    const cal = useCalibrationStore.getState().getPageCalibration(0);
    expect(cal.scale).toBe(0.05);
    expect(cal.unit).toBe('m');
    expect(cal.rawInputLength).toBe(10);
    expect(cal.ptDistance).toBe(200);
    expect(useCalibrationStore.getState().isCalibrationModalOpen).toBe(false);
  });

  it('clearCalibration elimina la calibración de la página', () => {
    useCalibrationStore.getState().setPageCalibration(0, { scale: 0.01, unit: 'm' });
    expect(useCalibrationStore.getState().calibrations[0]).toBeDefined();

    useCalibrationStore.getState().clearCalibration(0);
    expect(useCalibrationStore.getState().calibrations[0]).toBeUndefined();
  });
});
