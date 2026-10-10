import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolVectorThumbnail, createSampleMarkup } from './ToolVectorThumbnail';
import { MarkupStyle, VALID_MARKUP_TYPES } from '../../types/markup';
import { getMarkupSvgDescriptor } from '../../core/markup/render';

describe('ToolVectorThumbnail (Canal Único de Renderizado ADR-0007 / B.3)', () => {
  const baseStyle: MarkupStyle = {
    strokeColor: '#2563eb',
    fillColor: 'rgba(37, 99, 235, 0.2)',
    strokeWidth: 3,
    opacity: 0.9,
    dashArray: [4, 4],
  };

  it('renderiza miniatura para rectángulo con estilos aplicados mediante pipeline canónico', () => {
    render(<ToolVectorThumbnail type="rectangle" style={baseStyle} mode="drawing" />);

    const thumbnail = screen.getByTestId('tool-vector-thumbnail-rectangle');
    expect(thumbnail).toBeInTheDocument();
    expect(thumbnail.getAttribute('data-tool-mode')).toBe('drawing');

    const svg = thumbnail.querySelector('svg');
    expect(svg).toBeInTheDocument();

    const rect = svg?.querySelector('rect');
    expect(rect).toBeInTheDocument();
    expect(rect?.getAttribute('stroke')).toBe('#2563eb');
    expect(rect?.getAttribute('fill')).toBe('rgba(37, 99, 235, 0.2)');
    expect(rect?.getAttribute('stroke-dasharray')).toMatch(/^4[ ,]4$/);
  });

  it('renderiza badge "P" para Modo Propiedad y "D" para Modo Dibujo', () => {
    const { rerender } = render(
      <ToolVectorThumbnail type="cloud" style={baseStyle} mode="properties" />
    );

    const badgeP = screen.getByTestId('tool-mode-badge-properties');
    expect(badgeP).toBeInTheDocument();
    expect(badgeP.textContent).toBe('P');

    rerender(<ToolVectorThumbnail type="cloud" style={baseStyle} mode="drawing" />);

    const badgeD = screen.getByTestId('tool-mode-badge-drawing');
    expect(badgeD).toBeInTheDocument();
    expect(badgeD.textContent).toBe('D');
  });

  it('oculta el badge cuando showModeBadge es false', () => {
    render(
      <ToolVectorThumbnail
        type="circle"
        style={baseStyle}
        mode="properties"
        showModeBadge={false}
      />
    );

    expect(screen.queryByTestId('tool-mode-badge-properties')).toBeNull();
  });

  it('renderiza geometrías vectoriales del pipeline canónico para tipos complejos', () => {
    const { rerender } = render(
      <ToolVectorThumbnail type="callout" style={baseStyle} />
    );
    const calloutEl = screen.getByTestId('tool-vector-thumbnail-callout');
    expect(calloutEl.querySelector('polygon')).toBeInTheDocument(); // Saeta de la directriz
    expect(calloutEl.querySelector('polyline')).toBeInTheDocument(); // Codo de la directriz
    expect(calloutEl.querySelector('rect')).toBeInTheDocument(); // Caja de texto

    rerender(<ToolVectorThumbnail type="cloudPlus" style={baseStyle} />);
    expect(screen.getByTestId('tool-vector-thumbnail-cloudPlus').querySelector('path')).toBeInTheDocument();

    rerender(
      <ToolVectorThumbnail
        type="stickyNote"
        style={{ strokeColor: '#ca8a04', fillColor: '#fef08a', strokeWidth: 1, opacity: 1 }}
      />
    );
    const sticky = screen.getByTestId('tool-vector-thumbnail-stickyNote');
    expect(sticky.querySelector('rect')?.getAttribute('fill')).toBe('#fef08a');
    expect(sticky.querySelectorAll('line').length).toBe(3); // 3 líneas de nota técnica

    rerender(
      <ToolVectorThumbnail
        type="highlightVector"
        style={{ strokeColor: '#ffff00', fillColor: '#ffff00', strokeWidth: 1, opacity: 0.5 }}
      />
    );
    expect(screen.getByTestId('tool-vector-thumbnail-highlightVector')).toBeInTheDocument();
  });

  it('createSampleMarkup genera marcas válidas para los 14 tipos de VALID_MARKUP_TYPES', () => {
    const dummyTransform = {
      width: 100,
      height: 100,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    };

    for (const type of VALID_MARKUP_TYPES) {
      const sample = createSampleMarkup(type, baseStyle);
      expect(sample.type).toBe(type);
      expect(sample.points.length).toBeGreaterThan(0);

      // El descriptor del pipeline canónico debe generarse sin errores para los 14 tipos
      const descriptor = getMarkupSvgDescriptor(sample, dummyTransform);
      expect(descriptor).toBeDefined();
      expect(['rect', 'ellipse', 'line', 'polygon', 'path', 'g']).toContain(descriptor.tag);
    }
  });
});
