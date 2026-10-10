import { create } from 'zustand';
import { Markup, MarkupPoint, MarkupStatus } from '../types/markup';
import { Command, HistoryManager } from './history/command';

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
  updateMarkupStatus: (id: string, status: MarkupStatus) => void;
  deleteMarkup: (id: string) => void;
  deleteSelectedMarkups: () => void;
  selectMarkup: (id: string, multi?: boolean) => void;
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

    updateMarkupStatus: (id: string, status: MarkupStatus) => {
      get().updateMarkup(id, { status });
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
