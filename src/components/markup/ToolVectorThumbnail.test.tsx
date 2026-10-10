import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolVectorThumbnail } from './ToolVectorThumbnail';
import { MarkupStyle } from '../../types/markup';

describe('ToolVectorThumbnail (Miniaturas Vectoriales B.3)', () => {
  const baseStyle: MarkupStyle = {
    strokeColor: '#2563eb',
    fillColor: 'rgba(37, 99, 235, 0.2)',
    strokeWidth: 3,
    opacity: 0.9,
    dashArray: [4, 4],
  };

  it('renderiza miniatura para rectángulo con estilos aplicados', () => {
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
    expect(rect?.getAttribute('stroke-dasharray')).toBe('4,4');
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

  it('renderiza geometrías vectoriales específicas para tipos avanzados', () => {
    const { rerender } = render(
      <ToolVectorThumbnail type="callout" style={baseStyle} />
    );
    expect(screen.getByTestId('tool-vector-thumbnail-callout').querySelector('polygon')).toBeInTheDocument();

    rerender(<ToolVectorThumbnail type="cloudPlus" style={baseStyle} />);
    expect(screen.getByTestId('tool-vector-thumbnail-cloudPlus').querySelector('polyline')).toBeInTheDocument();

    rerender(
      <ToolVectorThumbnail
        type="stickyNote"
        style={{ strokeColor: '#ca8a04', fillColor: '#fef08a', strokeWidth: 1, opacity: 1 }}
      />
    );
    const sticky = screen.getByTestId('tool-vector-thumbnail-stickyNote');
    expect(sticky.querySelector('rect')?.getAttribute('fill')).toBe('#fef08a');

    rerender(
      <ToolVectorThumbnail
        type="highlightVector"
        style={{ strokeColor: '#ffff00', fillColor: '#ffff00', strokeWidth: 1, opacity: 0.5 }}
      />
    );
    expect(screen.getByTestId('tool-vector-thumbnail-highlightVector')).toBeInTheDocument();
  });
});
