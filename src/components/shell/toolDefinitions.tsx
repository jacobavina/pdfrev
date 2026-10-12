import React from 'react';
import {
  MousePointer,
  Hand,
  Square,
  Type,
  Circle,
  Hexagon,
  Pencil,
  MessageSquareText,
  StickyNote,
  Highlighter,
  TextSelect,
  Ruler,
  Hash,
  Scale,
} from 'lucide-react';
import { CloudIcon, CloudPlusIcon, DimensionIcon, LineToolIcon, ArrowToolIcon } from './customIcons';
import { ToolType } from '../../store/useToolStore';

/**
 * Catálogo único de herramientas (ADR-0017): lo consumen la cinta de herramientas y los menús.
 * Los `label` son también el `title` de los botones (los tests E2E los localizan por título).
 */
export interface ToolDefinition {
  type: ToolType;
  label: string;
  /** Texto corto bajo el icono en la cinta. */
  short: string;
  icon: React.ReactNode;
  testId?: string;
  shortcut?: string;
}

export interface ToolGroup {
  id: 'select' | 'text' | 'draw' | 'measure';
  label: string;
  tools: ToolDefinition[];
}

const svgIcon = (children: React.ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'select',
    label: 'Selección',
    tools: [
      { type: 'select', label: 'Seleccionar (V)', short: 'Seleccionar', icon: <MousePointer size={18} />, shortcut: 'V' },
      { type: 'pan', label: 'Mover lienzo (Espacio)', short: 'Mano', icon: <Hand size={18} />, shortcut: 'Espacio' },
    ],
  },
  {
    id: 'text',
    label: 'Texto y revisión',
    tools: [
      { type: 'text', label: 'Nota / Texto (T)', short: 'Texto', icon: <Type size={18} />, shortcut: 'T' },
      { type: 'callout', label: 'Nota técnica con directriz (Q)', short: 'Llamada', icon: <MessageSquareText size={18} />, shortcut: 'Q' },
      { type: 'stickyNote', label: 'Nota adhesiva (N)', short: 'Nota', icon: <StickyNote size={18} />, shortcut: 'N' },
      { type: 'highlightText', label: 'Resaltador de texto (Shift+H)', short: 'Resaltar', icon: <TextSelect size={18} />, shortcut: 'Shift+H' },
      {
        type: 'underline',
        label: 'Subrayado de texto',
        short: 'Subrayar',
        icon: svgIcon(
          <>
            <path d="M6 4v6a6 6 0 0 0 12 0V4" />
            <line x1="4" y1="20" x2="20" y2="20" />
          </>
        ),
      },
      {
        type: 'strikeOut',
        label: 'Tachado de texto',
        short: 'Tachar',
        icon: svgIcon(
          <>
            <path d="M16 4H9a3 3 0 0 0-2.83 4" />
            <path d="M14 12a4 4 0 0 1 0 8H6" />
            <line x1="4" y1="12" x2="20" y2="12" />
          </>
        ),
      },
    ],
  },
  {
    id: 'draw',
    label: 'Dibujo',
    tools: [
      { type: 'freehand', label: 'Mano alzada (F)', short: 'Lápiz', icon: <Pencil size={18} />, shortcut: 'F' },
      { type: 'highlightVector', label: 'Resaltador vectorial (H)', short: 'Marcador', icon: <Highlighter size={18} />, shortcut: 'H' },
      { type: 'line', label: 'Línea (L)', short: 'Línea', icon: <LineToolIcon />, shortcut: 'L' },
      { type: 'arrow', label: 'Flecha (A)', short: 'Flecha', icon: <ArrowToolIcon />, shortcut: 'A' },
      { type: 'dimension', label: 'Cota con texto propio (Shift+L)', short: 'Cota', icon: <DimensionIcon />, shortcut: 'Shift+L' },
      {
        type: 'polyLine',
        label: 'Polilínea abierta',
        short: 'Polilínea',
        icon: svgIcon(<polyline points="4 18 10 7 15 14 20 6" />),
      },
      { type: 'rectangle', label: 'Rectángulo (R)', short: 'Rectángulo', icon: <Square size={18} />, shortcut: 'R' },
      { type: 'circle', label: 'Círculo / Elipse (O)', short: 'Elipse', icon: <Circle size={18} />, shortcut: 'O' },
      { type: 'polygon', label: 'Polígono (P)', short: 'Polígono', icon: <Hexagon size={18} />, shortcut: 'P' },
      { type: 'cloud', label: 'Nube de revisión (C)', short: 'Nube', icon: <CloudIcon />, shortcut: 'C' },
      { type: 'cloudPlus', label: 'Cloud+ con leyenda (K)', short: 'Nube+', icon: <CloudPlusIcon />, shortcut: 'K' },
    ],
  },
  {
    id: 'measure',
    label: 'Medición',
    tools: [
      { type: 'calibrate', label: 'Calibrar escala por página', short: 'Calibrar', icon: <Scale size={18} />, testId: 'tool-calibrate' },
      { type: 'length', label: 'Medición de longitud (Shift+Alt+L)', short: 'Longitud', icon: <Ruler size={18} />, testId: 'tool-measure-length', shortcut: 'Shift+Alt+L' },
      {
        type: 'polylineMeasure',
        label: 'Polilongitud (Shift+Alt+Q)',
        short: 'Polilongitud',
        icon: svgIcon(
          <>
            <polyline points="3 17 9 11 13 15 21 7" />
            <path d="M18 7h3v3" />
          </>
        ),
        testId: 'tool-measure-polyline',
        shortcut: 'Shift+Alt+Q',
      },
      {
        type: 'area',
        label: 'Área (Shift+Alt+A): clic por vértice, Enter o doble clic para cerrar',
        short: 'Área',
        icon: svgIcon(
          <>
            <polygon points="4 6 14 3 21 11 16 21 5 17" />
            <path d="M8 10l6 6" strokeDasharray="2 2" />
          </>
        ),
        testId: 'tool-measure-area',
        shortcut: 'Shift+Alt+A',
      },
      { type: 'count', label: 'Conteo (Shift+Alt+C)', short: 'Conteo', icon: <Hash size={18} />, testId: 'tool-measure-count', shortcut: 'Shift+Alt+C' },
    ],
  },
];

export const ALL_TOOLS: ToolDefinition[] = TOOL_GROUPS.flatMap((g) => g.tools);

/** Herramientas que trabajan sobre el texto real de la página (requieren capa de texto). */
export const TEXT_LAYER_TOOLS: ToolType[] = ['highlightText', 'underline', 'strikeOut'];

export const STROKE_COLORS = ['#e02424', '#0284c7', '#16a34a', '#d97706', '#9333ea', '#111827'];
