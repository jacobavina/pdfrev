import React from 'react';
import { useToolStore } from '../../store/useToolStore';

/**
 * Aviso de la herramienta Calibrate (ADR-0031): sin él, pulsar Calibrate parecía no hacer nada. Indica los dos
 * clics sobre una distancia conocida y cómo salir.
 */
export const CalibrateHint: React.FC = () => {
  const activeTool = useToolStore((s) => s.activeTool);
  if (activeTool !== 'calibrate') return null;
  return (
    <div
      data-testid="calibrate-hint"
      role="status"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-3 py-1.5 rounded-md bg-cad-strong text-cad-panel text-xs shadow-float whitespace-nowrap"
    >
      Calibrate: click the start and the end of a known distance (snaps to the drawing) · Esc to cancel
    </div>
  );
};
