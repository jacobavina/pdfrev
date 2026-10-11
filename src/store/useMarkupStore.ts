import { create } from 'zustand';
import { Markup, MarkupPoint, MarkupStatus, MarkupStyle, MarkupTextFormat } from '../types/markup';
import { Command, HistoryManager } from './history/command';
import { UpdateMarkupStatusCommand, MarkupStatusTarget } from './history/UpdateMarkupStatusCommand';

// Instancia compartida del gestor de historial con 50 pasos mínimo
export const markupHistory = new HistoryManager(50);

export interface MoveMarkupItem {
  id: string;
  originalPoints: MarkupPoint[];
  newPoints: MarkupPoint[];
  originalLeaders?: MarkupPoint[][];
  newLeaders?: MarkupPoint[][];
}

interface MarkupState {
  markups: Markup[];
  selectedMarkupIds: string[];
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;

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
    },
    description?: string
  ) => void;
  updateMarkupStatus: (id: string, status: MarkupStatus) => void;
  deleteMarkup: (id: string) => void;
  deleteSelectedMarkups: () => void;
  selectMarkup: (id: string, multi?: boolean) => void;
  setSelectedMarkupIds: (ids: string[]) => void;
  deselectAll: () => void;
  setMarkups: (markups: Markup[]) => void;
  setMarkupsTransient: (markups: Markup[]) => void;
  commitMoveMarkups: (moves: MoveMarkupItem[]) => void;
  markAsClean: () => void;

  // Historial
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

export const useMarkupStore = create<MarkupState>((set, get) => {
  const syncHistoryFlags = () => {
    set({
      canUndo: markupHistory.canUndo(),
      canRedo: markupHistory.canRedo(),
    });
  };

  return {
    markups: [],
    selectedMarkupIds: [],
    isDirty: false,
    canUndo: false,
    canRedo: false,

    addMarkup: (markup: Markup) => {
      get().addMarkups([markup], `Añadir ${markup.type}`);
    },

    addMarkups: (newMarkups: Markup[], description?: string) => {
      if (newMarkups.length === 0) return;
      const ids = newMarkups.map((m) => m.id);
      const desc =
        description ||
        (newMarkups.length === 1 ? `Añadir ${newMarkups[0].type}` : `Crear ${newMarkups.length} marcas`);

      const command: Command = {
        description: desc,
        execute: () => {
          set((state) => ({
            markups: [...state.markups, ...newMarkups],
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
      if (!current) return;

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
      },
      description?: string
    ) => {
      if (ids.length === 0) return;
      const currentMarkups = get().markups;
      const targets = currentMarkups.filter((m) => ids.includes(m.id));
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
        });
      }

      const now = new Date().toISOString();
      const desc =
        description ||
        (targets.length === 1
          ? `Aplicar propiedades a ${targets[0].type}`
          : `Aplicar propiedades a ${targets.length} marcas`);

      const command: Command = {
        description: desc,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              if (!ids.includes(m.id)) return m;
              return {
                ...m,
                ...(updates.style ? { style: { ...m.style, ...updates.style } } : {}),
                ...(updates.text !== undefined ? { text: updates.text } : {}),
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

      const now = new Date().toISOString();
      const desc =
        targets.length > 1
          ? `Cambiar estado de grupo a ${status}`
          : `Cambiar estado a ${status}`;

      const command = new UpdateMarkupStatusCommand(
        targets,
        status,
        (updates) => {
          const statusMap = new Map(updates.map((u) => [u.id, u.status]));
          set((state) => ({
            markups: state.markups.map((m) => {
              const newSt = statusMap.get(m.id);
              if (!newSt) return m;
              return {
                ...m,
                status: newSt,
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

    deleteMarkup: (id: string) => {
      const target = get().markups.find((m) => m.id === id);
      if (!target) return;

      // Si target pertenece a un grupo, incluir a todos los miembros de ese grupo
      const targetsToDelete = target.groupId
        ? get().markups.filter((m) => m.groupId === target.groupId)
        : [target];
      const targetIds = targetsToDelete.map((m) => m.id);
      const desc = targetsToDelete.length > 1 ? 'Eliminar grupo' : `Eliminar ${target.type}`;

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

      const targets = get().markups.filter(
        (m) => selectedIds.includes(m.id) || (m.groupId && groupIds.has(m.groupId))
      );
      if (targets.length === 0) return;
      const targetIds = targets.map((m) => m.id);

      const command: Command = {
        description: targets.length > 1 ? `Eliminar ${targets.length} marca(s)` : `Eliminar marca`,
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

    setMarkupsTransient: (updatedMarkups: Markup[]) => {
      const map = new Map(updatedMarkups.map((m) => [m.id, m]));
      set((state) => ({
        markups: state.markups.map((m) => map.get(m.id) ?? m),
      }));
    },

    commitMoveMarkups: (moves: MoveMarkupItem[]) => {
      if (moves.length === 0) return;

      const desc = moves.length === 1 ? 'Mover marca' : `Mover ${moves.length} marcas`;
      const now = new Date().toISOString();

      const command: Command = {
        description: desc,
        execute: () => {
          set((state) => ({
            markups: state.markups.map((m) => {
              const move = moves.find((item) => item.id === m.id);
              if (move) {
                return {
                  ...m,
                  points: move.newPoints,
                  leaders: move.newLeaders,
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
              const move = moves.find((item) => item.id === m.id);
              if (move) {
                return {
                  ...m,
                  points: move.originalPoints,
                  leaders: move.originalLeaders,
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

    clearHistory: () => {
      markupHistory.clear();
      syncHistoryFlags();
    },
  };
});
