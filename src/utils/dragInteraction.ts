import { Markup, MarkupPoint, ViewportTransform } from '../types/markup';
import { MoveMarkupItem } from '../store/useMarkupStore';
import {
  hitTestMarkup,
  clampGroupTranslationDelta,
  translateMarkup,
} from './coordinates';

export interface DragState {
  startScreenX: number;
  startScreenY: number;
  initialMarkups: Markup[];
  hasMovedPastThreshold: boolean;
}

/**
 * Gestiona el evento mousedown en modo selección:
 * - Si impacta una marca con Ctrl -> alterna selección SIN arrastrar.
 * - Si impacta una marca no seleccionada sin Ctrl -> selecciona y prepara arrastre.
 * - Si impacta una marca ya seleccionada sin Ctrl -> prepara arrastre de todas las seleccionadas.
 * - Si no impacta ninguna marca -> deselecciona todo (y no inicia arrastre).
 */
export function handleSelectMouseDown({
  point,
  screenX,
  screenY,
  isCtrl = false,
  isShift = false,
  isCtrlOrShift,
  pageMarkups,
  selectedMarkupIds,
  selectMarkup,
  deselectAll,
  pageDimensions,
}: {
  point: MarkupPoint;
  screenX: number;
  screenY: number;
  isCtrl?: boolean;
  isShift?: boolean;
  isCtrlOrShift?: boolean;
  pageMarkups: Markup[];
  selectedMarkupIds: string[];
  selectMarkup: (id: string, multi: boolean) => void;
  deselectAll: () => void;
  pageDimensions?: { width: number; height: number };
}): DragState | null {
  const isAdditive = Boolean(isCtrlOrShift ?? (isCtrl || isShift));
  const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(point, m, 0.015, pageDimensions));
  if (!hit) {
    if (!isAdditive) {
      deselectAll();
    }
    return null;
  }

  if (isAdditive) {
    // Condición 3 (A.2): Shift y Ctrl alternan selección SIN iniciar arrastre (una sola semántica)
    selectMarkup(hit.id, true);
    return null;
  }

  const isAlreadySelected = selectedMarkupIds.includes(hit.id);
  let markupsToDrag: Markup[];

  if (!isAlreadySelected) {
    // Condición 2: Clic sobre marca no seleccionada -> seleccionar Y arrastrar
    selectMarkup(hit.id, false);
    markupsToDrag = hit.groupId
      ? pageMarkups.filter((m) => m.groupId === hit.groupId)
      : [hit];
  } else {
    // Marca ya seleccionada -> arrastrar todas las marcas seleccionadas de la página
    markupsToDrag = pageMarkups.filter((m) => selectedMarkupIds.includes(m.id));
    if (markupsToDrag.length === 0) {
      markupsToDrag = hit.groupId
        ? pageMarkups.filter((m) => m.groupId === hit.groupId)
        : [hit];
    }
  }

  // Expandir grupos en markupsToDrag para mover miembros del grupo juntos
  const groupIds = new Set(
    markupsToDrag.map((m) => m.groupId).filter((gid): gid is string => Boolean(gid))
  );
  if (groupIds.size > 0) {
    markupsToDrag = pageMarkups.filter(
      (m) => markupsToDrag.some((d) => d.id === m.id) || (m.groupId && groupIds.has(m.groupId))
    );
  }

  return {
    startScreenX: screenX,
    startScreenY: screenY,
    initialMarkups: markupsToDrag.map((m) => ({
      ...m,
      points: m.points.map((p) => ({ ...p })),
      leaders: m.leaders ? m.leaders.map((lead) => lead.map((p) => ({ ...p }))) : undefined,
    })),
    hasMovedPastThreshold: false,
  };
}

/**
 * Gestiona el evento mousemove en modo selección durante un arrastre:
 * - Comprueba el umbral de 4 px sin tragarse un micro-movimiento o temblor menor a 4 px.
 * - Si supera 4 px, calcula el desplazamiento normalizado y lo restringe con clampGroupTranslationDelta [0, 1].
 */
