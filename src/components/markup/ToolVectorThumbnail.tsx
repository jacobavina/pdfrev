import React from 'react';
import {
  Markup,
  MarkupPoint,
  MarkupStyle,
  MarkupType,
  STICKY_NOTE_COLORS,
  ViewportTransform,
} from '../../types/markup';
import { ToolChestMode } from '../../types/toolChest';
import {
  getMarkupSvgDescriptor,
  renderSvgDescriptor,
} from '../../core/markup/render';

/**
 * Sintetiza un Markup de muestra en espacio normalizado [0.15 .. 0.85]
 * para alimentar directamente el pipeline de renderizado canónico (ADR-0007).
 */
export function createSampleMarkup(
  type: MarkupType,
  style: MarkupStyle,
  _mode: ToolChestMode = 'drawing'
): Markup {
  let points: MarkupPoint[] = [];
  let leaders: MarkupPoint[][] | undefined = undefined;
  let text: string | undefined = undefined;
  const customFields: Record<string, string | number> = {};

  switch (type) {
    case 'line':
      points = [
        { x: 0.15, y: 0.85 },
        { x: 0.85, y: 0.15 },
      ];
      break;

    case 'rectangle':
      points = [
        { x: 0.15, y: 0.2 },
        { x: 0.85, y: 0.8 },
      ];
      break;

    case 'circle':
      points = [
        { x: 0.15, y: 0.15 },
        { x: 0.85, y: 0.85 },
      ];
      break;

    case 'polygon':
      points = [
        { x: 0.5, y: 0.15 },
        { x: 0.85, y: 0.4 },
        { x: 0.72, y: 0.85 },
        { x: 0.28, y: 0.85 },
        { x: 0.15, y: 0.4 },
      ];
      break;

    case 'cloud':
    case 'cloudPlus':
      points = [
        { x: 0.15, y: 0.15 },
        { x: 0.85, y: 0.15 },
        { x: 0.85, y: 0.85 },
        { x: 0.15, y: 0.85 },
      ];
      customFields.arcStep = 18;
      break;

    case 'callout':
      // Caja en parte superior derecha, directriz apuntando a inferior izquierda
      points = [
        { x: 0.45, y: 0.15 },
        { x: 0.95, y: 0.55 },
      ];
      leaders = [[{ x: 0.1, y: 0.85 }]];
      text = 'Nota';
      break;

    case 'text':
      points = [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
      ];
      text = 'A';
      break;

    case 'stickyNote':
      // Se centra considerando el tamaño de STICKY_NOTE_SIZE_PT * scale
      points = [{ x: 0.26, y: 0.26 }];
      break;

    case 'freehand':
      points = [
        { x: 0.15, y: 0.75 },
        { x: 0.35, y: 0.25 },
        { x: 0.65, y: 0.75 },
        { x: 0.85, y: 0.25 },
      ];
      break;

    case 'highlight':
    case 'highlightVector':
    case 'highlightText':
      points = [
        { x: 0.15, y: 0.25 },
        { x: 0.85, y: 0.75 },
      ];
      break;

    case 'stamp':
    default:
      points = [
        { x: 0.15, y: 0.25 },
        { x: 0.85, y: 0.75 },
      ];
      break;
  }

  // Asegurar estilos con contraste adecuado para miniaturas
  const effectiveFillColor =
    type === 'stickyNote'
      ? style.fillColor || STICKY_NOTE_COLORS.yellow.fillColor
      : style.fillColor;

  return {
    id: `sample-thumb-${type}`,
    type,
    pageIndex: 0,
    points,
    leaders,
    text,
    style: {
      ...style,
      fillColor: effectiveFillColor,
      strokeWidth: style.strokeWidth || 2,
    },
    author: 'System',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
    customFields,
  };
}

export interface ToolVectorThumbnailProps {
  type: MarkupType;
  style: MarkupStyle;
  mode?: ToolChestMode;
  size?: number; // Tamaño en px (por defecto 40)
  className?: string;
  showModeBadge?: boolean;
}

export const ToolVectorThumbnail: React.FC<ToolVectorThumbnailProps> = ({
  type,
  style,
  mode = 'drawing',
  size = 40,
  className = '',
  showModeBadge = true,
}) => {
  const opacity = style.opacity !== undefined ? style.opacity : 1;

  // ViewportTransform normalizado de caja unitaria (100x100)
  const transform: ViewportTransform = {
    width: 100,
    height: 100,
    scale: type === 'stickyNote' ? 2 : 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  };

  const sampleMarkup = createSampleMarkup(type, style, mode);
  const descriptor = getMarkupSvgDescriptor(sampleMarkup, transform);

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded bg-gray-800 border border-gray-700 select-none ${className}`}
      style={{ width: size, height: size }}
      title={`Herramienta ${type} (${mode === 'properties' ? 'Modo Propiedad' : 'Modo Dibujo'})`}
      data-testid={`tool-vector-thumbnail-${type}`}
      data-tool-mode={mode}
    >
      <svg
        width={size * 0.85}
        height={size * 0.85}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Miniatura vectorial ${type}`}
        style={{ opacity }}
        className="overflow-visible"
      >
        {renderSvgDescriptor(descriptor, `thumb-${type}`)}
      </svg>

      {/* Indicador de Modo (Badge pequeño en esquina superior derecha) */}
      {showModeBadge && (
        <span
          className={`absolute -top-1 -right-1 px-1 py-0.2 text-[9px] font-bold rounded shadow-sm uppercase ${
            mode === 'properties'
              ? 'bg-amber-500 text-gray-950'
              : 'bg-blue-600 text-white'
          }`}
          data-testid={`tool-mode-badge-${mode}`}
          title={mode === 'properties' ? 'Modo Propiedad' : 'Modo Dibujo'}
        >
          {mode === 'properties' ? 'P' : 'D'}
        </span>
      )}
    </div>
  );
};
