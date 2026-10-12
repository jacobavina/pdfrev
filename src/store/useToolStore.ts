import { create } from 'zustand';
import { MarkupStyle, MarkupType } from '../types/markup';
import type { FieldType } from '../core/markup/formFields';

// 'arrow' crea una marca de tipo 'line' con extremo final de flecha (ADR-0018)
export type ToolType = MarkupType | 'select' | 'pan' | 'calibrate' | 'arrow';

interface ToolState {
  activeTool: ToolType;
  currentStyle: MarkupStyle;
  author: string;
  activeLayer: string;
  /** Etiqueta por defecto de las mediciones nuevas (Distance Properties › Label, ADR-0025). */
  measureLabel: string;
  /** Sello que coloca la herramienta Stamp (ADR-0026). */
  activeStampId: string;
  /** Tipo de campo que crea la herramienta Form (ADR-0027). */
  activeFieldType: FieldType;

  // Actions
  setActiveTool: (tool: ToolType) => void;
  setCurrentStyle: (style: Partial<MarkupStyle>) => void;
  setAuthor: (author: string) => void;
  setActiveLayer: (layer: string) => void;
  setMeasureLabel: (label: string) => void;
  setActiveStampId: (id: string) => void;
  setActiveFieldType: (type: FieldType) => void;
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
  activeLayer: 'Markups',
  measureLabel: '',
  activeStampId: 'approved',
  activeFieldType: 'text',

  setActiveTool: (activeTool) => set({ activeTool }),
  setCurrentStyle: (styleUpdate) =>
    set((state) => ({
      currentStyle: { ...state.currentStyle, ...styleUpdate },
    })),
  setAuthor: (author) => set({ author }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  setMeasureLabel: (measureLabel) => set({ measureLabel }),
  setActiveStampId: (activeStampId) => set({ activeStampId }),
  setActiveFieldType: (activeFieldType) => set({ activeFieldType }),
}));
