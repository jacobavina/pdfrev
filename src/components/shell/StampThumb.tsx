import React from 'react';
import { stampById } from '../../core/markup/stamps';
import { stampArt, stampDefaultSize, stampTexts } from '../../core/markup/stampArt';
import { useToolStore } from '../../store/useToolStore';

/**
 * Miniatura de un sello con su dibujo real (ADR-0045): la misma geometría que el sello colocado y que su /AP, con el
 * autor y la hora actuales en los dinámicos.
 */
export const StampThumb: React.FC<{ id: string; height?: number; maxWidth?: number }> = ({ id, height = 28, maxWidth }) => {
  const author = useToolStore((s) => s.author);
  const def = stampById(id);
  const { title, subtitle } = stampTexts(def, author || 'Reviewer', new Date().toISOString());
  const size = stampDefaultSize(def, title, subtitle);
  const prims = stampArt(def, { x: 0, y: 0, w: size.width, h: size.height }, title, subtitle, def.color);
  const pad = 1.5;
  const natural = (height * (size.width + pad * 2)) / (size.height + pad * 2);
  // Con tope de ancho el dibujo se reduce entero (meet) dentro de la caja; el tamaño va en línea para que ninguna regla de
  // ícono de menú lo encoja a 16 px
  const width = maxWidth ? Math.min(natural, maxWidth) : natural;
  return (
    <svg
      width={width}
      height={height}
      style={{ width, height, flexShrink: 0 }}
      viewBox={`${-pad} ${-pad} ${size.width + pad * 2} ${size.height + pad * 2}`}
      aria-hidden="true"
      data-stamp={id}
    >
      {prims.map((p, i) =>
        p.t === 'path' ? (
          <path key={i} d={p.d} fill={p.fill ?? 'none'} stroke={p.stroke ?? 'none'} strokeWidth={p.width ?? 0} strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <text
            key={i}
            x={p.x}
            y={p.y}
            fontSize={p.size}
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight={p.bold ? 'bold' : undefined}
            fontStyle={p.italic ? 'italic' : undefined}
            textAnchor={p.align === 'center' ? 'middle' : 'start'}
            fill={p.color}
          >
            {p.text}
          </text>
        )
      )}
    </svg>
  );
};
