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
  | 'highlight' // Legacy de Fase 1
  | 'highlightVector'
  | 'highlightText'
  | 'stamp';

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

export interface MarkupTextFormat {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
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

  // Extensiones Fase 2
  groupId?: string; // A.2 (Cloud+ y agrupaciones)
  leaders?: MarkupPoint[][]; // A.3 (Directrices múltiples para Callout)
  textFormat?: MarkupTextFormat; // A.4 (Formato de texto enriquecido/alineación)
  stampId?: string; // D.2 (Identificador de catálogo de sello)
  resolvedFields?: Record<string, string>; // D.2 (Campos dinámicos {{fecha}}, etc.)
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
  rotation?: number; // 0, 90, 180, 270
}

/**
 * Persisted document data structure (.bbx.json)
 */
export interface BbxDocumentFile {
  version: '1.1.0';
  pdfFileName: string;
  pdfFileSize?: number;
  lastSavedAt: string; // ISO
  author: string;
  markups: Markup[];
}

/**
 * Migrador de compatibilidad hacia atrás para archivos .bbx.json
 * Convierte esquemas v1.0.0 a v1.1.0 sin pérdida de datos.
 */
export function migrateBbxDocument(raw: unknown): BbxDocumentFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Formato .bbx.json inválido: se esperaba un objeto JSON');
  }

  const obj = raw as Record<string, unknown>;

  const pdfFileName = typeof obj.pdfFileName === 'string' ? obj.pdfFileName : 'document.pdf';
  const lastSavedAt =
    typeof obj.lastSavedAt === 'string' ? obj.lastSavedAt : new Date().toISOString();
  const author = typeof obj.author === 'string' ? obj.author : 'Desconocido';
  const pdfFileSize = typeof obj.pdfFileSize === 'number' ? obj.pdfFileSize : undefined;

  const rawMarkups = Array.isArray(obj.markups) ? obj.markups : [];
  const markups: Markup[] = rawMarkups.map((m: unknown) => {
    const item = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    return {
      id: typeof item.id === 'string' ? item.id : 'unknown',
      type: (typeof item.type === 'string' ? item.type : 'rectangle') as MarkupType,
      pageIndex: typeof item.pageIndex === 'number' ? item.pageIndex : 0,
      points: Array.isArray(item.points) ? (item.points as MarkupPoint[]) : [],
      style: (item.style && typeof item.style === 'object' ? item.style : {
        strokeColor: '#e02424',
        strokeWidth: 2,
        opacity: 1,
      }) as Markup['style'],
      text: typeof item.text === 'string' ? item.text : undefined,
      author: typeof item.author === 'string' ? item.author : author,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : lastSavedAt,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : lastSavedAt,
      status: (typeof item.status === 'string' ? item.status : 'pending') as Markup['status'],
      layer: typeof item.layer === 'string' ? item.layer : undefined,
      customFields:
        item.customFields && typeof item.customFields === 'object'
          ? (item.customFields as Record<string, string | number>)
          : undefined,
      groupId: typeof item.groupId === 'string' ? item.groupId : undefined,
      leaders: Array.isArray(item.leaders) ? (item.leaders as MarkupPoint[][]) : undefined,
      textFormat:
        item.textFormat && typeof item.textFormat === 'object'
          ? (item.textFormat as MarkupTextFormat)
          : undefined,
      stampId: typeof item.stampId === 'string' ? item.stampId : undefined,
      resolvedFields:
        item.resolvedFields && typeof item.resolvedFields === 'object'
          ? (item.resolvedFields as Record<string, string>)
          : undefined,
    };
  });

  return {
    version: '1.1.0',
    pdfFileName,
    pdfFileSize,
    lastSavedAt,
    author,
    markups,
  };
}
