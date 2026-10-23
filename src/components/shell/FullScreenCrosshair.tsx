import React, { useEffect, useState } from 'react';
import { useUiStore } from '../../store/useUiStore';

/**
 * Full-Screen Crosshair (ADR-0127): dos líneas finas que cruzan toda la ventana por el cursor. No capturan el ratón.
 */
export const FullScreenCrosshair: React.FC = () => {
  const on = useUiStore((s) => s.showCrosshair);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!on) {
      setPos(null);
      return;
    }
    const move = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    const leave = (e: MouseEvent) => e.relatedTarget === null && setPos(null);
    window.addEventListener('mousemove', move);
    document.addEventListener('mouseout', leave);
    return () => {
      window.removeEventListener('mousemove', move);
      document.removeEventListener('mouseout', leave);
    };
  }, [on]);

  if (!on || !pos) return null;
  const line = 'fixed pointer-events-none z-[60] bg-cad-accent opacity-70';
  return (
    <div data-testid="crosshair" aria-hidden="true">
      <div data-testid="crosshair-h" className={`${line} left-0 right-0 h-px`} style={{ top: pos.y }} />
      <div data-testid="crosshair-v" className={`${line} top-0 bottom-0 w-px`} style={{ left: pos.x }} />
    </div>
  );
};
