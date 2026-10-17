import React from 'react';
import { SlidersHorizontal, Ruler, Briefcase } from 'lucide-react';
import { useUiStore, RightPanelId } from '../../store/useUiStore';

/**
 * Riel de paneles del lado derecho (ADR-0044): un icono por panel, con el abierto marcado por el acento. Sustituye
 * a las tiras plegadas con texto vertical; abre un panel a la vez y un segundo clic lo pliega.
 */
const PANELS: { id: RightPanelId; label: string; testId: string; icon: React.ReactNode }[] = [
  { id: 'properties', label: 'Properties', testId: 'expand-properties-btn', icon: <SlidersHorizontal size={18} /> },
  { id: 'measure', label: 'Measure', testId: 'expand-measurements-btn', icon: <Ruler size={18} /> },
  { id: 'toolchest', label: 'Tool Chest', testId: 'expand-tool-chest-btn', icon: <Briefcase size={18} /> },
];

export const RightRail: React.FC = () => {
  const rightPanel = useUiStore((s) => s.rightPanel);
  const setRightPanel = useUiStore((s) => s.setRightPanel);
  return (
    <nav
      aria-label="Panels"
      data-testid="right-rail"
      className="rail-right w-11 shrink-0 bg-cad-panel border-l border-cad-border flex flex-col items-center gap-1 py-2 select-none"
    >
      {PANELS.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid={p.testId}
          aria-pressed={rightPanel === p.id}
          title={rightPanel === p.id ? `Hide ${p.label}` : p.label}
          onClick={() => setRightPanel(rightPanel === p.id ? null : p.id)}
          className="rail-btn"
        >
          {p.icon}
        </button>
      ))}
    </nav>
  );
};
