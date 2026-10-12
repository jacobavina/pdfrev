export const VALID_MARKUP_TYPES = [
  'line',
  'rectangle',
  'circle',
  'polygon',
  'polyLine',
  'cloud',
  'cloudPlus',
  'callout',
  'text',
  'stickyNote',
  'freehand',
  'highlight', // Legacy de Fase 1
  'highlightVector',
  'highlightText',
  'underline',
  'strikeOut',
  'stamp',
  // Cota con texto propio (ADR-0020): p1, p2 acotados y p3 sobre la línea de cota
  'dimension',
  // Enlaces, adjuntos y campos de formulario (ADR-0027)
  'link',
  'fileAttachment',
  'formField',
  // Herramientas de Medición y Takeoff (Paquete 4)
  'length',
  'polylineMeasure',
  'area',
  'count',
] as const;

export type MarkupType = (typeof VALID_MARKUP_TYPES)[number];

export const VALID_MEASUREMENT_UNITS = ['m', 'cm', 'mm', 'ft', 'in'] as const;
export type MeasurementUnit = (typeof VALID_MEASUREMENT_UNITS)[number];

export interface PageCalibration {
  scale: number; // Unidades del mundo real por punto PDF
  unit: MeasurementUnit;
  precision?: number; // Número de decimales para mostrar (default: 2)
  rawInputLength?: number;
  rawInputUnit?: MeasurementUnit;
  ptDistance?: number;
  /** Escala vertical distinta (ADR-0025, "Separate Y Scale"); si falta, igual a `scale`. */
  scaleY?: number;
  /** Presentación: pies-pulgadas (unit 'ft') o pulgadas fraccionarias (unit 'in'); por defecto decimales. */
  format?: 'decimal' | 'ftin' | 'fraction';
  /** Denominador de la fracción de pulgada (2, 4, 8, 16…) cuando la presentación es fraccionaria. */
  fractionDenominator?: number;
  /** Relación "papel = real" con que se definió la escala (para mostrarla y editarla). */
  ratio?: {
    paperValue: number;
    paperUnit: 'mm' | 'cm' | 'in' | 'pt';
    realValue: number;
    realUnit: 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'ftin';
    y?: { paperValue: number; paperUnit: 'mm' | 'cm' | 'in' | 'pt'; realValue: number; realUnit: 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'ftin' };
  };
  presetId?: string;
}

export interface MarkupMeasurement {
  value: number;
  unit: MeasurementUnit;
  formatted: string;
  perimeter?: number;
  countIndex?: number;
}

export const VALID_MARKUP_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'completed',
  'cancelled',
] as const;

export type MarkupStatus = (typeof VALID_MARKUP_STATUSES)[number];

export const HIGHLIGHT_STYLE = {
  colorHex: '#ffff00',
  opacity: 0.5,
  rgb: { r: 1, g: 1, b: 0 },
  mixBlendMode: 'multiply' as const,
} as const;

export const STICKY_NOTE_SIZE_PT = 24;

export interface StickyNoteColorPreset {
  name: 'yellow' | 'green' | 'pink' | 'blue';
  label: string;
  fillColor: string;
  strokeColor: string;
}

export const STICKY_NOTE_COLORS: Record<'yellow' | 'green' | 'pink' | 'blue', StickyNoteColorPreset> = {
  yellow: {
    name: 'yellow',
    label: 'Amarillo',
    fillColor: '#fef08a',
    strokeColor: '#ca8a04',
  },
  green: {
    name: 'green',
    label: 'Verde',
    fillColor: '#bbf7d0',
    strokeColor: '#16a34a',
  },
  pink: {
    name: 'pink',
    label: 'Rosa',
    fillColor: '#fbcfe8',
    strokeColor: '#db2777',
  },
  blue: {
    name: 'blue',
    label: 'Azul',
    fillColor: '#bae6fd',
    strokeColor: '#0284c7',
  },
};

