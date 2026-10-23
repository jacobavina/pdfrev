import React, { useEffect, useState } from 'react';
import { useUiStore } from '../../store/useUiStore';

interface CrossState {
  x: number;
  y: number;
  /** Área de trabajo (sin barras de desplazamiento) a la que se limitan las líneas. */
  area: { left: number; top: number; width: number; height: number };
}

/**
 * Full-Screen Crosshair (ADR-0127): dos líneas finas que cruzan toda el área de trabajo por el cursor, sin salirse de ella
 * (no pasan por las barras, los paneles ni la barra de estado). No capturan el ratón.
 */
export const FullScreenCrosshair: React.FC = () => {
  const on = useUiStore((s) => s.showCrosshair);
  const [cross, setCross] = useState<CrossState | null>(null);

  useEffect(() => {
    if (!on) {
      setCross(null);
      return;
    }
    const move = (e: MouseEvent) => {
      const el = document.querySelector<HTMLElement>('[data-testid="pdf-viewer-container"]');
      if (!el) return setCross(null);
      const r = el.getBoundingClientRect();
      const width = el.clientWidth || r.width;
      const height = el.clientHeight || r.height;
      const inside = e.clientX >= r.left && e.clientX <= r.left + width && e.clientY >= r.top && e.clientY <= r.top + height;
      setCross(inside ? { x: e.clientX, y: e.clientY, area: { left: r.left, top: r.top, width, height } } : null);
    };
    const leave = (e: MouseEvent) => e.relatedTarget === null && setCross(null);
    window.addEventListener('mousemove', move);
    document.addEventListener('mouseout', leave);
    return () => {
      window.removeEventListener('mousemove', move);
      document.removeEventListener('mouseout', leave);
    };
  }, [on]);

  if (!on || !cross) return null;
  const line = 'fixed pointer-events-none z-[60] bg-cad-accent opacity-70';
  const { x, y, area } = cross;
  return (
    <div data-testid="crosshair" aria-hidden="true">
      <div data-testid="crosshair-h" className={`${line} h-px`} style={{ top: y, left: area.left, width: area.width }} />
      <div data-testid="crosshair-v" className={`${line} w-px`} style={{ left: x, top: area.top, height: area.height }} />
    </div>
  );
};
