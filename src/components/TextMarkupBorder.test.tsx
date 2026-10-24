import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getMarkupSvgDescriptor } from '../core/markup/render';
import { StyleSection } from './shell/StyleSection';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';
import { Markup } from '../types/markup';

describe('Borde y relleno de marcas de texto (Text Markup Border & Fill)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] } as never);
    useToolStore.setState({ activeTool: 'select', currentStyle: { strokeColor: '#000000', strokeWidth: 1, fillColor: '#fffbe8', opacity: 1 } });
  });

  it('renderMarkup dibuja rect sin borde ni relleno cuando boxBorder es 0 y fillColor es transparent', () => {
    const markup: Markup = {
      id: 'txt-borderless',
      type: 'text',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.2 },
      ],
      text: 'Texto sin recuadro',
      style: { strokeColor: 'transparent', strokeWidth: 0, fillColor: 'transparent', opacity: 1 },
      customFields: { boxBorder: 0 },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const svgDescriptor = getMarkupSvgDescriptor(markup, { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0 });
    const rect = svgDescriptor.children?.find((c) => c.tag === 'rect');
    expect(rect).toBeDefined();
    expect(rect?.attrs.stroke).toBe('none');
    expect(rect?.attrs.strokeWidth).toBe(0);
    expect(rect?.attrs.fill).toBe('transparent');
  });

  it('StyleSection muestra el botón Border cuando hay una marca de texto seleccionada y permite alternarlo', () => {
    const textMarkup: Markup = {
      id: 'txt-1',
      type: 'text',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.2 },
      ],
      text: 'Ejemplo con borde',
      style: { strokeColor: '#000000', strokeWidth: 1, fillColor: '#fffbe8', opacity: 1 },
      customFields: { boxBorder: 1 },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    useMarkupStore.setState({ markups: [textMarkup], selectedMarkupIds: ['txt-1'] } as never);

    render(<StyleSection />);

    const borderBtn = screen.getByTestId('ribbon-callout-border');
    expect(borderBtn).toBeDefined();
    expect(borderBtn.getAttribute('aria-pressed')).toBe('true');

    // Desactivar borde
    act(() => {
      fireEvent.click(borderBtn);
    });

    const updated = useMarkupStore.getState().markups.find((m) => m.id === 'txt-1');
    expect(updated?.customFields?.boxBorder).toBe(0);
    expect(updated?.style.strokeWidth).toBe(0);
    expect(updated?.style.strokeColor).toBe('transparent');
  });

  it('StyleSection permite poner el color de línea en None y desactiva el borde del texto', () => {
    const textMarkup: Markup = {
      id: 'txt-line-none',
      type: 'text',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.2 },
      ],
      text: 'Texto con línea',
      style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    useMarkupStore.setState({ markups: [textMarkup], selectedMarkupIds: ['txt-line-none'] } as never);

    render(<StyleSection />);

    const strokeColorBtn = screen.getByTestId('ribbon-stroke-color');
    act(() => {
      fireEvent.click(strokeColorBtn);
    });

    const noneBtn = screen.getByTestId('ribbon-stroke-color-option-none');
    expect(noneBtn).toBeDefined();

    act(() => {
      fireEvent.click(noneBtn);
    });

    const updated = useMarkupStore.getState().markups.find((m) => m.id === 'txt-line-none');
    expect(updated?.style.strokeColor).toBe('transparent');
    expect(updated?.style.strokeWidth).toBe(0);
    expect(updated?.customFields?.boxBorder).toBe(0);

    // Un solo Undo restaura el color y borde original
    act(() => {
      useMarkupStore.getState().undo();
    });
    const restored = useMarkupStore.getState().markups.find((m) => m.id === 'txt-line-none');
    expect(restored?.style.strokeColor).toBe('#000000');
    expect(restored?.style.strokeWidth).toBe(1);
  });
});
