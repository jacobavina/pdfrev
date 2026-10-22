import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MenuBar } from './MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';

describe('Submenús dentro de la ventana (ADR-0104)', () => {
  beforeEach(() => {
    useDocumentStore.setState({ numPages: 1, currentPageIndex: 0, pdfBytes: new Uint8Array([1]) });
  });
  afterEach(() => vi.restoreAllMocks());

  const open = (rect: { top: number; bottom: number; left: number; right: number }) => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1022);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(619);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isPopup = this.dataset.testid === 'menu-view-profiles-popup';
      const r = isPopup ? rect : { top: 0, bottom: 20, left: 0, right: 100 };
      return { ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r } as DOMRect;
    });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.mouseEnter(screen.getByTestId('menu-view-profiles').parentElement!);
    return screen.getByTestId('menu-view-profiles-popup');
  };

  it('un submenú que se sale por abajo se sube lo justo para que se vean todas sus opciones', () => {
    // La entrada Profiles está al final del menú View: su submenú empieza a 955 px y mide 145
    const popup = open({ top: 955, bottom: 1100, left: 323, right: 563 });
    // Debe quedar con su borde inferior a 8 px del borde de la ventana: sube 1100 - (1022 - 8) = 86
    expect(popup.style.transform).toBe('translate(0px, -86px)');
  });

  it('un submenú que se sale por la derecha se mueve a la izquierda, y uno que cabe no se toca', () => {
    const wide = open({ top: 100, bottom: 200, left: 500, right: 700 });
    expect(wide.style.transform).toBe('translate(-89px, 0px)');
  });

  it('un submenú que cabe se queda donde está', () => {
    const fits = open({ top: 100, bottom: 200, left: 323, right: 563 });
    expect(fits.style.transform).toBe('');
  });
});
