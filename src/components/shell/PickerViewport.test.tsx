import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconPicker } from './IconPicker';
import { ColorPicker } from './ColorPicker';

/**
 * Los desplegables de la sección de estilo se montan en <body> con posición fija. El panel de Propiedades está
 * pegado al borde derecho, así que deben desplazarse para quedar enteros dentro de la ventana (ADR-0066).
 * jsdom no maqueta: se fijan las cajas del botón y de la lista.
 */
type Box = { left: number; top: number; width: number; height: number };
function mockBoxes(button: Box, popup: Box) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const b = this.tagName === 'BUTTON' && this.getAttribute('aria-haspopup') ? button : popup;
    return { ...b, x: b.left, y: b.top, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => b } as DOMRect;
  });
}

const OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed 1' },
];

describe('Desplegables siempre enteros dentro de la ventana (ADR-0066)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('la lista de tipos de línea abierta junto al borde derecho se desplaza a la izquierda y, sin sitio debajo, se abre hacia arriba', () => {
    // Ventana de jsdom: 1024 × 768. Botón pegado al borde derecho y abajo; lista de 212 × 400.
    mockBoxes({ left: 960, top: 600, width: 60, height: 24 }, { left: 0, top: 0, width: 212, height: 400 });
    render(<IconPicker value="solid" options={OPTIONS} renderIcon={(v) => <span>{v}</span>} onChange={() => {}} testId="lp" title="Line style" withLabels />);
    fireEvent.click(screen.getByTestId('lp'));
    const list = screen.getByTestId('lp-list');
    expect(list.style.left).toBe(`${1024 - 212 - 8}px`);
    expect(list.style.top).toBe(`${600 - 400 - 2}px`);
  });

  it('con sitio de sobra la lista se queda bajo el botón, alineada a su izquierda', () => {
    mockBoxes({ left: 100, top: 80, width: 60, height: 24 }, { left: 0, top: 0, width: 212, height: 400 });
    render(<IconPicker value="solid" options={OPTIONS} renderIcon={(v) => <span>{v}</span>} onChange={() => {}} testId="lp" title="Line style" withLabels />);
    fireEvent.click(screen.getByTestId('lp'));
    const list = screen.getByTestId('lp-list');
    expect(list.style.left).toBe('100px');
    expect(list.style.top).toBe(`${80 + 24 + 2}px`);
  });

  it('el desplegable de color abierto junto al borde derecho también queda entero dentro de la ventana', () => {
    mockBoxes({ left: 990, top: 100, width: 40, height: 24 }, { left: 0, top: 0, width: 180, height: 160 });
    render(
      <ColorPicker testId="cp" title="Line color" value="#ff0000" options={[{ value: '#ff0000', label: 'Red' }]} customTestId="cp-custom" onChange={() => {}} />
    );
    fireEvent.click(screen.getByTestId('cp'));
    const pop = screen.getByTestId('cp-custom').closest('[style*="position: fixed"]') as HTMLElement;
    expect(pop.style.left).toBe(`${1024 - 180 - 8}px`);
    expect(pop.style.top).toBe(`${100 + 24 + 4}px`);
  });
});
