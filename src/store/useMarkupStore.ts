import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import {
  Markup,
  MarkupMeasurement,
  MarkupPoint,
  MarkupReply,
  MarkupStatus,
  MarkupStatusTransition,
  MarkupStyle,
  MarkupTextFormat,
  PageCalibration,
} from '../types/markup';
import { Command, HistoryManager } from './history/command';
import { DEFAULT_CLOUD_STEP } from '../core/markup/revisionCloud';
import { dashArrayFor, LineStyleId } from '../core/markup/lineStyles';
import { isPatternLineStyle, PATTERN_MARKUP_TYPES } from '../core/markup/linePatterns';
import { applyFormat, canCopyFormat, canPasteFormat, captureFormat, type MarkupFormat } from '../core/markup/formatPainter';
import { isFlagged, withFlag } from '../core/markup/flags';
import { clampSequenceScale, sequenceScaleOf } from '../core/markup/sequences';
import { UpdateMarkupStatusCommand, MarkupStatusTarget } from './history/UpdateMarkupStatusCommand';
import { UpdateMarkupCustomFieldCommand } from './history/UpdateMarkupCustomFieldCommand';
import {
  calculateArea,
  calculateVolume,
  DEFAULT_PAGE_CALIBRATION,
  PageDimensionsPt,
} from '../core/measurements/calculate';

// Instancia compartida del gestor de historial con 50 pasos mínimo
export const markupHistory = new HistoryManager(50);

export interface MoveMarkupItem {
  id: string;
  originalPoints: MarkupPoint[];
  newPoints: MarkupPoint[];
  originalLeaders?: MarkupPoint[][];
  newLeaders?: MarkupPoint[][];
  originalCutouts?: MarkupPoint[][];
  newCutouts?: MarkupPoint[][];
  originalMeasurement?: Markup['measurement'];
  newMeasurement?: Markup['measurement'];
  originalText?: string;
  newText?: string;
}

export type ReshapePatch = Pick<Markup, 'points'> & Partial<Pick<Markup, 'measurement' | 'text' | 'leaders' | 'cost'>>;

interface MarkupState {
  markups: Markup[];
  selectedMarkupIds: string[];
  clipboardMarkups: Markup[];
  /** Format Painter (ADR-0109): el aspecto copiado de una marca. */
  formatClipboard: MarkupFormat | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Sube con cada cambio del historial, para que la lista del historial se redibuje (ADR-0110). */
  historyRevision: number;

  // Acciones
  addMarkup: (markup: Markup) => void;
  addMarkups: (markups: Markup[], description?: string) => void;
  updateMarkup: (id: string, updates: Partial<Markup>) => void;
  applyPropertiesToMarkups: (
    ids: string[],
    updates: {
      style?: Partial<MarkupStyle>;
      text?: string;
      textFormat?: MarkupTextFormat;
      layer?: string;
      status?: MarkupStatus;
      author?: string;
      subject?: string;
      unitPrice?: number;
      cost?: number;
      customFields?: Record<string, string | number | undefined>;
    },
    description?: string
  ) => void;
  rescaleSequenceMarkups: (ids: string[], newScale: number) => void;
  updateMarkupStatus: (id: string, status: MarkupStatus) => void;
  /** Respuestas en hilo (/IRT, /RT /R) con comando deshacible (ADR-0071). */
  addMarkupReply: (
    markupId: string,
    reply: string | { text: string; author?: string; id?: string; createdAt?: string }
  ) => string | null;
  updateMarkupReply: (markupId: string, replyId: string, text: string) => void;
  deleteMarkupReply: (markupId: string, replyId: string) => void;
  deleteMarkup: (id: string) => void;
  deleteSelectedMarkups: () => void;
  selectMarkup: (id: string, multi?: boolean) => void;
  setSelectedMarkupIds: (ids: string[]) => void;
  deselectAll: () => void;
  setMarkups: (markups: Markup[]) => void;
  setMarkupsTransient: (markups: Markup[]) => void;
  /**
   * Medidas recalculadas por un cambio de escala (ADR-0031): sustituye esas marcas y marca el documento como
   * modificado. No entra en el historial, igual que la propia escala.
   */
  remeasureMarkups: (markups: Markup[]) => void;
  commitMoveMarkups: (moves: MoveMarkupItem[], description?: string) => void;
  /** Cambio de forma por puntos de control (ADR-0021): puntos y, si aplica, medida y texto en un solo paso. */
  reshapeMarkup: (id: string, before: ReshapePatch, after: ReshapePatch, description?: string) => void;
  /** Tipo de línea "Nube" (ADR-0021): rectángulo/polígono ↔ nube, en un solo paso deshacible. */
  setCloudLineStyle: (ids: string[], cloud: boolean) => void;
  /**
   * Tipo de línea de Revu (ADR-0041) en un solo paso deshacible: discontinuo o con patrón. Cloud convierte
   * rectángulos y polígonos en nubes (ADR-0021) y cualquier otro tipo quita la nube.
   */
  applyLineStyle: (ids: string[], id: LineStyleId) => void;
  copySelectedMarkups: () => void;
  /** Format Painter (ADR-0109): copia el formato de la marca seleccionada y lo pega en otras. */
  copyFormatOfSelection: () => boolean;
  pasteFormatToSelection: () => number;
  /** Oculta marcas sin borrarlas (ADR-0109); `ids` null = todas. Devuelve cuántas cambiaron. */
  setMarkupsHidden: (ids: string[] | null, hidden: boolean) => number;
  /** Pone o quita la bandera (ADR-0117); `ids` null = todas las marcas. Devuelve cuántas cambiaron. */
  setMarkupsFlagged: (ids: string[] | null, flagged: boolean) => number;
  /** Sustituye marcas existentes por su versión cambiada, en un solo paso de historial; salta las bloqueadas. Devuelve cuántas cambiaron. */
  replaceMarkups: (updated: Markup[], description: string) => number;
  setClipboardMarkups: (clipboardMarkups: Markup[]) => void;
  pasteMarkups: (targetPageIndex?: number, offset?: { x: number; y: number }) => void;
  duplicateSelectedMarkups: () => void;
  toggleLockSelectedMarkups: () => void;
  reorderSelectedMarkups: (direction: 'front' | 'back' | 'forward' | 'backward') => void;
  updateMarkupCustomField: (
    markupId: string,
    columnId: string,
    value: string | number | undefined
  ) => void;
  removeCustomColumnValues: (columnId: string) => void;
  /** Añade un recorte (cutout/hueco) a una medición de área o volumen con comando deshacible (ADR-0075). */
  addCutout: (
    markupId: string,
    cutoutPoints: MarkupPoint[],
    dims?: PageDimensionsPt,
    calib?: PageCalibration
  ) => void;
  /** Elimina todos los recortes de una marca restaurando su área bruta con comando deshacible (ADR-0075). */
  clearCutouts: (
    markupId: string,
    dims?: PageDimensionsPt,
    calib?: PageCalibration
  ) => void;
  /** Elimina un recorte individual de una marca con comando deshacible (paridad Revu, ADR-0081). */
  deleteCutout: (
    markupId: string,
    cutoutIndex: number,
    dims?: PageDimensionsPt,
    calib?: PageCalibration
  ) => void;
  markDirty: () => void;
  markAsClean: () => void;

