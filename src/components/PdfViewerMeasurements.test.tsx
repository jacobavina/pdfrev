import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';

// Mock de renderPageToCanvas para entorno jsdom
vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    hasText: true,
  }),
}));

describe('PdfViewer - Calibración e Indicador de Escala (Paquete 4)', () => {
  beforeEach(() => {
    useMarkupStore.setState({
      markups: [],
      selectedMarkupIds: [],
    });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as any,
    });
    useCalibrationStore.setState({
      calibrations: {},
    });
    useToolStore.setState({
      activeTool: 'select',
    });
  });

  it('muestra el indicador de calibración en estado sin calibrar por defecto', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });

    const indicator = screen.getByTestId('calibration-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent('Sin calibrar (1 pt = 1 pt)');
  });

  it('abre el modal de calibración al pulsar sobre el indicador', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });

    const indicator = screen.getByTestId('calibration-indicator');
    await act(async () => {
      fireEvent.click(indicator);
    });

    expect(screen.getByTestId('calibration-modal')).toBeInTheDocument();
  });

  it('actualiza reactivamente el texto del indicador cuando la página se calibra', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });

    const indicator = screen.getByTestId('calibration-indicator');
    expect(indicator).toHaveTextContent('Sin calibrar (1 pt = 1 pt)');

    // Calibrar página 0: 1 metro = 50 puntos (scale = 1/50 = 0.02)
    act(() => {
      useCalibrationStore.getState().setPageCalibration(0, {
        scale: 0.02,
        unit: 'm',
        precision: 2,
      });
    });

    expect(indicator).toHaveTextContent('Escala: 1 m = 50.0 pt');
  });
});
