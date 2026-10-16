import React, { useEffect, useState } from 'react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { rulerTicks, RulerTick, RULER_SIZE } from '../../core/measurements/rulers';

/**
 * Reglas superior e izquierda (ADR-0029). Siguen a la hoja activa: el cero es su esquina superior izquierda y las
 * unidades son las de la escala de esa página (o milímetros de papel sin escala). Una marca indica el cursor.
 */

interface Geometry {
  /** Esquina de la hoja respecto al área de las reglas, en px. */
  left: number;
  top: number;
  width: number;
  height: number;
}

const findViewer = () => document.querySelector<HTMLElement>('[data-testid="pdf-viewer-container"]');
const findPage = () => document.querySelector<HTMLElement>('[data-testid="pdf-page-container"]');

export const Rulers: React.FC<{ hostRef: React.RefObject<HTMLDivElement> }> = ({ hostRef }) => {
  const { scale, rotation, currentPageIndex, pdfBytes } = useDocumentStore();
  const getPageCalibration = useCalibrationStore((s) => s.getPageCalibration);
  useCalibrationStore((s) => s.calibrations);
  const [geom, setGeom] = useState<Geometry | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Posición de la hoja: se recalcula al desplazar, redimensionar, cambiar de zoom o de página. Efecto pasivo: la
  // ref del contenedor (un ancestro) ya está asignada cuando se ejecuta
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const host = hostRef.current;
      const page = findPage();
      if (!host) return;
      const hr = host.getBoundingClientRect();
      setSize({ w: hr.width, h: hr.height });
      if (!page) {
        setGeom(null);
        return;
      }
      const pr = page.getBoundingClientRect();
      setGeom({ left: pr.left - hr.left - RULER_SIZE, top: pr.top - hr.top - RULER_SIZE, width: pr.width, height: pr.height });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    const viewer = findViewer();
    viewer?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (ro && hostRef.current) ro.observe(hostRef.current);
    // El visor cambia el tamaño de la hoja al hacer zoom; observarla cubre también los renders diferidos
    const page = findPage();
    if (ro && page) ro.observe(page);
    const onMove = (e: MouseEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const hr = host.getBoundingClientRect();
      setCursor({ x: e.clientX - hr.left - RULER_SIZE, y: e.clientY - hr.top - RULER_SIZE });
    };
    const onLeave = () => setCursor(null);
    viewer?.addEventListener('mousemove', onMove);
    viewer?.addEventListener('mouseleave', onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      viewer?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      viewer?.removeEventListener('mousemove', onMove);
      viewer?.removeEventListener('mouseleave', onLeave);
      ro?.disconnect();
    };
  }, [hostRef, scale, rotation, currentPageIndex, pdfBytes]);

  // Un render más cuando el visor termina de colocar la hoja tras cambiar de documento
  useEffect(() => {
    const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    return () => window.clearTimeout(id);
  }, [pdfBytes, currentPageIndex]);

  const calib = getPageCalibration(currentPageIndex);
  const swapped = rotation === 90 || rotation === 270;
  const sx = calib.scale;
  const sy = calib.scaleY ?? calib.scale;
  const pxPerPt = scale || 1;
  const unitsPerPxX = (swapped ? sy : sx) / pxPerPt;
  const unitsPerPxY = (swapped ? sx : sy) / pxPerPt;
  const lenX = Math.max(0, size.w - RULER_SIZE);
  const lenY = Math.max(0, size.h - RULER_SIZE);
  const ticksX = geom ? rulerTicks({ originPx: geom.left, lengthPx: lenX, unitsPerPx: unitsPerPxX }) : [];
  const ticksY = geom ? rulerTicks({ originPx: geom.top, lengthPx: lenY, unitsPerPx: unitsPerPxY }) : [];

  const tickLine = (t: RulerTick, horizontal: boolean) => {
    const len = t.major ? RULER_SIZE : 5;
    return horizontal ? (
      <line key={`l${t.pos}`} x1={t.pos} x2={t.pos} y1={RULER_SIZE - len} y2={RULER_SIZE} />
    ) : (
      <line key={`l${t.pos}`} y1={t.pos} y2={t.pos} x1={RULER_SIZE - len} x2={RULER_SIZE} />
    );
  };

  return (
    <>
      <div
        data-testid="ruler-corner"
        className="absolute left-0 top-0 z-20 bg-cad-panel border-r border-b border-cad-border text-2xs text-gray-400 flex items-center justify-center"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
        title={`Ruler units: ${calib.unit}`}
      >
        {calib.unit}
      </div>
      <svg
        data-testid="ruler-top"
        className="absolute top-0 z-20 bg-cad-panel border-b border-cad-border text-gray-400"
        style={{ left: RULER_SIZE, width: lenX, height: RULER_SIZE }}
        width={lenX}
        height={RULER_SIZE}
      >
        <g stroke="currentColor" strokeWidth={1} shapeRendering="crispEdges">
          {ticksX.map((t) => tickLine(t, true))}
        </g>
        <g fill="currentColor" fontSize={11} fontFamily="Helvetica, Arial, sans-serif">
          {ticksX
            .filter((t) => t.label !== undefined)
            .map((t) => (
              <text key={`t${t.pos}`} x={t.pos + 2} y={11}>
                {t.label}
              </text>
            ))}
        </g>
        {cursor && cursor.x >= 0 && <line data-testid="ruler-top-cursor" x1={cursor.x} x2={cursor.x} y1={0} y2={RULER_SIZE} stroke="#e02424" />}
      </svg>
      <svg
        data-testid="ruler-left"
        className="absolute left-0 z-20 bg-cad-panel border-r border-cad-border text-gray-400"
        style={{ top: RULER_SIZE, width: RULER_SIZE, height: lenY }}
        width={RULER_SIZE}
        height={lenY}
      >
        <g stroke="currentColor" strokeWidth={1} shapeRendering="crispEdges">
          {ticksY.map((t) => tickLine(t, false))}
        </g>
        <g fill="currentColor" fontSize={11} fontFamily="Helvetica, Arial, sans-serif">
          {ticksY
            .filter((t) => t.label !== undefined)
            .map((t) => (
              <text key={`t${t.pos}`} x={11} y={t.pos + 2} transform={`rotate(-90 11 ${t.pos + 2})`} textAnchor="end">
                {t.label}
              </text>
            ))}
        </g>
        {cursor && cursor.y >= 0 && <line data-testid="ruler-left-cursor" y1={cursor.y} y2={cursor.y} x1={0} x2={RULER_SIZE} stroke="#e02424" />}
      </svg>
    </>
  );
};

export default Rulers;
