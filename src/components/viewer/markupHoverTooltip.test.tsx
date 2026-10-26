import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getMarkupHoverContent, MarkupHoverTooltip } from './markupHoverTooltip';
import { Markup } from '../../types/markup';

describe('markupHoverTooltip (Nube de información al pasar el mouse)', () => {
  const baseMarkup: Markup = {
    id: 'm1',
    type: 'rectangle',
    pageIndex: 0,
    points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
    style: { strokeColor: '#ff0000', strokeWidth: 1, opacity: 1 },
    author: 'Jacob Aviña',
    createdAt: '2026-10-26T10:00:00Z',
    updatedAt: '2026-10-26T10:00:00Z',
    status: 'pending',
  };

  it('muestra la medición formateada en marcas de área o longitud', () => {
    const areaMarkup: Markup = {
      ...baseMarkup,
      type: 'area',
      measurement: {
        value: 36530.47,
        unit: 'ft',
        formatted: '36,530.47 ft²',
      },
    };
    expect(getMarkupHoverContent(areaMarkup)).toBe('36,530.47 ft²');
  });

  it('muestra la secuencia en marcas con subject Sequence', () => {
    const seqMarkup: Markup = {
      ...baseMarkup,
      type: 'text',
      subject: 'Sequence',
      text: '1',
    };
    expect(getMarkupHoverContent(seqMarkup)).toBe('Sequence: 1');
  });

  it('muestra el texto en notas o cuadros de texto', () => {
    const textMarkup: Markup = {
      ...baseMarkup,
      type: 'text',
      text: 'Revisar cimentación',
    };
    expect(getMarkupHoverContent(textMarkup)).toBe('Revisar cimentación');
  });

  it('muestra el tipo como fallback si no hay medición ni texto', () => {
    expect(getMarkupHoverContent(baseMarkup)).toBe('Rectangle');
  });

  it('renderiza el tooltip con autor y contenido acotado', () => {
    render(
      <MarkupHoverTooltip
        info={{
          author: 'Jacob Aviña',
          content: '36,530.47 ft²',
          x: 100,
          y: 200,
        }}
      />
    );

    expect(screen.getByTestId('markup-hover-author').textContent).toBe('Jacob Aviña');
    expect(screen.getByTestId('markup-hover-content').textContent).toBe('36,530.47 ft²');
  });
});
