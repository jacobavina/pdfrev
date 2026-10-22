import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { PropertiesInspectorPanel } from './PropertiesInspectorPanel';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { Markup } from '../types/markup';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const length: Markup = {
  id: 'len',
  type: 'length',
  pageIndex: 0,
  points: [{ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.5 }],
  style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
  text: '17.1 ft',
  measurement: { value: 17.1, unit: 'ft', formatted: '17.1 ft' },
  customFields: { captionStyle: 'inline' },
  author: 'Reviewer',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
};

describe('Separar el texto de la flecha en Length y Dimension (ADR-0097)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [length], selectedMarkupIds: ['len'] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
    useUiStore.setState({ hiddenLayers: [], snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false } });
    useToolStore.setState({ activeTool: 'select' });
  });

  it('arrastrar el tirador del texto lo separa de la línea y un solo deshacer lo devuelve a su sitio', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    const handle = screen.getByTestId('caption-handle');
    const hx = Number(handle.getAttribute('x')) + 4;
    const hy = Number(handle.getAttribute('y')) + 4;
    act(() => {
      fireEvent.mouseDown(handle, { button: 0, clientX: hx, clientY: hy });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: hx + 60, clientY: hy - 40 });
    });
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: hx + 60, clientY: hy - 40 });
    });
    const m = useMarkupStore.getState().markups[0];
    expect(m.customFields?.captionOffsetX).toBeCloseTo(60, 0);
    expect(m.customFields?.captionOffsetY).toBeCloseTo(40, 0);
    // La medida no cambia: solo se movió el texto
    expect(m.points).toEqual(length.points);
    expect(m.text).toBe('17.1 ft');
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].customFields?.captionOffsetX ?? 0).toBe(0);
  });

  it('el panel de propiedades permite escribir el desplazamiento y restablecerlo', () => {
    render(<PropertiesInspectorPanel />);
    fireEvent.change(screen.getByTestId('prop-caption-along'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('prop-caption-up'), { target: { value: '9' } });
    expect(useMarkupStore.getState().markups[0].customFields).toMatchObject({ captionOffsetX: 12, captionOffsetY: 9 });
    fireEvent.click(screen.getByTestId('prop-caption-reset'));
    expect(useMarkupStore.getState().markups[0].customFields).toMatchObject({ captionOffsetX: 0, captionOffsetY: 0 });
  });
});
