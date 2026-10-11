import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalibrationModal } from './CalibrationModal';
import { useCalibrationStore } from '../store/useCalibrationStore';

describe('CalibrationModal Component (Paquete 4)', () => {
  beforeEach(() => {
    useCalibrationStore.setState({
      calibrations: {},
      pendingCalibrationPoints: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.1 },
      ], // 0.2 * 1000 = 200 pt
      isCalibrationModalOpen: true,
    });
  });

  const pageSize = { width: 1000, height: 800 };

  it('renderiza inputs de longitud conocida y selector de unidades', () => {
    render(<CalibrationModal pageIndex={0} pageSizePt={pageSize} />);

    expect(screen.getByTestId('calibration-modal')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-length-input')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-unit-select')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-confirm-btn')).toBeInTheDocument();
  });

  it('valida con guarda valores <= 0 o no numéricos mostrando error', () => {
    render(<CalibrationModal pageIndex={0} pageSizePt={pageSize} />);

    const input = screen.getByTestId('calibration-length-input');
    fireEvent.change(input, { target: { value: '-2.5' } });

    const confirmBtn = screen.getByTestId('calibration-confirm-btn');
    fireEvent.click(confirmBtn);

    expect(screen.getByTestId('calibration-error-msg')).toBeInTheDocument();
    expect(useCalibrationStore.getState().calibrations[0]).toBeUndefined();
  });

  it('al confirmar con valor válido calcula la escala y la guarda en useCalibrationStore', () => {
    render(<CalibrationModal pageIndex={0} pageSizePt={pageSize} />);

    const input = screen.getByTestId('calibration-length-input');
    fireEvent.change(input, { target: { value: '10' } });

    const unitSelect = screen.getByTestId('calibration-unit-select');
    fireEvent.change(unitSelect, { target: { value: 'm' } });

    const confirmBtn = screen.getByTestId('calibration-confirm-btn');
    fireEvent.click(confirmBtn);

    const savedCal = useCalibrationStore.getState().getPageCalibration(0);
    // 200 pt = 10 m -> escala = 10 / 200 = 0.05 m/pt
    expect(savedCal.scale).toBeCloseTo(0.05, 4);
    expect(savedCal.unit).toBe('m');
    expect(useCalibrationStore.getState().isCalibrationModalOpen).toBe(false);
  });

  it('al hacer clic en cancelar cierra el modal sin alterar la calibración', () => {
    render(<CalibrationModal pageIndex={0} pageSizePt={pageSize} />);

    const cancelBtn = screen.getByTestId('calibration-cancel-btn');
    fireEvent.click(cancelBtn);

    expect(useCalibrationStore.getState().isCalibrationModalOpen).toBe(false);
    expect(useCalibrationStore.getState().calibrations[0]).toBeUndefined();
  });
});
