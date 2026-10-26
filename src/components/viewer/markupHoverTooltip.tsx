import React from 'react';
import { Markup } from '../../types/markup';
import { markupTypeLabel } from '../../core/markup/typeLabels';

export interface MarkupHoverInfo {
  author: string;
  content: string;
  x: number;
  y: number;
}

/**
 * Retorna el contenido representativo de una marca para la nube / tooltip al pasar el cursor (URGE).
 * Muestra primero la medición formateada (área, longitud, conteo, etc.),
 * luego el texto si lo tiene, luego el asunto (Sequence, etc.) y como fallback el tipo de herramienta.
 */
export function getMarkupHoverContent(markup: Markup): string {
  if (markup.measurement?.formatted) {
    return markup.measurement.formatted;
  }
  const text = markup.text?.trim();
  const subj = markup.subject?.trim();
  if (subj && subj.toLowerCase() === 'sequence' && text) {
    return `Sequence: ${text}`;
  }
  if (text) {
    return text;
  }
  if (subj) {
    return subj;
  }
  return markupTypeLabel(markup.type);
}

export interface MarkupHoverTooltipProps {
  info: MarkupHoverInfo;
}

/**
 * Nube flotante de información CAD que aparece al posar el mouse sobre una anotación (ADR-0136).
 * Estilo pergamino claro (amber-50) con autor, divisor y valor de medición o contenido.
 */
export const MarkupHoverTooltip: React.FC<MarkupHoverTooltipProps> = ({ info }) => {
  const clampX =
    typeof window !== 'undefined'
      ? Math.max(10, Math.min(window.innerWidth - 250, info.x + 14))
      : info.x + 14;
  const clampY =
    typeof window !== 'undefined'
      ? Math.max(10, Math.min(window.innerHeight - 90, info.y + 14))
      : info.y + 14;

  return (
    <div
      data-testid="markup-hover-tooltip"
      className="fixed z-50 pointer-events-none rounded border border-amber-300/80 bg-amber-50 px-2.5 py-1.5 shadow-float text-gray-900 select-none"
      style={{
        left: `${clampX}px`,
        top: `${clampY}px`,
        maxWidth: '240px',
      }}
    >
      <div className="text-xs font-semibold leading-tight text-gray-900" data-testid="markup-hover-author">
        {info.author}
      </div>
      <div className="my-1 border-b border-gray-300" />
      <div className="text-xs font-medium leading-tight text-gray-800 break-words" data-testid="markup-hover-content">
        {info.content}
      </div>
    </div>
  );
};
