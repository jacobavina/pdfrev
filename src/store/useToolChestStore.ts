import { create } from 'zustand';
import { Markup } from '../types/markup';

type ToolChestService = typeof import('../services/toolChestService');
import {
  CreatePaletteInput,
  CreateToolInput,
  RecentTool,
  ToolChestMode,
  ToolChestPalette,
  ToolChestPersistenceErrorInfo,
  ToolChestTool,
} from '../types/toolChest';
import { useMarkupStore } from './useMarkupStore';
import { useToolStore } from './useToolStore';

interface ToolChestState {
  palettes: ToolChestPalette[];
  activePaletteId: string | null;
  tools: ToolChestTool[];
  activeToolId: string | null;
  recentTools: RecentTool[];
  isLoading: boolean;
  isPersistent: boolean;
  persistenceError: ToolChestPersistenceErrorInfo | null;

  // Acciones de ciclo de vida y carga
  init: () => Promise<void>;
  loadPalettes: () => Promise<void>;
  loadTools: (paletteId?: string) => Promise<void>;
  loadRecentTools: () => Promise<void>;
  setActivePalette: (id: string | null) => void;
  setActiveTool: (id: string | null) => void;

  // Operaciones de Paletas
  createPalette: (name: string, order?: number) => Promise<ToolChestPalette>;
  updatePalette: (id: string, updates: Partial<ToolChestPalette>) => Promise<void>;
  deletePalette: (id: string) => Promise<void>;
  reorderPalettes: (orderedIds: string[]) => Promise<void>;

  // Operaciones de Herramientas
  createTool: (input: CreateToolInput) => Promise<ToolChestTool>;
  createToolFromMarkup: (
    paletteId: string,
    markup: Markup,
    name?: string,
    mode?: ToolChestMode
  ) => Promise<ToolChestTool>;
  updateTool: (id: string, updates: Partial<ToolChestTool>) => Promise<void>;
  deleteTool: (id: string) => Promise<void>;
  reorderTools: (paletteId: string, orderedIds: string[]) => Promise<void>;
  moveToolToPalette: (
    toolId: string,
    targetPaletteId: string,
    newOrder?: number
  ) => Promise<void>;
  toggleToolMode: (toolId: string) => Promise<ToolChestMode>;
  setToolMode: (toolId: string, mode: ToolChestMode) => Promise<void>;

  // Operaciones de Recientes
  recordRecent: (source: Markup | RecentTool) => Promise<void>;
  clearRecent: () => Promise<void>;

  // Aplicación interactiva de herramientas (Modo Propiedad vs Modo Dibujo)
  applyTool: (tool: ToolChestTool | RecentTool, targetMarkupIds?: string[]) => void;
}

