import { create } from 'zustand';
import { MarkupStyle, MarkupType } from '../types/markup';

// 'arrow' crea una marca de tipo 'line' con extremo final de flecha (ADR-0018)
export type ToolType = MarkupType | 'select' | 'pan' | 'calibrate' | 'arrow';

interface ToolState {
  activeTool: ToolType;
  currentStyle: MarkupStyle;
  author: string;
  activeLayer: string;

  // Actions
  setActiveTool: (tool: ToolType) => void;
  setCurrentStyle: (style: Partial<MarkupStyle>) => void;
  setAuthor: (author: string) => void;
  setActiveLayer: (layer: string) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: 'select',
  currentStyle: {
    strokeColor: '#e02424', // Default red
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
  },
  author: 'Reviewer',
  activeLayer: 'Anotaciones',

  setActiveTool: (activeTool) => set({ activeTool }),
  setCurrentStyle: (styleUpdate) =>
    set((state) => ({
      currentStyle: { ...state.currentStyle, ...styleUpdate },
    })),
  setAuthor: (author) => set({ author }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
}));
