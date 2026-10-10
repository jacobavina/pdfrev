import React from 'react';
import { MarkupStyle, MarkupType } from '../../types/markup';
import { ToolChestMode } from '../../types/toolChest';

interface ToolVectorThumbnailProps {
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
  // Normalizar estilos para visualización en miniatura
  const stroke = style.strokeColor || '#3b82f6';
  const fill =
    style.fillColor && style.fillColor !== 'transparent'
      ? style.fillColor
      : 'none';
  const strokeWidth = Math.max(1.5, Math.min(style.strokeWidth || 2, 4));
  const opacity = style.opacity !== undefined ? style.opacity : 1;
  const strokeDasharray = style.dashArray ? style.dashArray.join(',') : undefined;

  const renderGeometry = () => {
    switch (type) {
      case 'line':
        return (
          <line
            x1="8"
            y1="32"
            x2="32"
            y2="8"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
          />
        );

      case 'rectangle':
        return (
          <rect
            x="7"
            y="9"
            width="26"
            height="22"
            rx="2"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
          />
        );

      case 'circle':
        return (
          <ellipse
            cx="20"
            cy="20"
            rx="14"
            ry="11"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
          />
        );

      case 'polygon':
        return (
          <polygon
            points="20,7 33,16 29,32 11,32 7,16"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeLinejoin="round"
          />
        );

      case 'cloud':
        return (
          <path
            d="M 10 24 A 5 5 0 0 1 12 14 A 6 6 0 0 1 22 11 A 6 6 0 0 1 30 16 A 5 5 0 0 1 30 26 A 5 5 0 0 1 20 29 A 5 5 0 0 1 10 24 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
          />
        );

      case 'cloudPlus':
        return (
          <g>
            <path
              d="M 12 21 A 4 4 0 0 1 14 13 A 5 5 0 0 1 23 11 A 5 5 0 0 1 29 15 A 4 4 0 0 1 29 23 A 4 4 0 0 1 21 25 A 4 4 0 0 1 12 21 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            {/* Directriz de Cloud+ */}
            <polyline
              points="20,25 24,31 34,31"
              fill="none"
              stroke={stroke}
              strokeWidth={Math.max(1, strokeWidth - 0.5)}
            />
          </g>
        );

      case 'callout':
        return (
          <g>
            {/* Caja de texto */}
            <rect
              x="12"
              y="7"
              width="22"
              height="15"
              rx="1.5"
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            {/* Directriz con codo */}
            <polyline
              points="6,33 16,33 16,22"
              fill="none"
              stroke={stroke}
              strokeWidth={Math.max(1, strokeWidth - 0.5)}
            />
            {/* Punta de flecha */}
            <polygon points="6,33 10,31 10,35" fill={stroke} />
          </g>
        );

      case 'stickyNote':
        return (
          <g>
            <rect
              x="9"
              y="9"
              width="22"
              height="22"
              rx="2"
              fill={style.fillColor || '#fef08a'}
              stroke={stroke || '#ca8a04'}
              strokeWidth={strokeWidth}
            />
            {/* Doblez de esquina y líneas de texto */}
            <line x1="14" y1="15" x2="26" y2="15" stroke={stroke || '#ca8a04'} strokeWidth="1.5" />
            <line x1="14" y1="20" x2="26" y2="20" stroke={stroke || '#ca8a04'} strokeWidth="1.5" />
            <line x1="14" y1="25" x2="22" y2="25" stroke={stroke || '#ca8a04'} strokeWidth="1.5" />
          </g>
        );

      case 'highlightVector':
        return (
          <rect
            x="6"
            y="12"
            width="28"
            height="16"
            rx="2"
            fill={style.fillColor || '#ffff00'}
            fillOpacity={style.opacity || 0.5}
            stroke="#eab308"
            strokeWidth="1"
          />
        );

      case 'highlightText':
        return (
          <g>
            {/* Resaltado de fondo */}
            <rect
              x="6"
              y="11"
              width="28"
              height="9"
              fill="#ffff00"
              fillOpacity="0.5"
            />
            <rect
              x="6"
              y="22"
              width="20"
              height="9"
              fill="#ffff00"
              fillOpacity="0.5"
            />
            {/* Líneas simuladas de texto */}
            <line x1="8" y1="15" x2="30" y2="15" stroke="#1f2937" strokeWidth="1.5" />
            <line x1="8" y1="26" x2="22" y2="26" stroke="#1f2937" strokeWidth="1.5" />
          </g>
        );

      case 'text':
        return (
          <g>
            <rect
              x="7"
              y="7"
              width="26"
              height="26"
              rx="2"
              fill={fill}
              stroke={stroke}
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x="20"
              y="25"
              textAnchor="middle"
              fill={stroke}
              fontSize="16"
              fontFamily="sans-serif"
              fontWeight="bold"
            >
              A
            </text>
          </g>
        );

      case 'freehand':
        return (
          <path
            d="M 8 28 Q 14 10 20 20 T 32 14"
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        );

      case 'stamp':
        return (
          <g>
            <rect
              x="6"
              y="10"
              width="28"
              height="20"
              rx="3"
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <text
              x="20"
              y="24"
              textAnchor="middle"
              fill={stroke}
              fontSize="9"
              fontWeight="bold"
            >
              OK
            </text>
          </g>
        );

      default:
        return (
          <rect
            x="8"
            y="8"
            width="24"
            height="24"
            rx="2"
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
    }
  };

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
        viewBox="0 0 40 40"
        role="img"
        aria-label={`Miniatura vectorial ${type}`}
        style={{ opacity }}
      >
        {renderGeometry()}
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
