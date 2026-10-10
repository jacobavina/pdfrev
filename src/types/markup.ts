export type MarkupType =
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'polygon'
  | 'cloud'
  | 'cloudPlus'
  | 'callout'
  | 'text'
  | 'stickyNote'
  | 'freehand'
  | 'highlight';

export type MarkupStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

export interface MarkupPoint {
  x: number; // 0..1 normalized coordinate
  y: number; // 0..1 normalized coordinate
}

export interface MarkupStyle {
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  opacity: number;
  dashArray?: number[];
  fontFamily?: string;
  fontSize?: number;
}

export interface Markup {
  id: string; // uuid v4
  type: MarkupType;
  pageIndex: number;
  points: MarkupPoint[]; // coords en espacio PDF normalizado (0..1, origen superior-izquierdo)
  style: MarkupStyle;
  text?: string;
  author: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  status: MarkupStatus;
  layer?: string;
  customFields?: Record<string, string | number>;
}

export interface BoundingBox {
  x: number; // top-left x (0..1)
  y: number; // top-left y (0..1)
  width: number; // width (0..1)
  height: number; // height (0..1)
}

export interface ViewportTransform {
  width: number; // Rendered width of the page in CSS pixels (at scale = 1)
  height: number; // Rendered height of the page in CSS pixels (at scale = 1)
  scale: number; // Zoom level (e.g. 1.0, 1.5, 2.0)
  offsetX: number; // Pan offset X
  offsetY: number; // Pan offset Y
}

/**
 * Persisted document data structure (.bbx.json)
 */
export interface BbxDocumentFile {
  version: '1.0.0';
  pdfFileName: string;
  pdfFileSize?: number;
  lastSavedAt: string; // ISO
  author: string;
  markups: Markup[];
}