export const useToolChestStore = create<ToolChestState>((set, get) => {
  // Servicio cargado bajo demanda (ADR-0059): IndexedDB y las paletas no hacen falta para arrancar el visor. Al
  // cargarlo se suscribe a los errores de persistencia en IndexedDB (fallback ruidoso).
  let svcPromise: Promise<ToolChestService> | null = null;
  const svc = () =>
    (svcPromise ??= import('../services/toolChestService').then((service) => {
      service.onToolChestError((info) => {
        set({
          isPersistent: false,
          persistenceError: info,
        });
      });
      return service;
    }));

  return {
    palettes: [],
    activePaletteId: null,
    tools: [],
    activeToolId: null,
    recentTools: [],
    isLoading: false,
    isPersistent: true,
    persistenceError: null,

    init: async () => {
      set({ isLoading: true });
      try {
        const palettes = await (await svc()).getPalettes();
        const activePalId = palettes.length > 0 ? palettes[0].id : null;
        const tools = await (await svc()).getTools();
        const recent = await (await svc()).getRecentTools();

        set({
          palettes: [...palettes],
          activePaletteId: activePalId,
          tools: [...tools],
          recentTools: [...recent],
          isPersistent: (await svc()).isToolChestPersistent(),
          isLoading: false,
        });
      } catch (err) {
        set({ isLoading: false });
        console.error('[ToolChestStore] Error al inicializar:', err);
      }
    },

    loadPalettes: async () => {
      const palettes = await (await svc()).getPalettes();
      set((state) => ({
        palettes: [...palettes],
        activePaletteId:
          state.activePaletteId || (palettes.length > 0 ? palettes[0].id : null),
      }));
    },

    loadTools: async (paletteId?: string) => {
      const tools = await (await svc()).getTools(paletteId);
      set({ tools: [...tools] });
    },

    loadRecentTools: async () => {
      const recent = await (await svc()).getRecentTools();
      set({ recentTools: [...recent] });
    },

    setActivePalette: (id: string | null) => {
      set({ activePaletteId: id });
    },

    setActiveTool: (id: string | null) => {
      set({ activeToolId: id });
    },

    createPalette: async (name: string, order?: number) => {
      const input: CreatePaletteInput = { name, order };
      const created = await (await svc()).createPalette(input);
      set((state) => ({
        palettes: [...state.palettes, { ...created }],
        activePaletteId: state.activePaletteId || created.id,
      }));
      return { ...created };
    },

    updatePalette: async (id: string, updates: Partial<ToolChestPalette>) => {
      const updated = await (await svc()).updatePalette(id, updates);
      set((state) => ({
        palettes: state.palettes.map((p) => (p.id === id ? { ...updated } : p)),
      }));
    },

    deletePalette: async (id: string) => {
      await (await svc()).deletePalette(id);
      set((state) => {
        const remainingPalettes = state.palettes.filter((p) => p.id !== id);
        return {
          palettes: remainingPalettes,
          tools: state.tools.filter((t) => t.paletteId !== id),
          activePaletteId:
            state.activePaletteId === id
              ? remainingPalettes.length > 0
                ? remainingPalettes[0].id
                : null
              : state.activePaletteId,
        };
      });
    },

    reorderPalettes: async (orderedIds: string[]) => {
      await (await svc()).reorderPalettes(orderedIds);
      const reordered = await (await svc()).getPalettes();
      set({ palettes: [...reordered] });
    },

    createTool: async (input: CreateToolInput) => {
      const created = await (await svc()).createTool(input);
      set((state) => ({
        tools: [...state.tools, { ...created }],
      }));
      return { ...created };
    },

    createToolFromMarkup: async (
      paletteId: string,
      markup: Markup,
      name?: string,
      mode: ToolChestMode = 'drawing'
    ) => {
      // Condición 3: Conservar exactamente el MISMO objeto style de la marca sin campos omitidos
      const input: CreateToolInput = {
        paletteId,
        name: name || `Tool ${markup.type}`,
        type: markup.type,
        style: { ...markup.style },
        text: markup.text,
        textFormat: markup.textFormat ? { ...markup.textFormat } : undefined,
        mode,
      };

      const created = await (await svc()).createTool(input);
      set((state) => ({
        tools: [...state.tools, { ...created }],
      }));
      return { ...created };
    },

    updateTool: async (id: string, updates: Partial<ToolChestTool>) => {
      const updated = await (await svc()).updateTool(id, updates);
      set((state) => ({
        tools: state.tools.map((t) => (t.id === id ? { ...updated } : t)),
      }));
    },

    deleteTool: async (id: string) => {
      await (await svc()).deleteTool(id);
      set((state) => ({
        tools: state.tools.filter((t) => t.id !== id),
        activeToolId: state.activeToolId === id ? null : state.activeToolId,
      }));
    },

    reorderTools: async (paletteId: string, orderedIds: string[]) => {
      await (await svc()).reorderTools(paletteId, orderedIds);
      const updatedTools = await (await svc()).getTools();
      set({ tools: [...updatedTools] });
    },

    moveToolToPalette: async (
      toolId: string,
      targetPaletteId: string,
      newOrder?: number
    ) => {
      const moved = await (await svc()).moveToolToPalette(
        toolId,
        targetPaletteId,
        newOrder
      );
      set((state) => ({
        tools: state.tools.map((t) => (t.id === toolId ? { ...moved } : t)),
      }));
    },

    toggleToolMode: async (toolId: string) => {
      const target = get().tools.find((t) => t.id === toolId);
      if (!target) {
        throw new Error(`Tool not found: ${toolId}`);
      }
      const newMode: ToolChestMode =
        target.mode === 'properties' ? 'drawing' : 'properties';
      await get().setToolMode(toolId, newMode);
      return newMode;
    },

    setToolMode: async (toolId: string, mode: ToolChestMode) => {
      const updated = await (await svc()).updateTool(toolId, { mode });
      set((state) => ({
        tools: state.tools.map((t) => (t.id === toolId ? { ...updated } : t)),
      }));
    },

    recordRecent: async (source: Markup | RecentTool) => {
      await (await svc()).recordRecentTool(source);
      const updatedRecent = await (await svc()).getRecentTools();
      set({ recentTools: [...updatedRecent] });
    },

    clearRecent: async () => {
      await (await svc()).clearRecentTools();
      set({ recentTools: [] });
    },

    applyTool: (
      tool: ToolChestTool | RecentTool,
      targetMarkupIds?: string[]
    ) => {
      if (tool.mode === 'properties') {
        // MODO PROPIEDAD: Aplica el estilo sobre K marcas seleccionadas en un ÚNICO comando
        const markupStore = useMarkupStore.getState();
        const targetIds =
          targetMarkupIds || markupStore.selectedMarkupIds;

        if (targetIds.length > 0) {
          markupStore.applyPropertiesToMarkups(
            targetIds,
            {
              style: { ...tool.style },
              text: tool.text,
              textFormat: tool.textFormat ? { ...tool.textFormat } : undefined,
            },
            `Aplicar estilo ${tool.type} desde Tool Chest`
          );
        }
      } else {
        // MODO DIBUJO: Activa la herramienta en useToolStore para dibujar sobre el lienzo
        const toolStore = useToolStore.getState();
        toolStore.setActiveTool(tool.type);
        toolStore.setCurrentStyle({ ...tool.style });
        set({ activeToolId: tool.id });
      }
    },
  };
});