export const DEFAULT_STICKY_NOTE_COLOR = STICKY_NOTE_COLORS.yellow;

export interface MarkupPoint {
  x: number; // 0..1 normalized coordinate
  y: number; // 0..1 normalized coordinate
}

export type LineEndingStyle =
  | 'none'
  | 'openArrow'
  | 'closedArrow'
  | 'circle'
  | 'square'
  | 'diamond'
  | 'butt'
  | 'slash';

export interface MarkupStyle {
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  opacity: number;
  dashArray?: number[];
  fontFamily?: string;
  fontSize?: number;
  lineEndingStart?: LineEndingStyle;
  lineEndingEnd?: LineEndingStyle;
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

  // Extensiones Fase 2 y 3
  groupId?: string; // A.2 (Cloud+ y agrupaciones)
  leaders?: MarkupPoint[][]; // A.3 (Directrices múltiples para Callout)
  textFormat?: MarkupTextFormat; // A.4 (Formato de texto enriquecido/alineación)
  stampId?: string; // D.2 (Identificador de catálogo de sello)
  resolvedFields?: Record<string, string>; // D.2 (Campos dinámicos {{fecha}}, etc.)
  locked?: boolean; // P3-H.5: Bloqueo de marca contra edición, arrastre y eliminación accidental
  measurement?: MarkupMeasurement; // Paquete 4: Datos de medición para takeoff
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
  /** Zoom del visor (px por pt) cuando width/height ya están en píxeles de pantalla y scale = 1. */
  zoom?: number;
  /** Oculta el valor de las mediciones sobre el plano ("Show Result Information" desactivado). */
  hideMeasureLabels?: boolean;
}

export const CANONICAL_CUSTOM_COLUMN_TYPES = [
  'text',
  'number',
  'choice',
  'formula',
] as const;

export type BbxCustomColumnType = (typeof CANONICAL_CUSTOM_COLUMN_TYPES)[number];

export const VALID_CUSTOM_COLUMN_TYPES = CANONICAL_CUSTOM_COLUMN_TYPES;

export const CUSTOM_COLUMN_TYPE_ALIASES: Record<string, BbxCustomColumnType> = {
  text: 'text',
  texto: 'text',
  number: 'number',
  número: 'number',
  numero: 'number',
  choice: 'choice',
  opción: 'choice',
  opcion: 'choice',
  formula: 'formula',
  calculada: 'formula',
};

export const MAX_CUSTOM_COLUMNS = 50;
export const MAX_CUSTOM_FIELDS_PER_MARKUP = 50;

export interface BbxCustomColumn {
  id: string;
  nombre: string;
  tipo: BbxCustomColumnType;
  opciones?: string[];
  expresion?: string;
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
  customColumns?: BbxCustomColumn[];
}

export interface BbxMigrationResult {
  document: BbxDocumentFile;
  warnings: string[];
}

/**
 * Migrador y validador estricto para archivos .bbx.json
 * Convierte esquemas v1.0.0 a v1.1.0 sin pérdida de datos.
 * Rechaza versiones futuras o incompatibles para evitar corrupción silenciosa.
 * Retorna el documento normalizado y la lista de avisos (warnings) por datos degradados o descartados.
 */
