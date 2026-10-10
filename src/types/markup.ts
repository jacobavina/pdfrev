export const VALID_MARKUP_TYPES = [
  'line',
  'rectangle',
  'circle',
  'polygon',
  'cloud',
  'cloudPlus',
  'callout',
  'text',
  'stickyNote',
  'freehand',
  'highlight', // Legacy de Fase 1
  'highlightVector',
  'highlightText',
  'stamp',
] as const;

export type MarkupType = (typeof VALID_MARKUP_TYPES)[number];

export const VALID_MARKUP_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'completed',
] as const;

export type MarkupStatus = (typeof VALID_MARKUP_STATUSES)[number];

export const HIGHLIGHT_STYLE = {
  colorHex: '#ffff00',
  opacity: 0.5,
  rgb: { r: 1, g: 1, b: 0 },
  mixBlendMode: 'multiply' as const,
} as const;

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
 * Migrador y validador estricto para archivos .bbx.json
 * Convierte esquemas v1.0.0 a v1.1.0 sin pérdida de datos.
 * Rechaza versiones futuras o incompatibles para evitar corrupción silenciosa.
 */
export function migrateBbxDocument(raw: unknown): BbxDocumentFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Formato .bbx.json inválido: se esperaba un objeto JSON');
  }

  const obj = raw as Record<string, unknown>;

  // P1: Validación de versión
  const version = typeof obj.version === 'string' ? obj.version : '1.0.0';
  if (version !== '1.0.0' && version !== '1.1.0') {
    throw new Error(
      `Archivo creado por una versión más reciente o incompatible de la aplicación (v${version})`
    );
  }

  const pdfFileName = typeof obj.pdfFileName === 'string' ? obj.pdfFileName : 'document.pdf';
  const lastSavedAt =
    typeof obj.lastSavedAt === 'string' ? obj.lastSavedAt : new Date().toISOString();
  const author = typeof obj.author === 'string' ? obj.author : 'Desconocido';
  const pdfFileSize = typeof obj.pdfFileSize === 'number' ? obj.pdfFileSize : undefined;

  const rawMarkups = Array.isArray(obj.markups) ? obj.markups : [];
  const markups: Markup[] = rawMarkups.map((m: unknown) => {
    const item = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;

    // P1: Validación de tipo conocido
    const itemType = typeof item.type === 'string' ? item.type : '';
    const type: MarkupType = VALID_MARKUP_TYPES.includes(itemType as MarkupType)
      ? (itemType as MarkupType)
      : 'rectangle';

    // P1: Validación de estado conocido (cae a 'pending' para evitar que statusInfo sea undefined)
    const itemStatus = typeof item.status === 'string' ? item.status : '';
    const status: MarkupStatus = VALID_MARKUP_STATUSES.includes(itemStatus as MarkupStatus)
      ? (itemStatus as MarkupStatus)
      : 'pending';

    // P1: Validación estricta de points (solo números finitos, nunca NaN ni cadenas)
    const rawPoints = Array.isArray(item.points) ? item.points : [];
    const points: MarkupPoint[] = [];
    for (const p of rawPoints) {
      if (
        p &&
        typeof p === 'object' &&
        'x' in p &&
        'y' in p &&
        typeof (p as Record<string, unknown>).x === 'number' &&
        Number.isFinite((p as Record<string, unknown>).x) &&
        typeof (p as Record<string, unknown>).y === 'number' &&
        Number.isFinite((p as Record<string, unknown>).y)
      ) {
        points.push({
          x: Math.max(0, Math.min(1, (p as Record<string, unknown>).x as number)),
          y: Math.max(0, Math.min(1, (p as Record<string, unknown>).y as number)),
        });
      }
    }

    // P1: Validación de leaders para Callout (si existen)
    let leaders: MarkupPoint[][] | undefined;
    if (Array.isArray(item.leaders)) {
      leaders = [];
      for (const line of item.leaders) {
        if (Array.isArray(line)) {
          const validLine: MarkupPoint[] = [];
          for (const lp of line) {
            if (
              lp &&
              typeof lp === 'object' &&
              typeof (lp as Record<string, unknown>).x === 'number' &&
              Number.isFinite((lp as Record<string, unknown>).x) &&
              typeof (lp as Record<string, unknown>).y === 'number' &&
              Number.isFinite((lp as Record<string, unknown>).y)
            ) {
              validLine.push({
                x: Math.max(0, Math.min(1, (lp as Record<string, unknown>).x as number)),
                y: Math.max(0, Math.min(1, (lp as Record<string, unknown>).y as number)),
              });
            }
          }
          if (validLine.length > 0) {
            leaders.push(validLine);
          }
        }
      }
      if (leaders.length === 0) leaders = undefined;
    }

    return {
      id: typeof item.id === 'string' && item.id.length > 0 ? item.id : 'unknown',
      type,
      pageIndex:
        typeof item.pageIndex === 'number' && Number.isFinite(item.pageIndex) && item.pageIndex >= 0
          ? Math.floor(item.pageIndex)
          : 0,
      points,
      style: (item.style && typeof item.style === 'object' ? item.style : {
        strokeColor: '#e02424',
        strokeWidth: 2,
        opacity: 1,
      }) as Markup['style'],
      text: typeof item.text === 'string' ? item.text : undefined,
      author: typeof item.author === 'string' ? item.author : author,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : lastSavedAt,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : lastSavedAt,
      status,
      layer: typeof item.layer === 'string' ? item.layer : undefined,
      customFields:
        item.customFields && typeof item.customFields === 'object'
          ? (item.customFields as Record<string, string | number>)
          : undefined,
      groupId: typeof item.groupId === 'string' ? item.groupId : undefined,
      leaders,
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
