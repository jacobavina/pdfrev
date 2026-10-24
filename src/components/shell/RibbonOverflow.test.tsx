import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Ribbon } from './Ribbon';
import { useToolStore } from '../../store/useToolStore';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';

// jsdom no calcula medidas: la cinta "mide" lo que dice `width` y `content`
let content = 2000;
let width = 800;
let notify: (() => void) | null = null;

describe('Cinta: botón More tools en ventanas estrechas (ADR-0134)', () => {
  beforeEach(() => {
    content = 2000;
    width = 800;
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => content);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe() {}
        disconnect() {}
      }
    );
    useToolStore.setState({ activeTool: 'select' });
    useUiStore.setState({ ribbonTab: 'markup' });
    useDocumentStore.setState({ pdfBytes: new Uint8Array([1]) });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('no aparece cuando la cinta cabe y aparece cuando se corta', () => {
    content = 700;
    render(<Ribbon />);
    expect(screen.queryByTestId('ribbon-more')).toBeNull();
    content = 2000;
    act(() => notify?.());
    expect(screen.getByTestId('ribbon-more')).toBeInTheDocument();
  });

  it('abre la lista con todas las herramientas de la pestaña, elige una y se cierra', () => {
    render(<Ribbon />);
    fireEvent.click(screen.getByTestId('ribbon-more'));
    const menu = screen.getByTestId('ribbon-more-menu');
    expect(menu).toHaveTextContent('Typewriter');
    expect(menu).toHaveTextContent('Cloud+');
    fireEvent.click(screen.getByTestId('ribbon-more-cloud'));
    expect(useToolStore.getState().activeTool).toBe('cloud');
    expect(screen.queryByTestId('ribbon-more-menu')).toBeNull();
  });

  it('en la pestaña Measure y en Insert lista las herramientas de esa pestaña; Escape cierra', () => {
    useToolStore.setState({ activeTool: 'length' });
    useUiStore.setState({ ribbonTab: 'measure' });
    const { unmount } = render(<Ribbon />);
    fireEvent.click(screen.getByTestId('ribbon-more'));
    expect(screen.getByTestId('ribbon-more-menu')).toHaveTextContent('Length');
    expect(screen.getByTestId('ribbon-more-menu')).not.toHaveTextContent('Typewriter');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('ribbon-more-menu')).toBeNull();
    unmount();
    useToolStore.setState({ activeTool: 'stamp' });
    useUiStore.setState({ ribbonTab: 'insert' });
    render(<Ribbon />);
    fireEvent.click(screen.getByTestId('ribbon-more'));
    fireEvent.click(screen.getByTestId('ribbon-more-link'));
    expect(useToolStore.getState().activeTool).toBe('link');
  });
});
