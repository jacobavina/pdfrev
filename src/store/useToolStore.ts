import { create } from 'zustand';
import type { CaptionStyle } from '../core/markup/measureCaption';
import { MarkupStyle, MarkupType } from '../types/markup';
import type { FieldType } from '../core/markup/formFields';

const LEADERS_KEY = 'rea-measure-leaders';
function readStoredLeaders(): boolean {
  try {
    return localStorage.getItem(LEADERS_KEY) !== '0';
  } catch {
    return true;
  }
}

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
  /** Texto de las distancias nuevas: dentro de la línea o encima ("Caption Style" de Acrobat, ADR-0032). */
  measureCaption: CaptionStyle;
  /** Distancia con líneas de referencia: tras el segundo clic, un tercero fija el desplazamiento (Acrobat, ADR-0033). */
  measureLeaders: boolean;
  /** Profundidad por defecto de la herramienta Volume, en la unidad de la escala (ADR-0029). */
  volumeDepth: number;
  /** Tamaño (Size de Revu: paso / 10) e inversión de las nubes nuevas (ADR-0041). */
  cloudSize: number;
  cloudInvert: boolean;

  // Actions
  setActiveTool: (tool: ToolType) => void;
  setCurrentStyle: (style: Partial<MarkupStyle>) => void;
  setAuthor: (author: string) => void;
  setActiveLayer: (layer: string) => void;
  setMeasureLabel: (label: string) => void;
  setActiveStampId: (id: string) => void;
  setActiveFieldType: (type: FieldType) => void;
  setVolumeDepth: (depth: number) => void;
  setMeasureCaption: (style: CaptionStyle) => void;
  setMeasureLeaders: (on: boolean) => void;
  setCloudOptions: (opts: { size?: number; invert?: boolean }) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: 'select',
  currentStyle: {
    strokeColor: '#e02424', // Default red
    fillColor: 'transparent',
    // 1 pt por defecto (ADR-0035): las líneas finas de Acrobat
    strokeWidth: 1,
    opacity: 1,
  },
  author: 'Reviewer',
  activeLayer: 'Markups',
  measureLabel: '',
  activeStampId: 'approved',
  activeFieldType: 'text',
  volumeDepth: 1,
  cloudSize: 2,
  cloudInvert: false,
  measureCaption: 'inline',
  // Flujo de Acrobat por defecto (ADR-0035): clic, clic y un tercer clic para desplazar la línea
  measureLeaders: readStoredLeaders(),

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
  setMeasureCaption: (measureCaption) => set({ measureCaption }),
  setMeasureLeaders: (measureLeaders) => {
    try {
      localStorage.setItem(LEADERS_KEY, measureLeaders ? '1' : '0');
    } catch {
      // Preferencia no persistible: se aplica solo en esta sesión
    }
    set({ measureLeaders });
  },
  setCloudOptions: ({ size, invert }) =>
    set((state) => ({
      cloudSize: size !== undefined && Number.isFinite(size) && size > 0 ? Math.max(0.25, Math.min(10, size)) : state.cloudSize,
      cloudInvert: invert ?? state.cloudInvert,
    })),
  setVolumeDepth: (volumeDepth) => set({ volumeDepth: Number.isFinite(volumeDepth) && volumeDepth > 0 ? volumeDepth : 1 }),
}));

/** Campos de una nube nueva con el tamaño y la inversión elegidos en la barra de propiedades (ADR-0041). */
export function cloudCreationFields(): Record<string, number> {
  const { cloudSize, cloudInvert } = useToolStore.getState();
  return { arcStep: Math.round(cloudSize * 10 * 100) / 100, ...(cloudInvert ? { cloudInvert: 1 } : {}) };
}
