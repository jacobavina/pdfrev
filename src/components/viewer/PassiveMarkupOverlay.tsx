import React from 'react';
import type { Markup } from '../../types/markup';
import { getMarkupSvgDescriptor, renderSvgDescriptor } from '../../core/markup/render';

export interface PassiveMarkupOverlayProps {
  pageIndex: number;
  width: number;
  height: number;
  markups: Markup[];
  scale: number;
  isMarkupVisible: (m: Markup) => boolean;
}

/**
 * Marcas de las demás páginas en vista continua (ADR-0019 / ADR-0089).
 * Capa SVG no interactiva (solo lectura); al interactuar con el cursor la página se convierte en activa.
 */
export const PassiveMarkupOverlay: React.FC<PassiveMarkupOverlayProps> = ({
  pageIndex,
  width,
  height,
  markups,
  scale,
  isMarkupVisible,
}) => {
  const ms = markups.filter((m) => m.pageIndex === pageIndex && isMarkupVisible(m));
  if (ms.length === 0) return null;
  const t = { width, height, scale: 1.0, offsetX: 0, offsetY: 0, zoom: scale || 1.0 };
  return (
    <svg
      data-testid={`passive-overlay-${pageIndex}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 pointer-events-none"
    >
      {ms.map((m) => (
        <g key={m.id}>{renderSvgDescriptor(getMarkupSvgDescriptor(m, t), `passive-${m.id}`)}</g>
      ))}
    </svg>
  );
};
