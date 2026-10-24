import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { MenuBar } from './shell/MenuBar';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const key = (init: KeyboardEventInit & { key: string }) =>
  act(() => {
    fireEvent.keyDown(window, init);
  });

describe('Atajo del hipervínculo (ADR-0131)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1, 2, 3]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {} });
    useToolStore.setState({ activeTool: 'select' });
  });

  it('Ctrl+K activa la herramienta Hyperlink y deja Shift+H para el resaltado de texto', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    key({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(useToolStore.getState().activeTool).toBe('link');
    key({ key: 'H', code: 'KeyH', shiftKey: true });
    expect(useToolStore.getState().activeTool).toBe('highlightText');
  });

  it('Ctrl+Shift+K y Ctrl+Alt+K no la activan, y el menú Tools muestra el atajo', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    key({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true });
    key({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true });
    expect(useToolStore.getState().activeTool).not.toBe('link');
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-herramientas'));
    expect(screen.getByTestId('menu-tools-hyperlink')).toHaveTextContent('Ctrl+K');
  });
});
