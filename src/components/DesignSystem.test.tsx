import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PropertiesInspectorPanel } from './PropertiesInspectorPanel';
import { MeasurementsPanel } from './shell/MeasurementsPanel';
import { CalibrationModal } from './CalibrationModal';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { Markup } from '../types/markup';

const rect: Markup = {
  id: 'r-ds',
  type: 'rectangle',
  pageIndex: 0,
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.3, y: 0.3 },
  ],
  style: { strokeColor: '#0284c7', fillColor: 'rgba(2, 132, 199, 0.15)', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
};

describe('Sistema visual de herramienta de diseño (ADR-0036)', () => {
  beforeEach(() => {
    useDocumentStore.setState({ currentPageIndex: 0, numPages: 1, pdfBytes: new Uint8Array([1]) });
    useCalibrationStore.setState({ calibrations: {}, pendingCalibrationPoints: [], isCalibrationModalOpen: false });
  });

  it('inspector en filas de etiqueta y control con colores legibles (hex y opacidad, no rgba crudo)', () => {
    useMarkupStore.setState({ markups: [rect], selectedMarkupIds: ['r-ds'] });
    render(<PropertiesInspectorPanel defaultCollapsed={false} />);
    const panel = screen.getByTestId('properties-inspector-panel');
    // Desde ADR-0064 el estilo es la sección de estilo (colores como selector y muestras) y las filas de etiqueta y
    // control quedan para los datos de revisión
    expect(panel).toContainElement(screen.getByTestId('properties-style'));
    expect(panel.querySelectorAll('.ui-row').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId('prop-stroke-color')).toHaveValue('#0284c7');
    expect(screen.getByTestId('prop-fill-color')).toHaveValue('#0284c7');
    expect(panel).not.toHaveTextContent('rgba(');
    // Campos con el estilo común
    expect(screen.getByTestId('prop-author')).toHaveClass('ui-input');
    expect(screen.getByTestId('selection-count-badge')).toHaveClass('ui-badge');
  });

  it('el panel Measure usa filas, campos y botones del sistema (Calibrate es la acción principal)', () => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    render(<MeasurementsPanel defaultCollapsed={false} />);
    expect(screen.getByTestId('measure-calibrate-btn')).toHaveClass('ui-btn-primary');
    expect(screen.getByTestId('measure-add-preset-btn')).toHaveClass('ui-btn-secondary');
    expect(screen.getByTestId('measure-label')).toHaveClass('ui-input');
    expect(screen.getByTestId('measurements-panel').querySelectorAll('.ui-row').length).toBeGreaterThanOrEqual(4);
  });

  it('el diálogo de calibración comparte superficie, campos y botones', () => {
    useCalibrationStore.setState({
      pendingCalibrationPoints: [
        { x: 0.1, y: 0.5 },
        { x: 0.3, y: 0.5 },
      ],
      isCalibrationModalOpen: true,
    });
    render(<CalibrationModal pageIndex={0} pageSizePt={{ width: 800, height: 600 }} />);
    expect(screen.getByTestId('calibration-length-input')).toHaveClass('ui-input');
    expect(screen.getByTestId('calibration-confirm-btn')).toHaveClass('ui-btn-primary');
    expect(screen.getByTestId('calibration-cancel-btn')).toHaveClass('ui-btn');
  });
});
