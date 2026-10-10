import { create } from 'zustand';
import { Markup, MarkupStatus } from '../types/markup';
import { Command, HistoryManager } from './history/command';

// Instancia compartida del gestor de historial con 50 pasos mínimo
export const markupHistory = new HistoryManager(50);

interface MarkupState {
  markups: Markup[];
  selectedMarkupIds: string[];
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;

  // Acciones
  addMarkup: (markup: Markup) => void;
  updateMarkup: (id: string, updates: Partial<Markup>) => void;
  updateMarkupStatus: (id: string, status: MarkupStatus) => void;
  deleteMarkup: (id: string) => void;
  deleteSelectedMarkups: () => void;
  selectMarkup: (id: string, multi?: boolean) => void;
  deselectAll: () => void;
  setMarkups: (markups: Markup[]) => void;
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
      const command: Command = {
        description: `Añadir ${markup.type}`,
        execute: () => {
          set((state) => ({
            markups: [...state.markups, markup],
            selectedMarkupIds: [markup.id],
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: state.markups.filter((m) => m.id !== markup.id),
            selectedMarkupIds: state.selectedMarkupIds.filter((id) => id !== markup.id),
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

      const command: Command = {
        description: `Eliminar ${target.type}`,
        execute: () => {
          set((state) => ({
            markups: state.markups.filter((m) => m.id !== id),
            selectedMarkupIds: state.selectedMarkupIds.filter((selId) => selId !== id),
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: [...state.markups, target],
            selectedMarkupIds: [target.id],
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

      const targets = get().markups.filter((m) => selectedIds.includes(m.id));
      if (targets.length === 0) return;

      const command: Command = {
        description: `Eliminar ${targets.length} marca(s)`,
        execute: () => {
          set((state) => ({
            markups: state.markups.filter((m) => !selectedIds.includes(m.id)),
            selectedMarkupIds: [],
            isDirty: true,
          }));
        },
        undo: () => {
          set((state) => ({
            markups: [...state.markups, ...targets],
            selectedMarkupIds: targets.map((t) => t.id),
            isDirty: true,
          }));
        },
      };

      markupHistory.execute(command);
      syncHistoryFlags();
    },

    selectMarkup: (id: string, multi = false) => {
      set((state) => {
        if (multi) {
          const exists = state.selectedMarkupIds.includes(id);
          return {
            selectedMarkupIds: exists
              ? state.selectedMarkupIds.filter((item) => item !== id)
              : [...state.selectedMarkupIds, id],
          };
        }
        return { selectedMarkupIds: [id] };
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