export function handleSelectMouseMove({
  screenX,
  screenY,
  dragState,
  viewportTransform,
  thresholdPx = 4,
  pageDimensions,
}: {
  screenX: number;
  screenY: number;
  dragState: DragState;
  viewportTransform: ViewportTransform;
  thresholdPx?: number;
  pageDimensions?: { width: number; height: number };
}): {
  updatedMarkups?: Markup[];
  clampedDelta?: MarkupPoint;
  hasMovedPastThreshold: boolean;
} {
  const dxScreen = screenX - dragState.startScreenX;
  const dyScreen = screenY - dragState.startScreenY;
  const distScreen = Math.hypot(dxScreen, dyScreen);

  if (!dragState.hasMovedPastThreshold) {
    // Condición 2: Umbral de 4 px sin tragarse un clic de 3 px
    if (distScreen >= thresholdPx) {
      dragState.hasMovedPastThreshold = true;
    } else {
      return { hasMovedPastThreshold: false };
    }
  }

  const screenWidth = viewportTransform.width * viewportTransform.scale;
  const screenHeight = viewportTransform.height * viewportTransform.scale;

  const deltaNormX = screenWidth > 0 ? dxScreen / screenWidth : 0;
  const deltaNormY = screenHeight > 0 ? dyScreen / screenHeight : 0;

  const pageDims = pageDimensions ?? {
    width: viewportTransform.width / (viewportTransform.scale || 1.0),
    height: viewportTransform.height / (viewportTransform.scale || 1.0),
  };

  // Condición 1: Clamp 0..1 del grupo de marcas seleccionadas
  const clampedDelta = clampGroupTranslationDelta(
    dragState.initialMarkups,
    {
      x: deltaNormX,
      y: deltaNormY,
    },
    pageDims
  );

  const updatedMarkups = dragState.initialMarkups.map((m) =>
    translateMarkup(m, clampedDelta)
  );

  return {
    updatedMarkups,
    clampedDelta,
    hasMovedPastThreshold: true,
  };
}

/**
 * Gestiona el evento mouseup al soltar el ratón tras un arrastre:
 * - Si no alcanzó el umbral de 4 px, no emite ningún comando ni altera el historial.
 * - Si alcanzó el umbral, genera la lista de MoveMarkupItem con los puntos originales y finales restringidos.
 */
export function handleSelectMouseUp({
  screenX,
  screenY,
  dragState,
  viewportTransform,
  thresholdPx = 4,
  pageDimensions,
}: {
  screenX: number;
  screenY: number;
  dragState: DragState;
  viewportTransform: ViewportTransform;
  thresholdPx?: number;
  pageDimensions?: { width: number; height: number };
}): {
  moves?: MoveMarkupItem[];
  restoredMarkups?: Markup[];
} {
  if (!dragState.hasMovedPastThreshold) {
    const distScreen = Math.hypot(
      screenX - dragState.startScreenX,
      screenY - dragState.startScreenY
    );
    if (distScreen < thresholdPx) {
      return {};
    }
  }

  const screenWidth = viewportTransform.width * viewportTransform.scale;
  const screenHeight = viewportTransform.height * viewportTransform.scale;

  const dxScreen = screenX - dragState.startScreenX;
  const dyScreen = screenY - dragState.startScreenY;

  const deltaNormX = screenWidth > 0 ? dxScreen / screenWidth : 0;
  const deltaNormY = screenHeight > 0 ? dyScreen / screenHeight : 0;

  const pageDims = pageDimensions ?? {
    width: viewportTransform.width / (viewportTransform.scale || 1.0),
    height: viewportTransform.height / (viewportTransform.scale || 1.0),
  };

  const clampedDelta = clampGroupTranslationDelta(
    dragState.initialMarkups,
    {
      x: deltaNormX,
      y: deltaNormY,
    },
    pageDims
  );

  if (Math.abs(clampedDelta.x) > 1e-6 || Math.abs(clampedDelta.y) > 1e-6) {
    const moves: MoveMarkupItem[] = dragState.initialMarkups.map((m) => {
      const moved = translateMarkup(m, clampedDelta);
      return {
        id: m.id,
        originalPoints: m.points.map((p) => ({ ...p })),
        newPoints: moved.points,
        originalLeaders: m.leaders
          ? m.leaders.map((lead) => lead.map((p) => ({ ...p })))
          : undefined,
        newLeaders: moved.leaders,
      };
    });
    return { moves };
  }

  return { restoredMarkups: dragState.initialMarkups };
}
