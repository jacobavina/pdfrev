import React, { useEffect, useRef, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';
import { loadPdfDocument, renderPageToCanvas } from '../services/pdfService';
import {
  screenToNormalized,
  normalizedToScreen,
  hitTestMarkup,
} from '../utils/coordinates';
import { Markup, MarkupPoint, MarkupType } from '../types/markup';

export const PdfViewer: React.FC = () => {
  const {
    pdfBytes,
    pdfDoc,
    currentPageIndex,
    scale,
    rotation,
    setPageDimensions,
    isLoading,
    error,
  } = useDocumentStore();

  const {
    markups,
    selectedMarkupIds,
    selectMarkup,
    deselectAll,
    addMarkup,
    deleteSelectedMarkups,
  } = useMarkupStore();

  const { activeTool, currentStyle, author, activeLayer } = useToolStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [pageViewport, setPageViewport] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Estado del dibujo activo en pantalla
  const [drawingStart, setDrawingStart] = useState<MarkupPoint | null>(null);
  const [currentDrawPoint, setCurrentDrawPoint] = useState<MarkupPoint | null>(null);

  // Renderizar la página activa con PDF.js
  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
      if (!canvasRef.current || !pdfDoc) return;

      try {
        const result = await renderPageToCanvas(pdfDoc, currentPageIndex, canvasRef.current, {
          scale,
          rotation,
        });

        if (!isCancelled) {
          setPageViewport({ width: result.width, height: result.height });
          setPageDimensions(currentPageIndex, result.width, result.height);
        }
      } catch (err) {
        console.error('Error renderizando página PDF:', err);
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPageIndex, scale, rotation, setPageDimensions]);

  // Manejar atajo de teclado Supr / Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedMarkupIds.length > 0) {
          e.preventDefault();
          deleteSelectedMarkups();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMarkupIds, deleteSelectedMarkups]);

  // Transformación para convertir coordenadas
  const viewportTransform = {
    width: pageViewport.width,
    height: pageViewport.height,
    scale: 1.0, // el scale ya está aplicado en pageViewport
    offsetX: 0,
    offsetY: 0,
  };

  const getEventPoint = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): MarkupPoint => {
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      return screenToNormalized(screenX, screenY, viewportTransform);
    },
    [viewportTransform]
  );

  // Inicio de interacción con el ratón
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; // Solo clic primario
    const pt = getEventPoint(e);

    if (activeTool === 'select') {
      // Hit testing sobre las marcas de la página actual
      const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex);
      // Invertir para seleccionar la de más arriba primero
      const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(pt, m));

      if (hit) {
        selectMarkup(hit.id, e.ctrlKey || e.metaKey);
      } else {
        deselectAll();
      }
      return;
    }

    if (activeTool !== 'pan') {
      setDrawingStart(pt);
      setCurrentDrawPoint(pt);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingStart) return;
    const pt = getEventPoint(e);
    setCurrentDrawPoint(pt);
  };

  const handleMouseUp = () => {
    if (!drawingStart || !currentDrawPoint) {
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      return;
    }

    const dist = Math.hypot(
      currentDrawPoint.x - drawingStart.x,
      currentDrawPoint.y - drawingStart.y
    );

    // Evitar crear marcas accidentales con un microclic
    if (dist > 0.005 && activeTool !== 'select' && activeTool !== 'pan') {
      const newMarkup: Markup = {
        id: uuidv4(),
        type: activeTool as MarkupType,
        pageIndex: currentPageIndex,
        points: [drawingStart, currentDrawPoint],
        style: { ...currentStyle },
        text: activeTool === 'text' ? 'Nota técnica' : undefined,
        author: author || 'Revisor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
        layer: activeLayer,
      };

      addMarkup(newMarkup);
    }

    setDrawingStart(null);
    setCurrentDrawPoint(null);
  };

  // Genera el camino SVG para nubes de revisión técnica
  const renderCloudPath = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const left = Math.min(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);

    const step = 20;
    const stepsX = Math.max(2, Math.round(width / step));
    const stepsY = Math.max(2, Math.round(height / step));
    const stepW = width / stepsX;
    const stepH = height / stepsY;

    let d = `M ${left} ${top}`;
    // Top border
    for (let i = 0; i < stepsX; i++) {
      const x1 = left + i * stepW;
      const x2 = x1 + stepW;
      d += ` Q ${x1 + stepW / 2} ${top - 8} ${x2} ${top}`;
    }
    // Right border
    for (let i = 0; i < stepsY; i++) {
      const y1 = top + i * stepH;
      const y2 = y1 + stepH;
      d += ` Q ${left + width + 8} ${y1 + stepH / 2} ${left + width} ${y2}`;
    }
    // Bottom border
    for (let i = stepsX; i > 0; i--) {
      const x2 = left + i * stepW;
      const x1 = x2 - stepW;
      d += ` Q ${x1 + stepW / 2} ${top + height + 8} ${x1} ${top + height}`;
    }
    // Left border
    for (let i = stepsY; i > 0; i--) {
      const y2 = top + i * stepH;
      const y1 = y2 - stepH;
      d += ` Q ${left - 8} ${y1 + stepH / 2} ${left} ${y1}`;
    }
    d += ' Z';
    return d;
  };

  const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex);

  return (
    <div
      ref={containerRef}
      data-testid="pdf-viewer-container"
      className="flex-1 bg-cad-canvas overflow-auto relative flex items-center justify-center p-8 select-none"
    >
      {isLoading && (
        <div className="absolute inset-0 bg-cad-canvas/80 flex items-center justify-center z-30">
          <div className="text-gray-300 font-medium animate-pulse">Cargando documento PDF...</div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-950 border border-rose-700 text-rose-200 rounded max-w-md text-center">
          {error}
        </div>
      )}

      {!pdfBytes && !isLoading && !error && (
        <div className="text-center text-gray-500">
          <p className="text-base font-semibold mb-1">Ningún documento abierto</p>
          <p className="text-xs">Usa el botón "Abrir PDF" en la barra superior para cargar un plano</p>
        </div>
      )}

      {pdfBytes && (
        <div
          className="relative shadow-2xl bg-white"
          style={{ width: `${pageViewport.width}px`, height: `${pageViewport.height}px` }}
        >
          {/* Canvas de PDF.js */}
          <canvas
            ref={canvasRef}
            id="pdf-render-canvas"
            data-testid="pdf-canvas"
            className="block"
          />

          {/* Overlay interactivo SVG para anotaciones */}
          <svg
            data-testid="markup-overlay-svg"
            className={`absolute inset-0 w-full h-full ${
              activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Anotaciones guardadas en la página actual */}
            {pageMarkups.map((markup) => {
              const isSelected = selectedMarkupIds.includes(markup.id);
              const p1 = normalizedToScreen(markup.points[0], viewportTransform);
              const p2 = normalizedToScreen(
                markup.points[1] || markup.points[0],
                viewportTransform
              );

              const left = Math.min(p1.x, p2.x);
              const top = Math.min(p1.y, p2.y);
              const width = Math.max(2, Math.abs(p2.x - p1.x));
              const height = Math.max(2, Math.abs(p2.y - p1.y));

              return (
                <g key={markup.id} className="transition-opacity">
                  {markup.type === 'rectangle' && (
                    <rect
                      x={left}
                      y={top}
                      width={width}
                      height={height}
                      stroke={markup.style.strokeColor}
                      strokeWidth={markup.style.strokeWidth}
                      fill={markup.style.fillColor || 'transparent'}
                      opacity={markup.style.opacity}
                    />
                  )}

                  {markup.type === 'line' && (
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={markup.style.strokeColor}
                      strokeWidth={markup.style.strokeWidth}
                      opacity={markup.style.opacity}
                    />
                  )}

                  {(markup.type === 'cloud' || markup.type === 'cloudPlus') && (
                    <path
                      d={renderCloudPath(p1, p2)}
                      stroke={markup.style.strokeColor}
                      strokeWidth={markup.style.strokeWidth}
                      fill={markup.style.fillColor || 'rgba(230, 240, 255, 0.2)'}
                      opacity={markup.style.opacity}
                    />
                  )}

                  {markup.type === 'text' && (
                    <g>
                      <rect
                        x={left}
                        y={top}
                        width={Math.max(80, width)}
                        height={Math.max(26, height)}
                        fill="#fffbe8"
                        stroke={markup.style.strokeColor}
                        strokeWidth={1}
                        rx={2}
                      />
                      <text
                        x={left + 6}
                        y={top + 16}
                        fontSize={12}
                        fill="#1f2937"
                        fontFamily="sans-serif"
                        className="font-medium"
                      >
                        {markup.text || 'Nota'}
                      </text>
                    </g>
                  )}

                  {/* Bounding box y selección activa */}
                  {isSelected && (
                    <rect
                      x={left - 3}
                      y={top - 3}
                      width={width + 6}
                      height={height + 6}
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />
                  )}
                </g>
              );
            })}

            {/* Vista previa en tiempo real mientras se dibuja */}
            {drawingStart && currentDrawPoint && (
              <g className="pointer-events-none">
                {(() => {
                  const p1 = normalizedToScreen(drawingStart, viewportTransform);
                  const p2 = normalizedToScreen(currentDrawPoint, viewportTransform);
                  const left = Math.min(p1.x, p2.x);
                  const top = Math.min(p1.y, p2.y);
                  const width = Math.abs(p2.x - p1.x);
                  const height = Math.abs(p2.y - p1.y);

                  if (activeTool === 'rectangle') {
                    return (
                      <rect
                        x={left}
                        y={top}
                        width={width}
                        height={height}
                        stroke={currentStyle.strokeColor}
                        strokeWidth={currentStyle.strokeWidth}
                        fill="rgba(0, 122, 204, 0.15)"
                        strokeDasharray="4 2"
                      />
                    );
                  }

                  if (activeTool === 'line') {
                    return (
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke={currentStyle.strokeColor}
                        strokeWidth={currentStyle.strokeWidth}
                        strokeDasharray="4 2"
                      />
                    );
                  }

                  if (activeTool === 'cloud') {
                    return (
                      <path
                        d={renderCloudPath(p1, p2)}
                        stroke={currentStyle.strokeColor}
                        strokeWidth={currentStyle.strokeWidth}
                        fill="rgba(34, 197, 94, 0.15)"
                      />
                    );
                  }

                  if (activeTool === 'text') {
                    return (
                      <rect
                        x={left}
                        y={top}
                        width={Math.max(60, width)}
                        height={Math.max(24, height)}
                        stroke={currentStyle.strokeColor}
                        strokeWidth={1}
                        fill="#fffbe8"
                        strokeDasharray="3 3"
                      />
                    );
                  }

                  return null;
                })()}
              </g>
            )}
          </svg>
        </div>
      )}
    </div>
  );
};
