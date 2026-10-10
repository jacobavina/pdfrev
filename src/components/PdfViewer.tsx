import React, { useEffect, useRef, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';
import { renderPageToCanvas } from '../services/pdfService';
import {
  screenToNormalized,
  normalizedToScreen,
  hitTestMarkup,
} from '../utils/coordinates';
import {
  getEllipseGeometry,
  getRectGeometry,
  pointsToSvgPointsString,
  pointsToFreehandPathD,
  generateCloudPath,
} from '../core/markup/render';
import { Markup, MarkupPoint, MarkupType } from '../types/markup';
import { InlineTextEditor } from './markup/InlineTextEditor';

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
    updateMarkup,
    deleteSelectedMarkups,
  } = useMarkupStore();

  const { activeTool, currentStyle, author, activeLayer } = useToolStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [pageViewport, setPageViewport] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Estado del dibujo para figuras de 2 puntos (rect, circle, line, cloud)
  const [drawingStart, setDrawingStart] = useState<MarkupPoint | null>(null);
  const [currentDrawPoint, setCurrentDrawPoint] = useState<MarkupPoint | null>(null);

  // Estado del motor multi-punto (polygon y freehand)
  const [polygonPoints, setPolygonPoints] = useState<MarkupPoint[]>([]);
  const [freehandPoints, setFreehandPoints] = useState<MarkupPoint[]>([]);
  const [mouseCursorPoint, setMouseCursorPoint] = useState<MarkupPoint | null>(null);

  // Estado del editor de texto inline (B6)
  const [inlineEditing, setInlineEditing] = useState<{
    markupId: string;
    initialText: string;
    position: MarkupPoint;
  } | null>(null);

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

  // Manejar atajos de teclado: Escape (Criterio 3), Enter (cerrar polígono), Delete (borrar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Criterio 3: Escape cancela el trazo en curso
      if (e.key === 'Escape') {
        if (polygonPoints.length > 0 || freehandPoints.length > 0 || drawingStart) {
          e.preventDefault();
          setPolygonPoints([]);
          setFreehandPoints([]);
          setDrawingStart(null);
          setCurrentDrawPoint(null);
          setInlineEditing(null);
        }
        return;
      }

      // Enter finaliza el polígono si tiene >= 3 puntos
      if (e.key === 'Enter' && activeTool === 'polygon') {
        if (polygonPoints.length >= 3) {
          e.preventDefault();
          const newMarkup: Markup = {
            id: uuidv4(),
            type: 'polygon',
            pageIndex: currentPageIndex,
            points: [...polygonPoints],
            style: { ...currentStyle },
            author: author || 'Revisor',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'pending',
            layer: activeLayer,
          };
          addMarkup(newMarkup);
        }
        setPolygonPoints([]);
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
  }, [
    selectedMarkupIds,
    deleteSelectedMarkups,
    polygonPoints,
    freehandPoints,
    drawingStart,
    activeTool,
    currentPageIndex,
    currentStyle,
    author,
    activeLayer,
    addMarkup,
  ]);

  // Transformación para convertir coordenadas
  const viewportTransform = {
    width: pageViewport.width,
    height: pageViewport.height,
    scale: 1.0,
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
    if (e.button !== 0) return;
    const pt = getEventPoint(e);

    // 1. Modo Selección
    if (activeTool === 'select') {
      const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex);
      const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(pt, m));

      if (hit) {
        selectMarkup(hit.id, e.ctrlKey || e.metaKey);
      } else {
        deselectAll();
      }
      return;
    }

    // 2. Modo Polígono (Multi-punto)
    if (activeTool === 'polygon') {
      if (polygonPoints.length === 0) {
        setPolygonPoints([pt]);
      } else {
        // Comprobar si hace clic cerca del primer punto para cerrar el polígono
        const firstPt = polygonPoints[0];
        const distToFirst = Math.hypot(pt.x - firstPt.x, pt.y - firstPt.y);

        if (distToFirst < 0.02 && polygonPoints.length >= 3) {
          // Cerrar polígono
          const newMarkup: Markup = {
            id: uuidv4(),
            type: 'polygon',
            pageIndex: currentPageIndex,
            points: [...polygonPoints],
            style: { ...currentStyle },
            author: author || 'Revisor',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'pending',
            layer: activeLayer,
          };
          addMarkup(newMarkup);
          setPolygonPoints([]);
        } else {
          // Agregar nuevo vértice
          setPolygonPoints((prev) => [...prev, pt]);
        }
      }
      return;
    }

    // 3. Modo Mano Alzada (Freehand)
    if (activeTool === 'freehand') {
      setFreehandPoints([pt]);
      return;
    }

    // 4. Figuras de 2 puntos y Texto
    if (activeTool !== 'pan') {
      setDrawingStart(pt);
      setCurrentDrawPoint(pt);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getEventPoint(e);
    setMouseCursorPoint(pt);

    // Actualización de trazo a mano alzada
    if (activeTool === 'freehand' && freehandPoints.length > 0) {
      const last = freehandPoints[freehandPoints.length - 1];
      const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
      if (dist >= 0.002) {
        setFreehandPoints((prev) => [...prev, pt]);
      }
      return;
    }

    if (drawingStart) {
      setCurrentDrawPoint(pt);
    }
  };

  const handleMouseUp = (_e: React.MouseEvent<SVGSVGElement>) => {
    // Finalización de Freehand
    if (activeTool === 'freehand') {
      if (freehandPoints.length >= 2) {
        const newMarkup: Markup = {
          id: uuidv4(),
          type: 'freehand',
          pageIndex: currentPageIndex,
          points: [...freehandPoints],
          style: { ...currentStyle },
          author: author || 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
          layer: activeLayer,
        };
        addMarkup(newMarkup);
      }
      setFreehandPoints([]);
      return;
    }

    // Finalización de figuras de 2 puntos
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
    if (dist > 0.005 && activeTool !== 'select' && activeTool !== 'pan' && activeTool !== 'polygon') {
      const newId = uuidv4();
      const newMarkup: Markup = {
        id: newId,
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

      // Si es una marca de texto, abrir inmediatamente el editor inline
      if (activeTool === 'text') {
        setInlineEditing({
          markupId: newId,
          initialText: 'Nota técnica',
          position: drawingStart,
        });
      }
    }

    setDrawingStart(null);
    setCurrentDrawPoint(null);
  };

  // Doble clic para finalizar polígono o para abrir editor de texto
  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'polygon') {
      // Criterio 3: polígono con menos de 3 puntos se descarta sin crear marca
      if (polygonPoints.length >= 3) {
        const newMarkup: Markup = {
          id: uuidv4(),
          type: 'polygon',
          pageIndex: currentPageIndex,
          points: [...polygonPoints],
          style: { ...currentStyle },
          author: author || 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
          layer: activeLayer,
        };
        addMarkup(newMarkup);
      }
      setPolygonPoints([]);
      return;
    }

    // Doble clic sobre texto existente para editar inline
    const pt = getEventPoint(e);
    const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex);
    const textHit = [...pageMarkups]
      .reverse()
      .find((m) => m.type === 'text' && hitTestMarkup(pt, m));

    if (textHit) {
      setInlineEditing({
        markupId: textHit.id,
        initialText: textHit.text || '',
        position: textHit.points[0],
      });
    }
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

          {/* Editor inline genérico para texto y notas (B6) */}
          {inlineEditing && (
            <InlineTextEditor
              initialText={inlineEditing.initialText}
              position={inlineEditing.position}
              transform={viewportTransform}
              onCommit={(newText) => {
                updateMarkup(inlineEditing.markupId, { text: newText });
                setInlineEditing(null);
              }}
              onCancel={() => setInlineEditing(null)}
            />
          )}

          {/* Overlay interactivo SVG para anotaciones */}
          <svg
            data-testid="markup-overlay-svg"
            className={`absolute inset-0 w-full h-full ${
              activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            {/* Anotaciones guardadas en la página actual */}
            {pageMarkups.map((markup) => {
              const isSelected = selectedMarkupIds.includes(markup.id);
              const p1 = normalizedToScreen(markup.points[0] || { x: 0, y: 0 }, viewportTransform);
              const p2 = normalizedToScreen(
                markup.points[1] || markup.points[0] || { x: 0, y: 0 },
                viewportTransform
              );

              return (
                <g key={markup.id} className="transition-opacity">
                  {/* 1. Rectángulo / Highlight */}
                  {(markup.type === 'rectangle' ||
                    markup.type === 'highlight' ||
                    markup.type === 'highlightVector' ||
                    markup.type === 'highlightText') && (
                    <rect
                      x={Math.min(p1.x, p2.x)}
                      y={Math.min(p1.y, p2.y)}
                      width={Math.max(2, Math.abs(p2.x - p1.x))}
                      height={Math.max(2, Math.abs(p2.y - p1.y))}
                      stroke={markup.style.strokeColor}
                      strokeWidth={markup.style.strokeWidth}
                      fill={markup.style.fillColor || 'transparent'}
                      opacity={markup.style.opacity}
                    />
                  )}

                  {/* 2. Círculo / Elipse inscrita */}
                  {markup.type === 'circle' && (() => {
                    const ell = getEllipseGeometry(p1, p2);
                    return (
                      <ellipse
                        cx={ell.cx}
                        cy={ell.cy}
                        rx={ell.rx}
                        ry={ell.ry}
                        stroke={markup.style.strokeColor}
                        strokeWidth={markup.style.strokeWidth}
                        fill={markup.style.fillColor || 'transparent'}
                        opacity={markup.style.opacity}
                      />
                    );
                  })()}

                  {/* 3. Línea */}
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

                  {/* 4. Polígono (Multi-punto) */}
                  {markup.type === 'polygon' && (
                    <polygon
                      points={pointsToSvgPointsString(markup.points, viewportTransform)}
                      stroke={markup.style.strokeColor}
                      strokeWidth={markup.style.strokeWidth}
                      fill={markup.style.fillColor || 'transparent'}
                      opacity={markup.style.opacity}
                    />
                  )}

                  {/* 5. Mano alzada (Freehand) */}
                  {markup.type === 'freehand' && (
                    <path
                      d={pointsToFreehandPathD(markup.points, viewportTransform)}
                      fill="none"
                      stroke={markup.style.strokeColor}
                      strokeWidth={markup.style.strokeWidth}
                      opacity={markup.style.opacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* 6. Nube de revisión */}
                  {(markup.type === 'cloud' || markup.type === 'cloudPlus') && (
                    <path
                      d={generateCloudPath(p1, p2)}
                      stroke={markup.style.strokeColor}
                      strokeWidth={markup.style.strokeWidth}
                      fill={markup.style.fillColor || 'rgba(230, 240, 255, 0.2)'}
                      opacity={markup.style.opacity}
                    />
                  )}

                  {/* 7. Texto / Nota técnica */}
                  {markup.type === 'text' && (() => {
                    const rect = getRectGeometry(p1, p2);
                    const width = Math.max(80, rect.width);
                    const height = Math.max(26, rect.height);
                    return (
                      <g className="cursor-text">
                        <rect
                          x={rect.x}
                          y={rect.y}
                          width={width}
                          height={height}
                          fill="#fffbe8"
                          stroke={markup.style.strokeColor}
                          strokeWidth={1}
                          rx={2}
                        />
                        <text
                          x={rect.x + 6}
                          y={rect.y + 16}
                          fontSize={12}
                          fill="#1f2937"
                          fontFamily="sans-serif"
                          className="font-medium pointer-events-none"
                        >
                          {markup.text || 'Nota'}
                        </text>
                      </g>
                    );
                  })()}

                  {/* Bounding box de selección activa */}
                  {isSelected && (() => {
                    const b = markup.points.reduce(
                      (acc, pt) => {
                        const scr = normalizedToScreen(pt, viewportTransform);
                        return {
                          minX: Math.min(acc.minX, scr.x),
                          minY: Math.min(acc.minY, scr.y),
                          maxX: Math.max(acc.maxX, scr.x),
                          maxY: Math.max(acc.maxY, scr.y),
                        };
                      },
                      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
                    );

                    if (b.minX !== Infinity) {
                      return (
                        <rect
                          x={b.minX - 4}
                          y={b.minY - 4}
                          width={Math.max(8, b.maxX - b.minX + 8)}
                          height={Math.max(8, b.maxY - b.minY + 8)}
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth={1.5}
                          strokeDasharray="4 2"
                          className="pointer-events-none"
                        />
                      );
                    }
                    return null;
                  })()}
                </g>
              );
            })}

            {/* Previsualización en vivo mientras se dibuja */}
            {/* A. Polígono en construcción */}
            {activeTool === 'polygon' && polygonPoints.length > 0 && (
              <g className="pointer-events-none">
                <polyline
                  points={
                    pointsToSvgPointsString(polygonPoints, viewportTransform) +
                    (mouseCursorPoint
                      ? ` ${normalizedToScreen(mouseCursorPoint, viewportTransform).x.toFixed(2)},${normalizedToScreen(mouseCursorPoint, viewportTransform).y.toFixed(2)}`
                      : '')
                  }
                  stroke={currentStyle.strokeColor}
                  strokeWidth={currentStyle.strokeWidth}
                  fill="rgba(0, 122, 204, 0.1)"
                  strokeDasharray="4 2"
                />
                {polygonPoints.map((pt, idx) => {
                  const scr = normalizedToScreen(pt, viewportTransform);
                  return (
                    <circle
                      key={idx}
                      cx={scr.x}
                      cy={scr.y}
                      r={idx === 0 ? 5 : 3}
                      fill={idx === 0 ? '#10b981' : currentStyle.strokeColor}
                    />
                  );
                })}
              </g>
            )}

            {/* B. Trazo a mano alzada en curso */}
            {activeTool === 'freehand' && freehandPoints.length > 0 && (
              <path
                d={pointsToFreehandPathD(freehandPoints, viewportTransform)}
                fill="none"
                stroke={currentStyle.strokeColor}
                strokeWidth={currentStyle.strokeWidth}
                strokeLinecap="round"
                className="pointer-events-none"
              />
            )}

            {/* C. Figuras de 2 puntos en curso */}
            {drawingStart && currentDrawPoint && (
              <g className="pointer-events-none">
                {(() => {
                  const p1 = normalizedToScreen(drawingStart, viewportTransform);
                  const p2 = normalizedToScreen(currentDrawPoint, viewportTransform);

                  if (activeTool === 'rectangle') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        stroke={currentStyle.strokeColor}
                        strokeWidth={currentStyle.strokeWidth}
                        fill="rgba(0, 122, 204, 0.15)"
                        strokeDasharray="4 2"
                      />
                    );
                  }

                  if (activeTool === 'circle') {
                    const ell = getEllipseGeometry(p1, p2);
                    return (
                      <ellipse
                        cx={ell.cx}
                        cy={ell.cy}
                        rx={ell.rx}
                        ry={ell.ry}
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
                        d={generateCloudPath(p1, p2)}
                        stroke={currentStyle.strokeColor}
                        strokeWidth={currentStyle.strokeWidth}
                        fill="rgba(34, 197, 94, 0.15)"
                      />
                    );
                  }

                  if (activeTool === 'text') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={Math.max(60, rect.width)}
                        height={Math.max(24, rect.height)}
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