  // Historial
  undo: () => void;
  redo: () => void;
  /** Salta en el historial: negativo deshace esa cantidad de pasos y positivo los rehace; devuelve los realizados. */
  jumpInHistory: (steps: number) => number;
  clearHistory: () => void;
}

let onPasteFallback: ((targetPageIndex?: number) => void) | null = null;
export function registerPasteFallback(fn: (targetPageIndex?: number) => void) {
  onPasteFallback = fn;
}

export const useMarkupStore = create<MarkupState>((set, get) => {
  const syncHistoryFlags = () => {
    set((state) => ({
      canUndo: markupHistory.canUndo(),
      canRedo: markupHistory.canRedo(),
      historyRevision: state.historyRevision + 1,
    }));
  };

  return {
    markups: [],
    selectedMarkupIds: [],
    clipboardMarkups: [],
    formatClipboard: null,
    isDirty: false,
    canUndo: false,
    canRedo: false,
    historyRevision: 0,

    addMarkup: (markup: Markup) => {
      get().addMarkups([markup], `Add ${markup.type}`);
    },

    addMarkups: (newMarkups: Markup[], description?: string) => {
      if (newMarkups.length === 0) return;
      const normalizedMarkups = newMarkups.map((m) => {
        if (typeof m.pageIndex === "number" && Number.isFinite(m.pageIndex) && m.pageIndex >= 0) return m;
        return { ...m, pageIndex: 0 };
      });
      const ids = normalizedMarkups.map((m) => m.id);
      const desc =
        description ||
        (normalizedMarkups.length === 1 ? `Add ${normalizedMarkups[0].type}` : `Create ${normalizedMarkups.length} markups`);

      const command: Command = {
        description: desc,
        execute: () => {
          set((state) => ({
            markups: [...state.markups, ...normalizedMarkups],
            selectedMarkupIds: ids,
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.filter((m) => !ids.includes(m.id)),
            selectedMarkupIds: state.selectedMarkupIds.filter((id) => !ids.includes(id)),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    updateMarkup: (id: string, updates: Partial<Markup>) => {
      const current = get().markups.find((m) => m.id === id);
      if (!current || current.locked) return;

      // Criterio 3: Si no hay cambios en los valores, evitar emitir comando de historial
      let hasChanges = false;
      for (const [key, val] of Object.entries(updates)) {
        if ((current as unknown as Record<string, unknown>)[key] !== val) {
          hasChanges = true;
          break;
        }
      }
      if (!hasChanges) {
        return;
      }

      const previous = { ...current };
      const updated: Markup = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const command: Command = {
        description: `Modificar ${current.type}`,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) => (m.id === id ? updated : m)),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) => (m.id === id ? previous : m)),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    applyPropertiesToMarkups: (
      ids: string[],
      updates: {
        style?: Partial<MarkupStyle>;
        text?: string;
        textFormat?: MarkupTextFormat;
        layer?: string;
        status?: MarkupStatus;
        author?: string;
        subject?: string;
        unitPrice?: number;
        cost?: number;
        customFields?: Record<string, string | number | undefined>;
      },
      description?: string
    ) => {
      if (ids.length === 0) return;
      const currentMarkups = get().markups;
      const targets = currentMarkups.filter((m) => ids.includes(m.id) && !m.locked);
      if (targets.length === 0) return;

      // Comprobar si hay cambios reales en alguna de las marcas para evitar comandos innecesarios
      let hasAnyChange = false;
      for (const m of targets) {
        if (updates.style) {
          for (const [k, v] of Object.entries(updates.style)) {
            if ((m.style as any)[k] !== v) {
              hasAnyChange = true;
              break;
            }
          }
        }
        if (updates.text !== undefined && m.text !== updates.text) hasAnyChange = true;
        if (updates.layer !== undefined && m.layer !== updates.layer) hasAnyChange = true;
        if (updates.status !== undefined && m.status !== updates.status) hasAnyChange = true;
        if (updates.author !== undefined && m.author !== updates.author) hasAnyChange = true;
        if (updates.subject !== undefined && m.subject !== updates.subject) hasAnyChange = true;
        if (updates.unitPrice !== undefined && m.unitPrice !== updates.unitPrice) hasAnyChange = true;
        if (updates.cost !== undefined && m.cost !== updates.cost) hasAnyChange = true;
        if (updates.customFields) {
          for (const [k, v] of Object.entries(updates.customFields)) {
            if (m.customFields?.[k] !== v) hasAnyChange = true;
          }
        }
        if (updates.textFormat !== undefined) {
          if (!m.textFormat || JSON.stringify(m.textFormat) !== JSON.stringify(updates.textFormat)) {
            hasAnyChange = true;
          }
        }
        if (hasAnyChange) break;
      }

      if (!hasAnyChange) return;

      // Inmutabilidad estricta: clonar marcas previas completas
      const previousMap = new Map<string, Markup>();
      for (const m of targets) {
        previousMap.set(m.id, {
          ...m,
          style: { ...m.style },
          textFormat: m.textFormat ? { ...m.textFormat } : undefined,
          customFields: m.customFields ? { ...m.customFields } : undefined,
        });
      }

      const now = new Date().toISOString();
      const desc =
        description ||
        (targets.length === 1
          ? `Apply properties to ${targets[0].type}`
          : `Apply properties to ${targets.length} markups`);

      const command: Command = {
        description: desc,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              // Solo las marcas no bloqueadas que se capturaron para deshacer
              if (!previousMap.has(m.id)) return m;
              let customFields = m.customFields;
              if (updates.customFields) {
                const merged: Record<string, string | number> = { ...(m.customFields ?? {}) };
                for (const [k, v] of Object.entries(updates.customFields)) {
                  if (v === undefined) delete merged[k];
                  else merged[k] = v;
                }
                customFields = Object.keys(merged).length > 0 ? merged : undefined;
              }

              const nextUnitPrice =
                updates.unitPrice !== undefined ? updates.unitPrice : m.unitPrice;
              let nextCost = m.cost;
              if (updates.cost !== undefined) {
                nextCost = updates.cost;
              } else if (nextUnitPrice !== undefined) {
                const qty =
                  m.type === 'count'
                    ? (customFields?.countSymbol ? (m.points?.length || 1) : 1)
                    : (m.measurement?.value ?? 1);
                const cents = Math.round(qty * Math.round(nextUnitPrice * 100));
                nextCost = cents / 100;
              }

              return {
                ...m,
                ...(updates.customFields ? { customFields } : {}),
                ...(updates.style ? { style: { ...m.style, ...updates.style } } : {}),
                ...(updates.text !== undefined ? { text: updates.text } : {}),
                ...(updates.status !== undefined ? { status: updates.status } : {}),
                ...(updates.author !== undefined ? { author: updates.author } : {}),
                ...(updates.subject !== undefined ? { subject: updates.subject } : {}),
                ...(nextUnitPrice !== undefined ? { unitPrice: nextUnitPrice } : {}),
                ...(nextCost !== undefined ? { cost: nextCost } : {}),
                ...(updates.textFormat !== undefined
                  ? { textFormat: updates.textFormat ? { ...updates.textFormat } : undefined }
                  : {}),
                ...(updates.layer !== undefined ? { layer: updates.layer } : {}),
                updatedAt: now,
              };
            }),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              const prev = previousMap.get(m.id);
              return prev
                ? {
                    ...prev,
                    style: { ...prev.style },
                    textFormat: prev.textFormat ? { ...prev.textFormat } : undefined,
                  }
                : m;
            }),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    rescaleSequenceMarkups: (ids: string[], newScale: number) => {
      if (ids.length === 0) return;
      const currentMarkups = get().markups;
      const targets = currentMarkups.filter(
        (m) => ids.includes(m.id) && !m.locked && m.subject === 'Sequence'
      );
      if (targets.length === 0) return;

      const clamped = clampSequenceScale(newScale);
      const changes: {
        id: string;
        oldPoints: MarkupPoint[];
        newPoints: MarkupPoint[];
        oldCustomFields?: Record<string, string | number>;
        newCustomFields: Record<string, string | number>;
      }[] = [];

      for (const m of targets) {
        const oldScale = sequenceScaleOf(m);
        if (oldScale === clamped && m.points.length >= 2) continue;
        const scaleRatio = clamped / (oldScale || 100);
        const pts = m.points;
        if (pts.length >= 2) {
          const minX = Math.min(pts[0].x, pts[1].x);
          const maxX = Math.max(pts[0].x, pts[1].x);
          const minY = Math.min(pts[0].y, pts[1].y);
          const maxY = Math.max(pts[0].y, pts[1].y);
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const halfW = ((maxX - minX) * scaleRatio) / 2;
          const halfH = ((maxY - minY) * scaleRatio) / 2;
          const nextPoints = [
            { x: cx - halfW, y: cy - halfH },
            { x: cx + halfW, y: cy + halfH },
          ];
          changes.push({
            id: m.id,
            oldPoints: pts.map((p) => ({ ...p })),
            newPoints: nextPoints,
            oldCustomFields: m.customFields ? { ...m.customFields } : undefined,
            newCustomFields: { ...(m.customFields ?? {}), sequenceScale: clamped },
          });
        }
      }

      if (changes.length === 0) return;

      const now = new Date().toISOString();
      const command: Command = {
        description: 'Sequence scale',
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              const ch = changes.find((c) => c.id === m.id);
              if (ch) {
                return {
                  ...m,
                  points: ch.newPoints.map((p) => ({ ...p })),
                  customFields: { ...ch.newCustomFields },
                  updatedAt: now,
                };
              }
              return m;
            }),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              const ch = changes.find((c) => c.id === m.id);
              if (ch) {
                return {
                  ...m,
                  points: ch.oldPoints.map((p) => ({ ...p })),
                  customFields: ch.oldCustomFields ? { ...ch.oldCustomFields } : undefined,
                  updatedAt: now,
                };
              }
              return m;
            }),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    updateMarkupStatus: (id: string, status: MarkupStatus) => {
      const currentMarkups = get().markups;
      const target = currentMarkups.find((m) => m.id === id);
      if (!target) return;

      const selectedIds = get().selectedMarkupIds;
      const initialIds = selectedIds.includes(id) ? selectedIds : [id];

      // Condición 3: Expandir a grupos completos si alguna marca tiene groupId
      const targetIdsSet = new Set<string>();
      for (const tId of initialIds) {
        const m = currentMarkups.find((item) => item.id === tId);
        if (!m) continue;
        if (m.groupId) {
          currentMarkups
            .filter((item) => item.groupId === m.groupId)
            .forEach((item) => targetIdsSet.add(item.id));
        } else {
          targetIdsSet.add(m.id);
        }
      }

      const targetsToUpdate = currentMarkups.filter((m) => targetIdsSet.has(m.id));
      if (targetsToUpdate.length === 0) return;

      // Guarda de no-op: si todas las marcas objetivo ya tienen el nuevo estado, no emitir comando
      const hasAnyDifference = targetsToUpdate.some((m) => m.status !== status);
      if (!hasAnyDifference) return;

      const targets: MarkupStatusTarget[] = targetsToUpdate.map((m) => ({
        id: m.id,
        previousStatus: m.status,
      }));
      const prevStatusMap = new Map(targets.map((t) => [t.id, t.previousStatus]));
      const prevHistoryMap = new Map<string, MarkupStatusTransition[] | undefined>(
        targetsToUpdate.map((m) => [
          m.id,
          m.statusHistory ? m.statusHistory.map((h) => ({ ...h })) : undefined,
        ])
      );

      const now = new Date().toISOString();
      const desc =
        targets.length > 1
          ? `Set group status to ${status}`
          : `Set status to ${status}`;

      const command = new UpdateMarkupStatusCommand(
        targets,
        status,
        (updates) => {
          const statusMap = new Map(updates.map((u) => [u.id, u.status]));
          set((state) => ({
            markups: state.markups.map((m) => {
              const newSt = statusMap.get(m.id);
              if (!newSt) return m;
              const isUndo = newSt === prevStatusMap.get(m.id) && m.status === status && newSt !== status;
              if (isUndo) {
                const restoredHistory = prevHistoryMap.get(m.id);
                const next: Markup = {
                  ...m,
                  status: newSt,
                  updatedAt: now,
                };
                if (restoredHistory) next.statusHistory = restoredHistory.map((h) => ({ ...h }));
                else delete next.statusHistory;
                return next;
              }
              const baseHistory: MarkupStatusTransition[] = m.statusHistory
                ? m.statusHistory.map((h) => ({ ...h }))
                : m.status !== 'pending'
                ? [{ status: m.status, author: m.author || 'Reviewer', createdAt: m.updatedAt || m.createdAt }]
                : [];
              const nextHistory = [
                ...baseHistory,
                { status: newSt, author: m.author || 'Reviewer', createdAt: now },
              ];
              return {
                ...m,
                status: newSt,
                ...(nextHistory.length > 1 ? { statusHistory: nextHistory } : {}),
                updatedAt: now,
              };
            }),
            isDirty: true,
          }));
        },
        desc
      );

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    addMarkupReply: (markupId, replyInput) => {
      const current = get().markups.find((m) => m.id === markupId);
      if (!current || current.locked) return null;
      const normalized = typeof replyInput === 'string' ? { text: replyInput } : replyInput;
      const trimmed = normalized.text.trim();
      if (!trimmed) return null;

      const now = normalized.createdAt || new Date().toISOString();
      const replyId = normalized.id || uuidv4();
      const newReply: MarkupReply = {
        id: replyId,
        author: (normalized.author && normalized.author.trim()) || current.author || 'Reviewer',
        text: trimmed,
        createdAt: now,
        updatedAt: now,
      };
      const prevReplies = current.replies ? current.replies.map((r) => ({ ...r })) : undefined;
      const prevUpdatedAt = current.updatedAt;

      const command: Command = {
        description: `Reply to ${current.type}`,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId
                ? {
                    ...m,
                    replies: [...(m.replies ? m.replies.map((r) => ({ ...r })) : []), { ...newReply }],
                    updatedAt: now,
                  }
                : m
            ),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              if (m.id !== markupId) return m;
              const restored: Markup = {
                ...m,
                updatedAt: prevUpdatedAt,
              };
              if (prevReplies && prevReplies.length > 0) {
                restored.replies = prevReplies.map((r) => ({ ...r }));
              } else {
                delete restored.replies;
              }
              return restored;
            }),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
      return replyId;
    },

    updateMarkupReply: (markupId, replyId, text) => {
      const current = get().markups.find((m) => m.id === markupId);
      if (!current || current.locked || !current.replies) return;
      const targetReply = current.replies.find((r) => r.id === replyId);
      if (!targetReply || targetReply.text === text) return;

      const prevText = targetReply.text;
      const prevReplyUpdatedAt = targetReply.updatedAt;
      const prevMarkupUpdatedAt = current.updatedAt;
      const now = new Date().toISOString();

      const command: Command = {
        description: `Edit reply on ${current.type}`,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId && m.replies
                ? {
                    ...m,
                    replies: m.replies.map((r) =>
                      r.id === replyId ? { ...r, text, updatedAt: now } : { ...r }
                    ),
                    updatedAt: now,
                  }
                : m
            ),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId && m.replies
                ? {
                    ...m,
                    replies: m.replies.map((r) =>
                      r.id === replyId ? { ...r, text: prevText, updatedAt: prevReplyUpdatedAt } : { ...r }
                    ),
                    updatedAt: prevMarkupUpdatedAt,
                  }
                : m
            ),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    deleteMarkupReply: (markupId, replyId) => {
      const current = get().markups.find((m) => m.id === markupId);
      if (!current || current.locked || !current.replies) return;
      if (!current.replies.some((r) => r.id === replyId)) return;

      const prevReplies = current.replies.map((r) => ({ ...r }));
      const prevMarkupUpdatedAt = current.updatedAt;
      const now = new Date().toISOString();

      const command: Command = {
        description: `Delete reply on ${current.type}`,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              if (m.id !== markupId || !m.replies) return m;
              const remaining = m.replies.filter((r) => r.id !== replyId).map((r) => ({ ...r }));
              const next: Markup = {
                ...m,
                updatedAt: now,
              };
              if (remaining.length > 0) next.replies = remaining;
              else delete next.replies;
              return next;
            }),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId
                ? {
                    ...m,
                    replies: prevReplies.map((r) => ({ ...r })),
                    updatedAt: prevMarkupUpdatedAt,
                  }
                : m
            ),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    deleteMarkup: (id: string) => {
      const target = get().markups.find((m) => m.id === id);
      if (!target || target.locked) return;

      // Si target pertenece a un grupo, incluir a todos los miembros de ese grupo (excepto bloqueados)
      const targetsToDelete = target.groupId
        ? get().markups.filter((m) => m.groupId === target.groupId && !m.locked)
        : [target];
      const targetIds = targetsToDelete.map((m) => m.id);
      const desc = targetsToDelete.length > 1 ? 'Delete group' : `Delete ${target.type}`;

      const command: Command = {
        description: desc,
        execute: () => {
          set((state) => ({
            markups: state.markups.filter((m) => !targetIds.includes(m.id)),
            selectedMarkupIds: state.selectedMarkupIds.filter((selId) => !targetIds.includes(selId)),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: [...state.markups, ...targetsToDelete],
            selectedMarkupIds: targetIds,
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    deleteSelectedMarkups: () => {
      const selectedIds = get().selectedMarkupIds;
      if (selectedIds.length === 0) return;

      // Expandir cualquier grupo presente en la selección
      const selectedMarkups = get().markups.filter((m) => selectedIds.includes(m.id));
      const groupIds = new Set(
        selectedMarkups.map((m) => m.groupId).filter((gid): gid is string => Boolean(gid))
      );

      // Excluir marcas bloqueadas
      const targets = get().markups.filter(
        (m) =>
          (selectedIds.includes(m.id) || (m.groupId && groupIds.has(m.groupId))) &&
          !m.locked
      );
      if (targets.length === 0) return;
      const targetIds = targets.map((m) => m.id);

      const command: Command = {
        description: targets.length > 1 ? `Delete ${targets.length} markup(s)` : `Delete markup`,
        execute: () => {
          set((state) => ({
            markups: state.markups.filter((m) => !targetIds.includes(m.id)),
            selectedMarkupIds: [],
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: [...state.markups, ...targets],
            selectedMarkupIds: targetIds,
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    selectMarkup: (id: string, multi = false) => {
      const target = get().markups.find((m) => m.id === id);
      const targetIds = target?.groupId
        ? get().markups.filter((m) => m.groupId === target.groupId).map((m) => m.id)
        : [id];

      set((state) => {
        if (multi) {
          const anyExists = targetIds.some((tid) => state.selectedMarkupIds.includes(tid));
          return {
            selectedMarkupIds: anyExists
              ? state.selectedMarkupIds.filter((item) => !targetIds.includes(item))
              : [...state.selectedMarkupIds, ...targetIds],
          };
        }
        return { selectedMarkupIds: targetIds };
      });
    },

    setSelectedMarkupIds: (ids: string[]) => {
      const allMarkups = get().markups;
      const groupIds = new Set(
        allMarkups.filter((m) => ids.includes(m.id) && m.groupId).map((m) => m.groupId!)
      );

      const finalIds =
        groupIds.size > 0
          ? allMarkups
              .filter((m) => ids.includes(m.id) || (m.groupId && groupIds.has(m.groupId)))
              .map((m) => m.id)
          : ids;

      set({ selectedMarkupIds: finalIds });
    },

    deselectAll: () => {
      set({ selectedMarkupIds: [] });
    },

    setMarkups: (markups: Markup[]) => {
      set({
        markups,
        selectedMarkupIds: [],
        isDirty: false,
      });
      markupHistory.clear();
      syncHistoryFlags();
    },

    remeasureMarkups: (updatedMarkups: Markup[]) => {
      if (updatedMarkups.length === 0) return;
      const map = new Map(updatedMarkups.map((m) => [m.id, m]));
      set((state) => ({
        markups: state.markups.map((m) => map.get(m.id) ?? m),
        isDirty: true,
      }));
    },

    setMarkupsTransient: (updatedMarkups: Markup[]) => {
      const map = new Map(updatedMarkups.map((m) => [m.id, m]));
      set((state) => ({
        markups: state.markups.map((m) => map.get(m.id) ?? m),
      }));
    },

    commitMoveMarkups: (moves: MoveMarkupItem[], description?: string) => {
      if (moves.length === 0) return;
      const currentMarkups = get().markups;
      // Filtrar movimientos de marcas bloqueadas
      const allowedMoves = moves.filter((move) => {
        const m = currentMarkups.find((item) => item.id === move.id);
        return !m?.locked;
      });
      if (allowedMoves.length === 0) return;

      const desc =
        description || (allowedMoves.length === 1 ? 'Move markup' : `Move ${allowedMoves.length} markups`);
      const now = new Date().toISOString();

      const command: Command = {
        description: desc,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              const move = allowedMoves.find((item) => item.id === m.id);
              if (move) {
                return {
                  ...m,
                  points: move.newPoints,
                  leaders: move.newLeaders,
                  ...(move.newCutouts !== undefined ? { cutouts: move.newCutouts } : {}),
                  ...(move.newMeasurement !== undefined ? { measurement: move.newMeasurement } : {}),
                  ...(move.newText !== undefined ? { text: move.newText } : {}),
                  updatedAt: now,
                };
              }
              return m;
            }),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              const move = allowedMoves.find((item) => item.id === m.id);
              if (move) {
                return {
                  ...m,
                  points: move.originalPoints,
                  leaders: move.originalLeaders,
                  ...(move.originalCutouts !== undefined ? { cutouts: move.originalCutouts } : {}),
                  ...(move.originalMeasurement !== undefined ? { measurement: move.originalMeasurement } : {}),
                  ...(move.originalText !== undefined ? { text: move.originalText } : {}),
                  updatedAt: now,
                };
              }
              return m;
            }),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    addCutout: (markupId: string, cutoutPoints: MarkupPoint[], dims?: PageDimensionsPt, calib?: PageCalibration) => {
      if (!cutoutPoints || cutoutPoints.length < 2) return;
      const target = get().markups.find((m) => m.id === markupId);
      if (!target || target.locked) return;
      if (target.type !== 'area' && target.type !== 'volume') return;

      const prevCutouts = target.cutouts ? target.cutouts.map((c) => c.map((p) => ({ ...p }))) : undefined;
      const prevMeasurement = target.measurement ? { ...target.measurement } : undefined;
      const prevText = target.text;

      const nextCutouts = [...(prevCutouts ?? []), cutoutPoints.map((p) => ({ ...p }))];
      const pageDims = dims ?? { width: 612, height: 792 };
      const pageCalib = calib ?? DEFAULT_PAGE_CALIBRATION;

      let nextMeasurement: MarkupMeasurement | undefined;
      if (target.type === 'area') {
        nextMeasurement = calculateArea(target.points, pageDims, pageCalib, target.points.length === 2, nextCutouts);
      } else if (target.type === 'volume') {
        nextMeasurement = calculateVolume(target.points, pageDims, pageCalib, Number(target.customFields?.volumeDepth ?? 1), nextCutouts);
      }

      const keepsValueText = !target.text || target.text === prevMeasurement?.formatted;
      const nextText = nextMeasurement && keepsValueText ? nextMeasurement.formatted : target.text;

      const command: Command = {
        description: `Add cutout to ${target.type}`,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId
                ? {
                    ...m,
                    cutouts: nextCutouts,
                    measurement: nextMeasurement ?? m.measurement,
                    text: nextText,
                    updatedAt: new Date().toISOString(),
                  }
                : m
            ),
            isDirty: true,
          }));
          syncHistoryFlags();
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId
                ? {
                    ...m,
                    cutouts: prevCutouts,
                    measurement: prevMeasurement,
                    text: prevText,
                    updatedAt: new Date().toISOString(),
                  }
                : m
            ),
            isDirty: true,
          }));
          syncHistoryFlags();
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    clearCutouts: (markupId: string, dims?: PageDimensionsPt, calib?: PageCalibration) => {
      const target = get().markups.find((m) => m.id === markupId);
      if (!target || target.locked || !target.cutouts || target.cutouts.length === 0) return;

      const prevCutouts = target.cutouts.map((c) => c.map((p) => ({ ...p })));
      const prevMeasurement = target.measurement ? { ...target.measurement } : undefined;
      const prevText = target.text;

      const pageDims = dims ?? { width: 612, height: 792 };
      const pageCalib = calib ?? DEFAULT_PAGE_CALIBRATION;

      let nextMeasurement: MarkupMeasurement | undefined;
      if (target.type === 'area') {
        nextMeasurement = calculateArea(target.points, pageDims, pageCalib, target.points.length === 2, undefined);
      } else if (target.type === 'volume') {
        nextMeasurement = calculateVolume(target.points, pageDims, pageCalib, Number(target.customFields?.volumeDepth ?? 1), undefined);
      }

      const keepsValueText = !target.text || target.text === prevMeasurement?.formatted;
      const nextText = nextMeasurement && keepsValueText ? nextMeasurement.formatted : target.text;

      const command: Command = {
        description: `Clear cutouts from ${target.type}`,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId
                ? {
                    ...m,
                    cutouts: undefined,
                    measurement: nextMeasurement ?? m.measurement,
                    text: nextText,
                    updatedAt: new Date().toISOString(),
                  }
                : m
            ),
            isDirty: true,
          }));
          syncHistoryFlags();
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId
                ? {
                    ...m,
                    cutouts: prevCutouts,
                    measurement: prevMeasurement,
                    text: prevText,
                    updatedAt: new Date().toISOString(),
                  }
                : m
            ),
            isDirty: true,
          }));
          syncHistoryFlags();
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    deleteCutout: (markupId: string, cutoutIndex: number, dims?: PageDimensionsPt, calib?: PageCalibration) => {
      const target = get().markups.find((m) => m.id === markupId);
      if (!target || target.locked || !target.cutouts || cutoutIndex < 0 || cutoutIndex >= target.cutouts.length) return;

      const prevCutouts = target.cutouts.map((c) => c.map((p) => ({ ...p })));
      const prevMeasurement = target.measurement ? { ...target.measurement } : undefined;
      const prevText = target.text;

      const nextCutouts = prevCutouts.filter((_, idx) => idx !== cutoutIndex);
      const activeCutouts = nextCutouts.length > 0 ? nextCutouts : undefined;

      const pageDims = dims ?? { width: 612, height: 792 };
      const pageCalib = calib ?? DEFAULT_PAGE_CALIBRATION;

      let nextMeasurement: MarkupMeasurement | undefined;
      if (target.type === 'area') {
        nextMeasurement = calculateArea(target.points, pageDims, pageCalib, target.points.length === 2, activeCutouts);
      } else if (target.type === 'volume') {
        nextMeasurement = calculateVolume(target.points, pageDims, pageCalib, Number(target.customFields?.volumeDepth ?? 1), activeCutouts);
      }

      const keepsValueText = !target.text || target.text === prevMeasurement?.formatted;
      const nextText = nextMeasurement && keepsValueText ? nextMeasurement.formatted : target.text;

      const command: Command = {
        description: `Delete cutout from ${target.type}`,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId
                ? {
                    ...m,
                    cutouts: activeCutouts,
                    measurement: nextMeasurement ?? m.measurement,
                    text: nextText,
                    updatedAt: new Date().toISOString(),
                  }
                : m
            ),
            isDirty: true,
          }));
          syncHistoryFlags();
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) =>
              m.id === markupId
                ? {
                    ...m,
                    cutouts: prevCutouts,
                    measurement: prevMeasurement,
                    text: prevText,
                    updatedAt: new Date().toISOString(),
                  }
                : m
            ),
            isDirty: true,
          }));
          syncHistoryFlags();
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    reshapeMarkup: (id, before, after, description = 'Edit control points') => {
      const target = get().markups.find((m) => m.id === id);
      if (!target || target.locked) return;
      const apply = (patch: ReshapePatch) =>
        set((state) => ({
          markups: state.markups.map((m) =>
            m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m
          ),
          isDirty: true,
        }));
      const command: Command = { description, execute: () => apply(after), undo: () => apply(before) };
      markupHistory.execute(command);
      syncHistoryFlags();
    },

    setCloudLineStyle: (ids, cloud) => {
      const targets = get().markups.filter(
        (m) =>
          ids.includes(m.id) &&
          !m.locked &&
          (cloud ? m.type === 'rectangle' || m.type === 'polygon' : m.type === 'cloud')
      );
      if (targets.length === 0) return;
      const before = new Map(targets.map((m) => [m.id, m]));
      const now = new Date().toISOString();
      const after = new Map(
        targets.map((m): [string, Markup] => [
          m.id,
          cloud
            ? {
                ...m,
                type: 'cloud',
                customFields: { ...(m.customFields ?? {}), arcStep: m.customFields?.arcStep ?? DEFAULT_CLOUD_STEP },
                updatedAt: now,
              }
            : { ...m, type: m.points.length === 2 ? 'rectangle' : 'polygon', updatedAt: now },
        ])
      );
      const apply = (map: Map<string, Markup>) =>
        set((state) => ({ markups: state.markups.map((m) => map.get(m.id) ?? m), isDirty: true }));
      const command: Command = {
        description: cloud ? 'Line style: cloud' : 'Remove cloud style',
        execute: () => apply(after),
        undo: () => apply(before),
      };
      markupHistory.execute(command);
      syncHistoryFlags();
    },

    applyLineStyle: (ids, id) => {
      const targets = get().markups.filter((m) => ids.includes(m.id) && !m.locked);
      if (targets.length === 0) return;
      const now = new Date().toISOString();
      const pattern = isPatternLineStyle(id);
      const dashed = (m: Markup) => (pattern ? undefined : dashArrayFor(id, m.style.strokeWidth ?? 1));
      const after = new Map<string, Markup>();
      for (const m of targets) {
        let next: Markup | null = null;
        if (m.type === 'cloudPlus') {
          // La Cloud+ siempre es nube: solo admite el discontinuo
          if (!pattern || id === 'cloud') next = { ...m, style: { ...m.style, dashArray: dashed(m) } };
        } else if (m.type === 'cloud') {
          // Continuo o discontinuo la dejan como nube, igual que la Cloud+ (ADR-0067); solo un patrón (Fenceline,
          // Gas…) la vuelve rectángulo o polígono, porque no se combina con los lóbulos
          if (!pattern || id === 'cloud') next = { ...m, style: { ...m.style, dashArray: dashed(m), lineStyle: undefined } };
          else {
            next = {
              ...m,
              type: m.points.length === 2 ? 'rectangle' : 'polygon',
              style: { ...m.style, dashArray: dashed(m), lineStyle: pattern ? id : undefined },
            };
          }
        } else if (id === 'cloud' && (m.type === 'rectangle' || m.type === 'polygon')) {
          next = {
            ...m,
            type: 'cloud',
            style: { ...m.style, dashArray: undefined, lineStyle: undefined },
            customFields: { ...(m.customFields ?? {}), arcStep: m.customFields?.arcStep ?? DEFAULT_CLOUD_STEP },
          };
        } else if (pattern) {
          if (PATTERN_MARKUP_TYPES.has(m.type)) next = { ...m, style: { ...m.style, dashArray: undefined, lineStyle: id } };
        } else {
          next = { ...m, style: { ...m.style, dashArray: dashed(m), lineStyle: undefined } };
        }
        if (next) after.set(m.id, { ...next, updatedAt: now });
      }
      if (after.size === 0) return;
      const before = new Map(targets.filter((m) => after.has(m.id)).map((m) => [m.id, m]));
      const apply = (map: Map<string, Markup>) =>
        set((state) => ({ markups: state.markups.map((m) => map.get(m.id) ?? m), isDirty: true }));
      markupHistory.execute({
        description: `Line style: ${id}`,
        execute: () => apply(after),
        undo: () => apply(before),
      });
      syncHistoryFlags();
    },

    copySelectedMarkups: () => {
      const { markups, selectedMarkupIds } = get();
      if (selectedMarkupIds.length === 0) return;
      const selected = markups.filter((m) => selectedMarkupIds.includes(m.id));
      if (selected.length === 0) return;
      const copied: Markup[] = selected.map((m) => ({
        ...m,
        points: m.points.map((p) => ({ ...p })),
        leaders: m.leaders ? m.leaders.map((lead) => lead.map((p) => ({ ...p }))) : undefined,
        style: { ...m.style },
        textFormat: m.textFormat ? { ...m.textFormat } : undefined,
        customFields: m.customFields ? { ...m.customFields } : undefined,
      }));
      set({ clipboardMarkups: copied });
    },

    copyFormatOfSelection: () => {
      const { markups, selectedMarkupIds } = get();
      const source = markups.find((m) => selectedMarkupIds.includes(m.id) && canCopyFormat(m));
      if (!source) return false;
      set({ formatClipboard: captureFormat(source) });
      return true;
    },

    pasteFormatToSelection: () => {
      const { markups, selectedMarkupIds, formatClipboard } = get();
      if (!formatClipboard) return 0;
      const now = new Date().toISOString();
      const before = new Map<string, Markup>();
      const after = new Map<string, Markup>();
      for (const m of markups) {
        if (!selectedMarkupIds.includes(m.id) || !canPasteFormat(m)) continue;
        before.set(m.id, m);
        after.set(m.id, applyFormat(m, formatClipboard, now));
      }
      if (after.size === 0) return 0;
      const apply = (map: Map<string, Markup>) =>
        set((state) => ({ markups: state.markups.map((m) => map.get(m.id) ?? m), isDirty: true }));
      markupHistory.execute({
        description: after.size === 1 ? 'Paste format' : `Paste format to ${after.size} markups`,
        execute: () => apply(after),
        undo: () => apply(before),
      });
      syncHistoryFlags();
      return after.size;
    },

    setMarkupsHidden: (ids, hidden) => {
      const { markups } = get();
      const now = new Date().toISOString();
      const before = new Map<string, Markup>();
      const after = new Map<string, Markup>();
      for (const m of markups) {
        if (ids && !ids.includes(m.id)) continue;
        if (Boolean(m.hidden) === hidden) continue;
        if (hidden && m.locked) continue;
        before.set(m.id, m);
        after.set(m.id, { ...m, hidden: hidden ? true : undefined, updatedAt: now });
      }
      if (after.size === 0) return 0;
      const apply = (map: Map<string, Markup>) =>
        set((state) => ({
          markups: state.markups.map((m) => map.get(m.id) ?? m),
          // Lo que se oculta deja de estar seleccionado
          selectedMarkupIds: hidden ? state.selectedMarkupIds.filter((id) => !map.has(id)) : state.selectedMarkupIds,
          isDirty: true,
        }));
      markupHistory.execute({
        description: hidden ? `Hide ${after.size} markup${after.size === 1 ? '' : 's'}` : `Show ${after.size} hidden markup${after.size === 1 ? '' : 's'}`,
        execute: () => apply(after),
        undo: () =>
          set((state) => ({ markups: state.markups.map((m) => before.get(m.id) ?? m), isDirty: true })),
      });
      syncHistoryFlags();
      return after.size;
    },

    replaceMarkups: (updated, description) => {
      const { markups } = get();
      const byId = new Map(updated.map((m) => [m.id, m]));
      const before = new Map<string, Markup>();
      const after = new Map<string, Markup>();
      for (const m of markups) {
        const next = byId.get(m.id);
        if (!next || m.locked) continue;
        before.set(m.id, m);
        after.set(m.id, next);
      }
      if (after.size === 0) return 0;
      const apply = (map: Map<string, Markup>) =>
        set((state) => ({ markups: state.markups.map((m) => map.get(m.id) ?? m), isDirty: true }));
      markupHistory.execute({ description, execute: () => apply(after), undo: () => apply(before) });
      syncHistoryFlags();
      return after.size;
    },

    setMarkupsFlagged: (ids, flagged) => {
      const { markups } = get();
      const now = new Date().toISOString();
      const before = new Map<string, Markup>();
      const after = new Map<string, Markup>();
      for (const m of markups) {
        if (ids && !ids.includes(m.id)) continue;
        if (isFlagged(m) === flagged) continue;
        before.set(m.id, m);
        after.set(m.id, withFlag(m, flagged, now));
      }
      if (after.size === 0) return 0;
      const apply = (map: Map<string, Markup>) =>
        set((state) => ({ markups: state.markups.map((m) => map.get(m.id) ?? m), isDirty: true }));
      markupHistory.execute({
        description: flagged ? `Flag ${after.size} markup${after.size === 1 ? '' : 's'}` : `Remove ${after.size} flag${after.size === 1 ? '' : 's'}`,
        execute: () => apply(after),
        undo: () => apply(before),
      });
      syncHistoryFlags();
      return after.size;
    },

    setClipboardMarkups: (clipboardMarkups: Markup[]) => {
      set({ clipboardMarkups });
    },

    pasteMarkups: (targetPageIndex?: number, offset?: { x: number; y: number }) => {
      const { clipboardMarkups, addMarkups } = get();
      if (clipboardMarkups.length === 0) {
        onPasteFallback?.(targetPageIndex);
        return;
      }

      const dx = offset?.x ?? 0.02;
      const dy = offset?.y ?? 0.02;
      // Pegar en el sitio (ADR-0109): sin desplazamiento no se recorta nada hacia dentro de la hoja
      const lo = dx === 0 && dy === 0 ? 0 : 0.01;
      const hi = dx === 0 && dy === 0 ? 1 : 0.98;
      const now = new Date().toISOString();

      const groupMap = new Map<string, string>();
      for (const m of clipboardMarkups) {
        if (m.groupId && !groupMap.has(m.groupId)) {
          groupMap.set(m.groupId, uuidv4());
        }
      }

      const pasted: Markup[] = clipboardMarkups.map((m) => {
        const newId = uuidv4();
        const newGroupId = m.groupId ? groupMap.get(m.groupId) : undefined;
        const pIndex = targetPageIndex !== undefined ? targetPageIndex : m.pageIndex;

        return {
          ...m,
          id: newId,
          pageIndex: pIndex,
          groupId: newGroupId,
          points: m.points.map((p) => ({
            x: Math.min(hi, Math.max(lo, p.x + dx)),
            y: Math.min(hi, Math.max(lo, p.y + dy)),
          })),
          leaders: m.leaders
            ? m.leaders.map((lead) =>
                lead.map((p) => ({
                  x: Math.min(hi, Math.max(lo, p.x + dx)),
                  y: Math.min(hi, Math.max(lo, p.y + dy)),
                }))
              )
            : undefined,
          style: { ...m.style },
          textFormat: m.textFormat ? { ...m.textFormat } : undefined,
          customFields: m.customFields ? { ...m.customFields } : undefined,
          createdAt: now,
          updatedAt: now,
          locked: undefined,
        };
      });

      addMarkups(pasted, pasted.length === 1 ? `Paste ${pasted[0].type}` : `Paste ${pasted.length} markups`);
    },

    duplicateSelectedMarkups: () => {
      const { markups, selectedMarkupIds, addMarkups } = get();
      if (selectedMarkupIds.length === 0) return;
      const targets = markups.filter((m) => selectedMarkupIds.includes(m.id));
      if (targets.length === 0) return;

      const dx = 0.02;
      const dy = 0.02;
      const now = new Date().toISOString();

      const groupMap = new Map<string, string>();
      for (const m of targets) {
        if (m.groupId && !groupMap.has(m.groupId)) {
          groupMap.set(m.groupId, uuidv4());
        }
      }

      const duplicated: Markup[] = targets.map((m) => {
        const newId = uuidv4();
        const newGroupId = m.groupId ? groupMap.get(m.groupId) : undefined;

        return {
          ...m,
          id: newId,
          groupId: newGroupId,
          points: m.points.map((p) => ({
            x: Math.min(0.98, Math.max(0.01, p.x + dx)),
            y: Math.min(0.98, Math.max(0.01, p.y + dy)),
          })),
          leaders: m.leaders
            ? m.leaders.map((lead) =>
                lead.map((p) => ({
                  x: Math.min(0.98, Math.max(0.01, p.x + dx)),
                  y: Math.min(0.98, Math.max(0.01, p.y + dy)),
                }))
              )
            : undefined,
          style: { ...m.style },
          textFormat: m.textFormat ? { ...m.textFormat } : undefined,
          customFields: m.customFields ? { ...m.customFields } : undefined,
          createdAt: now,
          updatedAt: now,
          locked: undefined,
        };
      });

      addMarkups(
        duplicated,
        duplicated.length === 1 ? `Duplicate ${duplicated[0].type}` : `Duplicate ${duplicated.length} markups`
      );
    },

    toggleLockSelectedMarkups: () => {
      const { markups, selectedMarkupIds } = get();
      if (selectedMarkupIds.length === 0) return;
      const targets = markups.filter((m) => selectedMarkupIds.includes(m.id));
      if (targets.length === 0) return;

      const allLocked = targets.every((m) => Boolean(m.locked));
      const targetLocked = !allLocked;
      const targetIds = targets.map((m) => m.id);

      const prevLockMap = new Map<string, boolean | undefined>(
        targets.map((m) => [m.id, m.locked])
      );
      const now = new Date().toISOString();

      const command: Command = {
        description: targetLocked
          ? targets.length === 1
            ? `Bloquear ${targets[0].type}`
            : `Lock ${targets.length} markups`
          : targets.length === 1
          ? `Desbloquear ${targets[0].type}`
          : `Unlock ${targets.length} markups`,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              if (!targetIds.includes(m.id)) return m;
              return {
                ...m,
                locked: targetLocked ? true : undefined,
                updatedAt: now,
              };
            }),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              if (!targetIds.includes(m.id)) return m;
              return {
                ...m,
                locked: prevLockMap.get(m.id),
                updatedAt: now,
              };
            }),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    reorderSelectedMarkups: (direction: 'front' | 'back' | 'forward' | 'backward') => {
      const { markups, selectedMarkupIds } = get();
      if (selectedMarkupIds.length === 0) return;
      const selectedSet = new Set(selectedMarkupIds);
      const selectedUnlockedSet = new Set(
        markups.filter((m) => selectedSet.has(m.id) && !m.locked).map((m) => m.id)
      );
      if (selectedUnlockedSet.size === 0) return;

      const oldMarkups = [...markups];
      const pageIndices = Array.from(new Set(markups.map((m) => m.pageIndex)));
      const reordered: Markup[] = [];

      for (const pIdx of pageIndices) {
        const pageMarkups = markups.filter((m) => m.pageIndex === pIdx);
        const nonSelected = pageMarkups.filter((m) => !selectedUnlockedSet.has(m.id));
        const selected = pageMarkups.filter((m) => selectedUnlockedSet.has(m.id));

        if (selected.length === 0) {
          reordered.push(...pageMarkups);
          continue;
        }

        let newPageMarkups: Markup[];
        if (direction === 'front') {
          newPageMarkups = [...nonSelected, ...selected];
        } else if (direction === 'back') {
          newPageMarkups = [...selected, ...nonSelected];
        } else if (direction === 'forward') {
          newPageMarkups = [...pageMarkups];
          for (let i = newPageMarkups.length - 2; i >= 0; i--) {
            if (selectedUnlockedSet.has(newPageMarkups[i].id) && !selectedUnlockedSet.has(newPageMarkups[i + 1].id)) {
              const temp = newPageMarkups[i];
              newPageMarkups[i] = newPageMarkups[i + 1];
              newPageMarkups[i + 1] = temp;
            }
          }
        } else {
          newPageMarkups = [...pageMarkups];
          for (let i = 1; i < newPageMarkups.length; i++) {
            if (selectedUnlockedSet.has(newPageMarkups[i].id) && !selectedUnlockedSet.has(newPageMarkups[i - 1].id)) {
              const temp = newPageMarkups[i];
              newPageMarkups[i] = newPageMarkups[i - 1];
              newPageMarkups[i - 1] = temp;
            }
          }
        }
        reordered.push(...newPageMarkups);
      }

      const wasDirty = get().isDirty;
      const command: Command = {
        description: `Reorder markups ${direction}`,
        execute: () => {
          set({ markups: reordered, isDirty: true });
          syncHistoryFlags();
        },
        undo: () => {
          set({ markups: oldMarkups, isDirty: wasDirty });
          syncHistoryFlags();
        },
      };

      markupHistory.execute(command);
    },

    markDirty: () => {
      set({ isDirty: true });
    },

    updateMarkupCustomField: (
      markupId: string,
      columnId: string,
      value: string | number | undefined
    ) => {
      const current = get().markups.find((m) => m.id === markupId);
      if (!current) return;

      const previousValue = current.customFields?.[columnId];
      if (previousValue === value) return;

      const applyValue = (
        mId: string,
        cId: string,
        val: string | number | undefined
      ) => {
        const now = new Date().toISOString();
        set((state) => ({
          markups: state.markups.map((m) => {
            if (m.id !== mId) return m;
            const newFields = { ...(m.customFields || {}) };
            if (val === undefined || val === '') {
              delete newFields[cId];
            } else {
              newFields[cId] = val;
            }
            return {
              ...m,
              customFields: Object.keys(newFields).length > 0 ? newFields : undefined,
              updatedAt: now,
            };
          }),
          isDirty: true,
        }));
      };

      const command = new UpdateMarkupCustomFieldCommand(
        markupId,
        columnId,
        previousValue,
        value,
        applyValue
      );

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    removeCustomColumnValues: (columnId: string) => {
      const currentMarkups = get().markups;
      const anyHasCol = currentMarkups.some(
        (m) =>
          m.customFields &&
          Object.prototype.hasOwnProperty.call(m.customFields, columnId)
      );
      if (!anyHasCol) return;

      const now = new Date().toISOString();
      set((state) => ({
        markups: state.markups.map((m) => {
          if (
            !m.customFields ||
            !Object.prototype.hasOwnProperty.call(m.customFields, columnId)
          ) {
            return m;
          }
          const nextFields = { ...m.customFields };
          delete nextFields[columnId];
          return {
            ...m,
            customFields: Object.keys(nextFields).length > 0 ? nextFields : undefined,
            updatedAt: now,
          };
        }),
        isDirty: true,
      }));
    },

    markAsClean: () => {
      set({ isDirty: false });
    },

    undo: () => {
      if (markupHistory.undo()) {
        syncHistoryFlags();
      }
    },

    redo: () => {
      if (markupHistory.redo()) {
        syncHistoryFlags();
      }
    },

    jumpInHistory: (steps) => {
      let done = 0;
      for (let i = 0; i < Math.abs(steps); i++) {
        if (!(steps < 0 ? markupHistory.undo() : markupHistory.redo())) break;
        done++;
      }
      if (done > 0) syncHistoryFlags();
      return done;
    },

    clearHistory: () => {
      markupHistory.clear();
      syncHistoryFlags();
    },
  };
});