export function migrateBbxDocument(raw: unknown): BbxMigrationResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid .bbx.json format: a JSON object was expected');
  }

  const obj = raw as Record<string, unknown>;
  const warnings: string[] = [];

  // P1: Validación de versión
  const version = typeof obj.version === 'string' ? obj.version : '1.0.0';
  if (version !== '1.0.0' && version !== '1.1.0') {
    throw new Error(
      `File created by a newer or incompatible version of the application (v${version})`
    );
  }

  const pdfFileName = typeof obj.pdfFileName === 'string' ? obj.pdfFileName : 'document.pdf';
  const lastSavedAt =
    typeof obj.lastSavedAt === 'string' ? obj.lastSavedAt : new Date().toISOString();
  const author = typeof obj.author === 'string' ? obj.author : 'Desconocido';
  const pdfFileSize = typeof obj.pdfFileSize === 'number' ? obj.pdfFileSize : undefined;

  // Validación y preservación de customColumns (Z.2)
  let customColumns: BbxCustomColumn[] | undefined;
  if ('customColumns' in obj && obj.customColumns !== undefined) {
    if (!Array.isArray(obj.customColumns)) {
      warnings.push('The "customColumns" field is not a valid array; discarded');
    } else {
      const validCols: BbxCustomColumn[] = [];
      let limitExceeded = false;
      for (let i = 0; i < obj.customColumns.length; i++) {
        const col = obj.customColumns[i];
        if (!col || typeof col !== 'object' || Array.isArray(col)) {
          warnings.push(`Custom column at index ${i} discarded: not a valid object`);
          continue;
        }
        const colObj = col as Record<string, unknown>;
        const id = typeof colObj.id === 'string' ? colObj.id.trim() : '';
        const nombre = typeof colObj.nombre === 'string' ? colObj.nombre.trim() : '';
        const tipoRaw = typeof colObj.tipo === 'string' ? colObj.tipo.trim() : '';

        if (!id || id.length > 100 || id === '__proto__' || id === 'constructor' || id === 'prototype') {
          warnings.push(`Custom column at index ${i} discarded: invalid or unsafe "id"`);
          continue;
        }

        if (!nombre || nombre.length > 100) {
          warnings.push(`Custom column "${id}" discarded: invalid "nombre" or too long`);
          continue;
        }

        const normalizedTipo = CUSTOM_COLUMN_TYPE_ALIASES[tipoRaw.toLowerCase()];
        if (!normalizedTipo) {
          warnings.push(`Custom column "${id}" discarded: unknown type "${tipoRaw}"`);
          continue;
        }

        if (validCols.length >= MAX_CUSTOM_COLUMNS) {
          limitExceeded = true;
          continue;
        }

        const validCol: BbxCustomColumn = {
          id,
          nombre,
          tipo: normalizedTipo,
        };

        if (Array.isArray(colObj.opciones)) {
          validCol.opciones = colObj.opciones.filter(
            (op): op is string => typeof op === 'string' && op.length > 0 && op.length <= 200
          );
        }

        if (typeof colObj.expresion === 'string' && colObj.expresion.length <= 1000) {
          validCol.expresion = colObj.expresion;
        }

        validCols.push(validCol);
      }

      if (limitExceeded) {
        warnings.push(
          `Custom column limit exceeded (${MAX_CUSTOM_COLUMNS}); keeping the first ${MAX_CUSTOM_COLUMNS}`
        );
      }

      if (validCols.length > 0) {
        customColumns = validCols;
      } else if (obj.customColumns.length === 0) {
        customColumns = [];
      }
    }
  }

  const rawMarkups = Array.isArray(obj.markups) ? obj.markups : [];
  if ('markups' in obj && !Array.isArray(obj.markups)) {
    warnings.push('The "markups" field is not a valid array; initialized as empty');
  }

  const markups: Markup[] = rawMarkups.map((m: unknown, idx: number) => {
    const item = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    const markupId = typeof item.id === 'string' && item.id.length > 0 ? item.id : `markup-${idx}`;

    // P1: Validación de tipo conocido (Z.2: aviso explícito ante degradación)
    const itemType = typeof item.type === 'string' ? item.type : '';
    let type: MarkupType;
    if (VALID_MARKUP_TYPES.includes(itemType as MarkupType)) {
      type = itemType as MarkupType;
    } else {
      type = 'rectangle';
      warnings.push(
        `Unknown markup type "${itemType || String(item.type)}" downgraded to "rectangle" in markup "${markupId}"`
      );
    }

    // P1: Validación de estado conocido (Z.2: aviso explícito ante degradación; cancelled se conserva)
    const itemStatus = typeof item.status === 'string' ? item.status : '';
    let status: MarkupStatus;
    if (VALID_MARKUP_STATUSES.includes(itemStatus as MarkupStatus)) {
      status = itemStatus as MarkupStatus;
    } else {
      status = 'pending';
      warnings.push(
        `Unknown markup status "${itemStatus || String(item.status)}" downgraded to "pending" in markup "${markupId}"`
      );
    }

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

    // Validación y saneamiento de customFields (Z.2)
    let customFields: Record<string, string | number> | undefined;
    if ('customFields' in item && item.customFields !== undefined && item.customFields !== null) {
      if (typeof item.customFields !== 'object' || Array.isArray(item.customFields)) {
        warnings.push(
          `customFields in markup "${markupId}" is not a valid object; discarded`
        );
      } else {
        const rawEntries = Object.entries(item.customFields as Record<string, unknown>);
        const sanitized: Record<string, string | number> = {};
        let fieldsLimitExceeded = false;
        let validFieldsCount = 0;
        for (const [k, v] of rawEntries) {
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
            warnings.push(
              `Forbidden key "${k}" in customFields discarded in markup "${markupId}"`
            );
            continue;
          }
          if (k.length === 0 || k.length > 100) {
            warnings.push(
              `customFields key exceeds the allowed length (1-100 characters) in markup "${markupId}"`
            );
            continue;
          }

          let validVal: string | number | undefined;
          if (typeof v === 'number') {
            if (Number.isFinite(v)) {
              validVal = v;
            } else {
              warnings.push(
                `Non-finite numeric value for field "${k}" discarded in markup "${markupId}"`
              );
            }
          } else if (typeof v === 'string') {
            if (v.length <= 2000) {
              validVal = v;
            } else {
              warnings.push(
                `String value for field "${k}" exceeds the allowed length in markup "${markupId}"`
              );
            }
          } else {
            warnings.push(
              `Data type not allowed (${typeof v}) for field "${k}" discarded in markup "${markupId}"`
            );
          }

          if (validVal !== undefined) {
            if (validFieldsCount >= MAX_CUSTOM_FIELDS_PER_MARKUP) {
              fieldsLimitExceeded = true;
            } else {
              sanitized[k] = validVal;
              validFieldsCount++;
            }
          }
        }

        if (fieldsLimitExceeded) {
          warnings.push(
            `Custom fields limit per markup exceeded (${MAX_CUSTOM_FIELDS_PER_MARKUP}) in markup "${markupId}"; keeping the first ${MAX_CUSTOM_FIELDS_PER_MARKUP}`
          );
        }

        if (Object.keys(sanitized).length > 0) {
          customFields = sanitized;
        }
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
      customFields,
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
      locked: typeof item.locked === 'boolean' ? item.locked : undefined,
      measurement:
        item.measurement && typeof item.measurement === 'object'
          ? {
              value: typeof (item.measurement as Record<string, unknown>).value === 'number'
                ? (item.measurement as Record<string, unknown>).value as number
                : 0,
              unit: (item.measurement as Record<string, unknown>).unit as any,
              formatted: String((item.measurement as Record<string, unknown>).formatted || ''),
              ...(typeof (item.measurement as Record<string, unknown>).perimeter === 'number'
                ? { perimeter: (item.measurement as Record<string, unknown>).perimeter as number }
                : {}),
              ...(typeof (item.measurement as Record<string, unknown>).countIndex === 'number'
                ? { countIndex: (item.measurement as Record<string, unknown>).countIndex as number }
                : {}),
            }
          : undefined,
    };
  });

  return {
    document: {
      version: '1.1.0',
      pdfFileName,
      pdfFileSize,
      lastSavedAt,
      author,
      markups,
      ...(customColumns !== undefined ? { customColumns } : {}),
    },
    warnings,
  };
}
