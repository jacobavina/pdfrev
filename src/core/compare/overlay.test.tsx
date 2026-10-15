import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { tintOverlay, changedRatio, hexToRgb } from './overlayTint';
import { useOverlayStore } from '../../store/useOverlayStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { OverlayBar } from '../../components/viewer/OverlayBar';
import { MenuBar } from '../../components/shell/MenuBar';
import { startOverlayWithThisDocument } from '../../services/overlayService';

/** Imagen de 3 píxeles RGBA: cada valor es la luminancia (0 = negro, 255 = blanco). */
const img = (...lum: number[]) => new Uint8ClampedArray(lum.flatMap((l) => [l, l, l, 255]));
const RED = hexToRgb('#ff0000');
const BLUE = hexToRgb('#0000ff');
const px = (data: Uint8ClampedArray, i: number) => Array.from(data.slice(i * 4, i * 4 + 3));

describe('Overlay Pages: mezcla de colores (ADR-0038)', () => {
  it('lo común queda oscuro, lo que solo está en una página sale en su color y el fondo blanco', () => {
    // Píxel 0: tinta en ambas; 1: solo en la actual; 2: solo en la comparada; 3: en ninguna
    const out = tintOverlay(4, 1, img(0, 0, 255, 255), img(0, 255, 0, 255), RED, BLUE);
    expect(px(out, 0)).toEqual([0, 0, 0]);
    expect(px(out, 1)).toEqual([255, 0, 0]);
    expect(px(out, 2)).toEqual([0, 0, 255]);
    expect(px(out, 3)).toEqual([255, 255, 255]);
  });

  it('una capa oculta (null) es una página en blanco; el gris es tinta parcial', () => {
    const out = tintOverlay(2, 1, img(0, 128), null, RED, BLUE);
    expect(px(out, 0)).toEqual([255, 0, 0]);
    expect(out[4 + 1]).toBeGreaterThan(100); // gris medio: rojo atenuado
    expect(out[4 + 1]).toBeLessThan(160);
  });

  it('proporción de cambio entre dos versiones', () => {
    expect(changedRatio(img(0, 0, 255, 255), img(0, 255, 0, 255))).toBeCloseTo(2 / 3, 9);
    expect(changedRatio(img(0, 0), img(0, 0))).toBe(0);
    expect(changedRatio(img(255), img(255))).toBe(0);
  });
});

describe('Overlay Pages: estado, barra y menú (ADR-0038)', () => {
  beforeEach(() => {
    useOverlayStore.getState().close();
    useDocumentStore.setState({ numPages: 3, currentPageIndex: 2, pdfBytes: new Uint8Array([1]), fileName: 'plan.pdf' });
  });

  it('con el propio documento compara con la página siguiente, o con la anterior si es la última', () => {
    startOverlayWithThisDocument();
    const s = useOverlayStore.getState();
    expect(s.active).toBe(true);
    expect(s.sourceName).toBe('This document');
    expect(s.sourceBytes).toBeNull();
    expect(s.otherPageIndex).toBe(1);
  });

  it('la barra: leyenda, intercambiar colores, ocultar capas, alinear de 1 o 10 pt, página y cerrar', () => {
    act(() => useOverlayStore.getState().start({ name: 'Rev B.pdf', bytes: new Uint8Array([1]), pageCount: 4, pageIndex: 0 }));
    render(<OverlayBar />);
    expect(screen.getByTestId('overlay-bar')).toHaveTextContent('Rev B.pdf');
    expect(screen.getByTestId('overlay-bar')).toHaveTextContent('Current · p. 3');

    const before = useOverlayStore.getState();
    fireEvent.click(screen.getByTestId('overlay-swap'));
    expect(useOverlayStore.getState().baseColor).toBe(before.otherColor);
    expect(useOverlayStore.getState().otherColor).toBe(before.baseColor);

    fireEvent.click(screen.getByTestId('overlay-toggle-other'));
    expect(useOverlayStore.getState().showOther).toBe(false);
    fireEvent.click(screen.getByTestId('overlay-toggle-base'));
    expect(useOverlayStore.getState().showBase).toBe(false);

    fireEvent.click(screen.getByTestId('overlay-nudge-right'));
    fireEvent.click(screen.getByTestId('overlay-nudge-down'), { shiftKey: true });
    expect(useOverlayStore.getState().offset).toEqual({ x: 1, y: 10 });
    expect(screen.getByTestId('overlay-offset')).toHaveTextContent('1, 10 pt');
    fireEvent.click(screen.getByTestId('overlay-reset-offset'));
    expect(useOverlayStore.getState().offset).toEqual({ x: 0, y: 0 });

    fireEvent.change(screen.getByTestId('overlay-page-select'), { target: { value: '3' } });
    expect(useOverlayStore.getState().otherPageIndex).toBe(3);
    // Fuera de rango se acota
    act(() => useOverlayStore.getState().setOtherPage(9));
    expect(useOverlayStore.getState().otherPageIndex).toBe(3);

    fireEvent.click(screen.getByTestId('overlay-close'));
    expect(useOverlayStore.getState().active).toBe(false);
  });

  it('Document ▸ Overlay Pages ofrece otro PDF o una página de este documento', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    fireEvent.mouseEnter(screen.getByTestId('menu-overlay'));
    expect(screen.getByTestId('menu-overlay-file')).toHaveTextContent('Overlay with Another PDF');
    expect(screen.getByTestId('menu-overlay-self')).toBeEnabled();
  });
});
