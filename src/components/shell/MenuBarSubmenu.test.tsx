import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MenuBar } from './MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';

type Box = { top: number; left: number; width: number; height: number };
const toRect = (b: Box) =>
  ({ top: b.top, left: b.left, bottom: b.top + b.height, right: b.left + b.width, x: b.left, y: b.top, width: b.width, height: b.height, toJSON: () => b }) as DOMRect;

describe('Menús y submenús dentro de la ventana (ADR-0104, ADR-0108)', () => {
  beforeEach(() => {
    useDocumentStore.setState({ numPages: 1, currentPageIndex: 0, pdfBytes: new Uint8Array([1]) });
  });
  afterEach(() => vi.restoreAllMocks());

  /** `entry` es la caja de la entrada Profiles (de la que cuelga el submenú) y `size` el tamaño del submenú. */
  const open = (win: { w: number; h: number }, entry: Box, size: { width: number; height: number }) => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(win.h);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(win.w);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === 'menu-view-profiles-popup') {
        // El submenú ocupa donde se lo ponga: su caja sigue a su left/top
        return toRect({ top: parseFloat(this.style.top || '0'), left: parseFloat(this.style.left || '0'), ...size });
      }
      return toRect(entry);
    });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.mouseEnter(screen.getByTestId('menu-view-profiles').parentElement!);
    return screen.getByTestId('menu-view-profiles-popup');
  };

  it('un submenú que se sale por abajo se sube lo justo para que se vean todas sus opciones', () => {
    const popup = open({ w: 900, h: 1022 }, { top: 955, left: 11, width: 312, height: 40 }, { width: 240, height: 145 });
    expect(popup.style.position).toBe('fixed');
    // Borde inferior a 8 px del borde de la ventana: 1022 - 8 - 145 = 869; a la derecha de su entrada
    expect(popup.style.top).toBe('869px');
    expect(popup.style.left).toBe('323px');
  });

  it('un submenú que no cabe a la derecha de su entrada se mueve para quedar entero dentro de la ventana', () => {
    const popup = open({ w: 619, h: 1022 }, { top: 100, left: 11, width: 450, height: 40 }, { width: 240, height: 100 });
    // A la izquierda de la entrada tampoco hay sitio (11 - 240 < 8): queda a 8 px del borde derecho, 619 - 8 - 240
    expect(popup.style.left).toBe('371px');
  });

  it('un submenú que cabe se queda junto a su entrada y uno más alto que la ventana se limita y se desplaza', () => {
    const fits = open({ w: 900, h: 1022 }, { top: 100, left: 11, width: 312, height: 40 }, { width: 240, height: 100 });
    expect([fits.style.left, fits.style.top]).toEqual(['323px', '100px']);
    expect(fits.style.maxHeight).toBe('1006px');
  });

  it('el menú de arriba se desplaza por dentro cuando no cabe en la ventana, sin recortar sus submenús', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    const popup = screen.getByTestId('menu-popup-ver');
    expect(popup.className).toContain('overflow-y-auto');
    expect(popup.className).toContain('max-h-[calc(100vh-3.5rem)]');
  });
});
