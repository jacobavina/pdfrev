import React from 'react';
import { MousePointer, Hand } from 'lucide-react';
import {
  CloudIcon,
  CloudPlusIcon,
  DimensionIcon,
  LineToolIcon,
  ArrowToolIcon,
  TextBoxIcon,
  CalloutIcon,
  NoteIcon,
  TextHighlightIcon,
  UnderlineIcon,
  StrikeoutIcon,
  PenIcon,
  HighlighterIcon,
  PolylineToolIcon,
  RectangleToolIcon,
  EllipseToolIcon,
  PolygonToolIcon,
  LengthMeasureIcon,
  PolylengthIcon,
  AreaMeasureIcon,
  CountMeasureIcon,
  CalibrateIcon,
} from './customIcons';
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

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'select',
    label: 'Select',
    tools: [
      { type: 'select', label: 'Select (V)', short: 'Select', icon: <MousePointer size={18} />, shortcut: 'V' },
      { type: 'pan', label: 'Pan (Space)', short: 'Pan', icon: <Hand size={18} />, shortcut: 'Space' },
    ],
  },
  {
    id: 'text',
    label: 'Text & Review',
    tools: [
      { type: 'text', label: 'Text Box (T)', short: 'Text', icon: <TextBoxIcon />, shortcut: 'T' },
      { type: 'callout', label: 'Callout (Q)', short: 'Callout', icon: <CalloutIcon />, shortcut: 'Q' },
      { type: 'stickyNote', label: 'Note (N)', short: 'Note', icon: <NoteIcon />, shortcut: 'N' },
      { type: 'highlightText', label: 'Text Highlight (Shift+H)', short: 'Highlight', icon: <TextHighlightIcon />, shortcut: 'Shift+H' },
      {
        type: 'underline',
        label: 'Underline',
        short: 'Underline',
        icon: <UnderlineIcon />,
      },
      {
        type: 'strikeOut',
        label: 'Strikethrough',
        short: 'Strike',
        icon: <StrikeoutIcon />,
      },
    ],
  },
  {
    id: 'draw',
    label: 'Draw',
    tools: [
      { type: 'freehand', label: 'Pen (F)', short: 'Pen', icon: <PenIcon />, shortcut: 'F' },
      { type: 'highlightVector', label: 'Highlight (H)', short: 'Highlighter', icon: <HighlighterIcon />, shortcut: 'H' },
      { type: 'line', label: 'Line (L)', short: 'Line', icon: <LineToolIcon />, shortcut: 'L' },
      { type: 'arrow', label: 'Arrow (A)', short: 'Arrow', icon: <ArrowToolIcon />, shortcut: 'A' },
      { type: 'dimension', label: 'Dimension (Shift+L)', short: 'Dimension', icon: <DimensionIcon />, shortcut: 'Shift+L' },
      {
        type: 'polyLine',
        label: 'Polyline',
        short: 'Polyline',
        icon: <PolylineToolIcon />,
      },
      { type: 'rectangle', label: 'Rectangle (R)', short: 'Rectangle', icon: <RectangleToolIcon />, shortcut: 'R' },
      { type: 'circle', label: 'Ellipse (O)', short: 'Ellipse', icon: <EllipseToolIcon />, shortcut: 'O' },
      { type: 'polygon', label: 'Polygon (P)', short: 'Polygon', icon: <PolygonToolIcon />, shortcut: 'P' },
      { type: 'cloud', label: 'Cloud (C)', short: 'Cloud', icon: <CloudIcon />, shortcut: 'C' },
      { type: 'cloudPlus', label: 'Cloud+ (K)', short: 'Cloud+', icon: <CloudPlusIcon />, shortcut: 'K' },
    ],
  },
  {
    id: 'measure',
    label: 'Measure',
    tools: [
      { type: 'calibrate', label: 'Calibrate Page Scale', short: 'Calibrate', icon: <CalibrateIcon />, testId: 'tool-calibrate' },
      { type: 'length', label: 'Length (Shift+Alt+L)', short: 'Length', icon: <LengthMeasureIcon />, testId: 'tool-measure-length', shortcut: 'Shift+Alt+L' },
      {
        type: 'polylineMeasure',
        label: 'Polylength (Shift+Alt+Q)',
        short: 'Polylength',
        icon: <PolylengthIcon />,
        testId: 'tool-measure-polyline',
        shortcut: 'Shift+Alt+Q',
      },
      {
        type: 'area',
        label: 'Area (Shift+Alt+A): click each vertex, Enter or double-click to close',
        short: 'Area',
        icon: <AreaMeasureIcon />,
        testId: 'tool-measure-area',
        shortcut: 'Shift+Alt+A',
      },
      { type: 'count', label: 'Count (Shift+Alt+C)', short: 'Count', icon: <CountMeasureIcon />, testId: 'tool-measure-count', shortcut: 'Shift+Alt+C' },
    ],
  },
];

export const ALL_TOOLS: ToolDefinition[] = TOOL_GROUPS.flatMap((g) => g.tools);

/** Herramientas que trabajan sobre el texto real de la página (requieren capa de texto). */
export const TEXT_LAYER_TOOLS: ToolType[] = ['highlightText', 'underline', 'strikeOut'];

export const STROKE_COLORS = ['#e02424', '#0284c7', '#16a34a', '#d97706', '#9333ea', '#111827'];
