import { v4 as uuidv4 } from 'uuid';
import { Markup, MarkupPoint, ViewportTransform } from '../../types/markup';
import { ToolChestTool, RecentTool } from '../../types/toolChest';
import { screenToNormalized, getStickyNoteNormalizedSize } from '../../utils/coordinates';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useToolChestStore } from '../../store/useToolChestStore';
import { countMeasurement } from '../../core/markup/countSymbols';
import {
  calculateLength,
  calculateArea,
  calculatePerimeter,
  calculateVolume,
} from '../../core/measurements/calculate';

export interface PlaceDroppedToolParams {
  rawData: string;
  screenX: number;
  screenY: number;
  viewportTransform: ViewportTransform;
  pageViewport: { width: number; height: number };
  scale: number;
  currentPageIndex: number;
  activeLayer?: string;
  author?: string;
  addMarkup: (markup: Markup) => void;
  setSelectedMarkupIds: (ids: string[]) => void;
}

/**
 * Coloca una herramienta arrastrada desde el Tool Chest sobre el lienzo (ADR-0078).
 * Extraído en módulo dinámico para mantener el chunk principal de la aplicación
 * por debajo del umbral estricto de 800 kB sin comprometer funcionalidad ni reactividad.
 */
export function placeDroppedTool(params: PlaceDroppedToolParams): void {
  const {
    rawData,
    screenX,
    screenY,
    viewportTransform,
    pageViewport,
    scale,
    currentPageIndex,
    activeLayer,
    author,
    addMarkup,
    setSelectedMarkupIds,
  } = params;

  try {
    const tool = JSON.parse(rawData) as ToolChestTool | RecentTool;
    if (!tool || !tool.type) return;

    // Convertir punto de caída a coordenadas normalizadas [0..1]
    const normCenter = screenToNormalized(screenX, screenY, viewportTransform);

    const unscaledW = pageViewport.width / (scale || 1.0);
    const unscaledH = pageViewport.height / (scale || 1.0);

    // Dimensiones estándar en pantalla (120x60 px) proyectadas a espacio normalizado
    const widthNorm = 120 / (viewportTransform.width * (viewportTransform.scale || 1.0));
    const heightNorm = 60 / (viewportTransform.height * (viewportTransform.scale || 1.0));

    let points: MarkupPoint[] = [];
    let leaders: MarkupPoint[][] | undefined = undefined;

    if (tool.points && tool.points.length > 0) {
      const cx = tool.points.reduce((acc, p) => acc + p.x, 0) / tool.points.length;
      const cy = tool.points.reduce((acc, p) => acc + p.y, 0) / tool.points.length;
      const dx = normCenter.x - cx;
      const dy = normCenter.y - cy;
      points = tool.points.map((p) => ({
        x: Math.max(0, Math.min(1, p.x + dx)),
        y: Math.max(0, Math.min(1, p.y + dy)),
      }));
    } else {
      switch (tool.type) {
        case 'count': {
          points = [{ x: normCenter.x, y: normCenter.y }];
          break;
        }

        case 'length': {
          const halfW = widthNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: normCenter.y },
            { x: Math.min(1, normCenter.x + halfW), y: normCenter.y },
          ];
          break;
        }

        case 'area':
        case 'volume':
        case 'perimeter': {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
            { x: Math.max(0, normCenter.x - halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }

        case 'rectangle':
        case 'circle':
        case 'highlight':
        case 'highlightVector':
        case 'highlightText':
        case 'stamp': {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }

        case 'line': {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y + halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.max(0, normCenter.y - halfH) },
          ];
          break;
        }

        case 'cloud':
        case 'cloudPlus': {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }

        case 'stickyNote': {
          const normSize = getStickyNoteNormalizedSize({ width: unscaledW, height: unscaledH });
          points = [
            {
              x: Math.max(0, normCenter.x - normSize.width / 2),
              y: Math.max(0, normCenter.y - normSize.height / 2),
            },
          ];
          break;
        }

        case 'callout': {
          const boxW = Math.max(0.12, widthNorm);
          const boxH = Math.max(0.04, heightNorm);
          const boxP1 = {
            x: Math.min(1 - boxW, normCenter.x + 0.04),
            y: Math.max(0, normCenter.y - boxH - 0.02),
          };
          const boxP2 = { x: boxP1.x + boxW, y: boxP1.y + boxH };
          points = [boxP1, boxP2];
          leaders = [[{ x: normCenter.x, y: normCenter.y }]];
          break;
        }

        case 'text': {
          const halfW = widthNorm / 2;
          const textHeightNorm = 30 / (viewportTransform.height * (viewportTransform.scale || 1.0));
          const halfH = textHeightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }

        case 'polygon': {
          const rW = widthNorm / 2;
          const rH = heightNorm / 2;
          points = [
            { x: normCenter.x, y: normCenter.y - rH },
            { x: normCenter.x + rW, y: normCenter.y },
            { x: normCenter.x, y: normCenter.y + rH },
            { x: normCenter.x - rW, y: normCenter.y },
          ];
          break;
        }

        case 'freehand': {
          const rW = widthNorm / 2;
          const strokeCurveNorm = 10 / (viewportTransform.height * (viewportTransform.scale || 1.0));
          points = [
            { x: normCenter.x - rW, y: normCenter.y },
            { x: normCenter.x - rW / 2, y: normCenter.y - strokeCurveNorm },
            { x: normCenter.x + rW / 2, y: normCenter.y + strokeCurveNorm },
            { x: normCenter.x + rW, y: normCenter.y },
          ];
          break;
        }

        default: {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }
      }
    }

    let measurement: Markup['measurement'] = undefined;
    const pageDimsPt = { width: unscaledW, height: unscaledH };
    const calib = useCalibrationStore.getState().getEffectiveCalibration(currentPageIndex, points);

    if (tool.type === 'count') {
      measurement = countMeasurement(points.length);
    } else if (tool.type === 'length' && points.length >= 2) {
      measurement = calculateLength(points, pageDimsPt, calib);
    } else if (tool.type === 'area' && points.length >= 3) {
      measurement = calculateArea(points, pageDimsPt, calib, false);
    } else if (tool.type === 'perimeter' && points.length >= 3) {
      measurement = calculatePerimeter(points, pageDimsPt, calib);
    } else if (tool.type === 'volume' && points.length >= 3) {
      const depth = Number(tool.customFields?.volumeDepth ?? 1);
      measurement = calculateVolume(points, pageDimsPt, calib, depth);
    } else if (tool.measurement) {
      measurement = { ...tool.measurement };
    }

    let cost: number | undefined;
    if (tool.unitPrice !== undefined) {
      const qty = tool.type === 'count' ? points.length : (measurement?.value ?? 1);
      cost = Math.round(qty * Math.round(tool.unitPrice * 100)) / 100;
    }

    const now = new Date().toISOString();
    const newId = uuidv4();
    const newMarkup: Markup = {
      id: newId,
      type: tool.type,
      pageIndex: currentPageIndex,
      points,
      leaders,
      text:
        tool.text ||
        (measurement ? measurement.formatted : undefined) ||
        (tool.type === 'callout'
          ? 'Note'
          : tool.type === 'text'
          ? 'Text'
          : undefined),
      textFormat: tool.textFormat ? { ...tool.textFormat } : undefined,
      style: { ...tool.style },
      author: author || 'Reviewer',
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      layer: tool.layer || activeLayer,
      subject: tool.subject,
      unitPrice: tool.unitPrice,
      cost,
      measurement,
      customFields: {
        ...(tool.customFields ? { ...tool.customFields } : {}),
        ...(tool.type === 'count' && !tool.customFields?.countSymbol
          ? { countSymbol: 'check', countScale: 100 }
          : {}),
      },
    };
    if (newMarkup.customFields && Object.keys(newMarkup.customFields).length === 0) {
      delete newMarkup.customFields;
    }

    // Invocación única de addMarkup (genera un único comando de historial reversible con Ctrl+Z)
    addMarkup(newMarkup);
    setSelectedMarkupIds([newId]);

    // Registro asíncrono no bloqueante en Herramientas Recientes
    useToolChestStore.getState().recordRecent(newMarkup);
  } catch (err) {
    console.warn('Error al colocar herramienta desde Tool Chest:', err);
  }
}
