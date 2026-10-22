import React from 'react';
import { MousePointer, Hand, ZoomIn, ListOrdered } from 'lucide-react';
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
  SquigglyIcon,
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
  PerimeterMeasureIcon,
  AngleMeasureIcon,
  RadiusMeasureIcon,
  DiameterMeasureIcon,
  VolumeMeasureIcon,
  TypewriterIcon,
  PolygonCutoutIcon,
  EllipseCutoutIcon,
  EraserIcon,
  ArcIcon,
  SnapshotIcon,
} from './customIcons';
import { ToolType } from '../../store/useToolStore';
import { MARKUP_COLORS } from '../../core/markup/palette';

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
      { type: 'pan', label: 'Pan (Shift+V, or hold Space)', short: 'Pan', icon: <Hand size={18} />, shortcut: 'Shift+V' },
      { type: 'zoom', label: 'Zoom Window (Z)', short: 'Zoom', icon: <ZoomIn size={18} />, shortcut: 'Z', testId: 'tool-zoom' },
      { type: 'snapshot', label: 'Snapshot (G)', short: 'Snapshot', icon: <SnapshotIcon size={18} />, shortcut: 'G', testId: 'tool-snapshot' },
    ],
  },
  {
    id: 'text',
    label: 'Text & Review',
    tools: [
      { type: 'text', label: 'Text Box (T)', short: 'Text', icon: <TextBoxIcon />, shortcut: 'T' },
      { type: 'typewriter', label: 'Typewriter (W)', short: 'Typewriter', icon: <TypewriterIcon />, shortcut: 'W' },
      { type: 'callout', label: 'Callout (Q)', short: 'Callout', icon: <CalloutIcon />, shortcut: 'Q' },
      { type: 'stickyNote', label: 'Note (N)', short: 'Note', icon: <NoteIcon />, shortcut: 'N' },
      { type: 'sequence', label: 'Numbered Sequence', short: 'Sequence', icon: <ListOrdered size={18} />, testId: 'tool-sequence' },
      { type: 'highlightText', label: 'Text Highlight (Shift+H)', short: 'Highlight', icon: <TextHighlightIcon />, shortcut: 'Shift+H' },
      { type: 'underline', label: 'Underline (U)', short: 'Underline', icon: <UnderlineIcon />, shortcut: 'U' },
      { type: 'squiggly', label: 'Squiggly (Shift+U)', short: 'Squiggly', icon: <SquigglyIcon />, shortcut: 'Shift+U' },
      { type: 'strikeOut', label: 'Strikethrough (D)', short: 'Strike', icon: <StrikeoutIcon />, shortcut: 'D' },
    ],
  },
  {
    id: 'draw',
    label: 'Draw',
    tools: [
      { type: 'freehand', label: 'Pen (P)', short: 'Pen', icon: <PenIcon />, shortcut: 'P' },
      { type: 'highlightVector', label: 'Highlight (H)', short: 'Highlighter', icon: <HighlighterIcon />, shortcut: 'H' },
      { type: 'eraser', label: 'Eraser (Shift+E)', short: 'Eraser', icon: <EraserIcon />, shortcut: 'Shift+E' },
      { type: 'line', label: 'Line (L)', short: 'Line', icon: <LineToolIcon />, shortcut: 'L' },
      { type: 'arrow', label: 'Arrow (A)', short: 'Arrow', icon: <ArrowToolIcon />, shortcut: 'A' },
      { type: 'arc', label: 'Arc (Shift+C)', short: 'Arc', icon: <ArcIcon />, shortcut: 'Shift+C' },
      { type: 'dimension', label: 'Dimension (Shift+L)', short: 'Dimension', icon: <DimensionIcon />, shortcut: 'Shift+L' },
      { type: 'polyLine', label: 'Polyline (Shift+N)', short: 'Polyline', icon: <PolylineToolIcon />, shortcut: 'Shift+N' },
      { type: 'rectangle', label: 'Rectangle (R)', short: 'Rectangle', icon: <RectangleToolIcon />, shortcut: 'R' },
      { type: 'circle', label: 'Ellipse (E)', short: 'Ellipse', icon: <EllipseToolIcon />, shortcut: 'E' },
      { type: 'polygon', label: 'Polygon (Shift+P)', short: 'Polygon', icon: <PolygonToolIcon />, shortcut: 'Shift+P' },
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
      {
        type: 'perimeter',
        label: 'Perimeter (Shift+Alt+P): click each vertex, Enter or double-click to close',
        short: 'Perimeter',
        icon: <PerimeterMeasureIcon />,
        testId: 'tool-measure-perimeter',
        shortcut: 'Shift+Alt+P',
      },
      {
        type: 'volume',
        label: 'Volume (Shift+Alt+V): area times depth',
        short: 'Volume',
        icon: <VolumeMeasureIcon />,
        testId: 'tool-measure-volume',
        shortcut: 'Shift+Alt+V',
      },
      { type: 'angle', label: 'Angle (Shift+Alt+G): three clicks', short: 'Angle', icon: <AngleMeasureIcon />, testId: 'tool-measure-angle', shortcut: 'Shift+Alt+G' },
      { type: 'radius', label: 'Radius (Shift+Alt+U): center, then edge', short: 'Radius', icon: <RadiusMeasureIcon />, testId: 'tool-measure-radius', shortcut: 'Shift+Alt+U' },
      { type: 'diameter', label: 'Diameter (Shift+Alt+D): edge to edge', short: 'Diameter', icon: <DiameterMeasureIcon />, testId: 'tool-measure-diameter', shortcut: 'Shift+Alt+D' },
      { type: 'count', label: 'Count (Shift+Alt+C)', short: 'Count', icon: <CountMeasureIcon />, testId: 'tool-measure-count', shortcut: 'Shift+Alt+C' },
      {
        type: 'polygonCutout',
        label: 'Polygon Cutout (Shift+Alt+K)',
        short: 'PolyCutout',
        icon: <PolygonCutoutIcon />,
        testId: 'tool-measure-polygon-cutout',
        shortcut: 'Shift+Alt+K',
      },
      {
        type: 'ellipseCutout',
        label: 'Ellipse Cutout',
        short: 'EllipseCutout',
        icon: <EllipseCutoutIcon />,
        testId: 'tool-measure-ellipse-cutout',
      },
    ],
  },
];

export const ALL_TOOLS: ToolDefinition[] = TOOL_GROUPS.flatMap((g) => g.tools);

/** Herramientas que trabajan sobre el texto real de la página (requieren capa de texto). */
export const TEXT_LAYER_TOOLS: ToolType[] = ['highlightText', 'underline', 'strikeOut', 'squiggly'];

/** Paleta de color de línea (ADR-0065: definida en el núcleo, es dato del documento). */
export const STROKE_COLORS = MARKUP_COLORS;
