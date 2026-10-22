import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { StyleSection } from './shell/StyleSection';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { DEFAULT_SEQUENCE } from '../core/markup/sequences';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const click = (svg: Element, x: number, y: number) => {
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
  });
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
  });
};

describe('Secuencias numeradas de marcadores (ADR-0094)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
    useUiStore.setState({ hiddenLayers: [], snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false } });
    useToolStore.setState({
      activeTool: 'sequence',
      sequence: { ...DEFAULT_SEQUENCE },
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    });
  });

  it('cada clic coloca el siguiente número como cuadro de texto y la secuencia sigue entre clics', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    click(svg, 100, 100);
    click(svg, 300, 100);
    click(svg, 500, 100);
    const texts = useMarkupStore.getState().markups.map((m) => m.text);
    expect(texts).toEqual(['1', '2', '3']);
    const [first] = useMarkupStore.getState().markups;
    expect(first).toMatchObject({ type: 'text', subject: 'Sequence', textFormat: { align: 'center' } });
    expect(first.customFields?.sequenceIndex).toBe(1);
    expect(useToolStore.getState().sequence.next).toBe(4);
  });

  it('la barra define formato, prefijo, sufijo y siguiente número, y el marcador los usa', async () => {
    await act(async () => {
      render(
        <>
          <PdfViewer />
          <StyleSection />
        </>
      );
    });
    fireEvent.change(screen.getByTestId('ribbon-sequence-format'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('ribbon-sequence-prefix'), { target: { value: 'P-' } });
    fireEvent.change(screen.getByTestId('ribbon-sequence-next'), { target: { value: '3' } });
    expect(screen.getByTestId('ribbon-sequence-preview')).toHaveTextContent('P-C');
    const svg = screen.getByTestId('markup-overlay-svg');
    click(svg, 200, 200);
    click(svg, 400, 200);
    expect(useMarkupStore.getState().markups.map((m) => m.text)).toEqual(['P-C', 'P-D']);
    // El siguiente número se puede volver a poner a 1
    fireEvent.change(screen.getByTestId('ribbon-sequence-next'), { target: { value: '1' } });
    expect(screen.getByTestId('ribbon-sequence-preview')).toHaveTextContent('P-A');
  });
});
