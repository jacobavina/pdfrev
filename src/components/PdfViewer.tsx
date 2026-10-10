import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';
import { renderPageToCanvas } from '../services/pdfService';
import {
  screenToNormalized,
  normalizedToScreen,
  hitTestMarkup,
  selectMarkupsInRect,
} from '../utils/coordinates';
import {
  handleSelectMouseDown,
  handleSelectMouseMove,
  handleSelectMouseUp,
  DragState,
} from '../utils/dragInteraction';
import {
  getEllipseGeometry,
  getRectGeometry,
  pointsToSvgPointsString,
  pointsToFreehandPathD,
  generateCloudPath,
  getMarkupSvgDescriptor,
  renderSvgDescriptor,
  DEFAULT_ARC_STEP,
  estimateCalloutBoxNormalizedSize,
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
    setSelectedMarkupIds,
    deselectAll,
    addMarkup,
    addMarkups,
    updateMarkup,
    deleteSelectedMarkups,
    setMarkupsTransient,
    commitMoveMarkups,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useMarkupStore();

  const { activeTool, currentStyle, author, activeLayer } = useToolStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const markupsRef = useRef(markups);
  markupsRef.current = markups;

  const anchorDragRef = useRef<{
    markupId: string;
    leaderIndex: number;
    initialLeaders: MarkupPoint[][];
    startScreenX: number;
    startScreenY: number;
    hasMoved: boolean;
  } | null>(null);

  const marqueeStateRef = useRef<{
    start: MarkupPoint;
    current: MarkupPoint;
    isAdditive: boolean;
    initialSelectedIds: string[];
  } | null>(null);

  const [marqueeState, setMarqueeState] = useState<{
    start: MarkupPoint;
    current: MarkupPoint;
  } | null>(null);

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

      // Criterio 3: Escape cancela el trazo en curso, el arrastre activo o el marquee
      if (e.key === 'Escape') {
        if (marqueeStateRef.current) {
          e.preventDefault();
          setSelectedMarkupIds(marqueeStateRef.current.initialSelectedIds);
          marqueeStateRef.current = null;
          setMarqueeState(null);
          return;
        }
        if (dragStateRef.current) {
          e.preventDefault();
          const initial = dragStateRef.current.initialMarkups;
          dragStateRef.current = null;
          setMarkupsTransient(initial);
          return;
        }
        if (anchorDragRef.current) {
          e.preventDefault();
          const { markupId, initialLeaders } = anchorDragRef.current;
          anchorDragRef.current = null;
          const target = markupsRef.current.find((m) => m.id === markupId);
          if (target) {
            setMarkupsTransient([{ ...target, leaders: initialLeaders }]);
          }
          return;
        }
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
        return;
      }

      // Atajos globales de Deshacer / Rehacer (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'q' || e.key === 'Q')) {
        useToolStore.getState().setActiveTool('callout');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedMarkupIds,
    deleteSelectedMarkups,
    undo,
    redo,
    canUndo,
    canRedo,
    polygonPoints,
    freehandPoints,
    drawingStart,
    activeTool,
    currentPageIndex,
    currentStyle,
    author,
    activeLayer,
    addMarkup,
    setSelectedMarkupIds,
    setMarkupsTransient,
  ]);

  // Transformación para convertir coordenadas
  const viewportTransform = useMemo(
    () => ({
      width: pageViewport.width,
      height: pageViewport.height,
      scale: 1.0,
      offsetX: 0,
      offsetY: 0,
    }),
    [pageViewport.width, pageViewport.height]
  );

  // Listener global de mouseup para asegurar finalización de arrastre limpia incluso fuera del svg
  useEffect(() => {
    const handleWindowMouseUp = (e: MouseEvent) => {
      if (marqueeStateRef.current) {
        marqueeStateRef.current = null;
        setMarqueeState(null);
      }
      if (dragStateRef.current) {
        const result = handleSelectMouseUp({
          screenX: e.clientX,
          screenY: e.clientY,
          dragState: dragStateRef.current,
          viewportTransform,
          thresholdPx: 4,
        });
        dragStateRef.current = null;
        if (result.moves && result.moves.length > 0) {
          commitMoveMarkups(result.moves);
        } else if (result.restoredMarkups) {
          setMarkupsTransient(result.restoredMarkups);
        }
      }
      if (anchorDragRef.current) {
        const { markupId, initialLeaders, hasMoved } = anchorDragRef.current;
        anchorDragRef.current = null;
        if (hasMoved) {
          const currentMarkups = useMarkupStore.getState().markups;
          const target = currentMarkups.find((m) => m.id === markupId);
          if (target && target.leaders) {
            commitMoveMarkups([
              {
                id: markupId,
                originalPoints: target.points.map((p) => ({ ...p })),
                newPoints: target.points.map((p) => ({ ...p })),
                originalLeaders: initialLeaders,
                newLeaders: target.leaders,
              },
            ]);
          }
        }
      }
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [viewportTransform, commitMoveMarkups, setMarkupsTransient]);

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

    // 1. Modo Selección (A.0 y A.2: Vacío -> Marquee, Marca -> Movimiento)
    if (activeTool === 'select') {
      const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex);
      const isAdditive = Boolean(e.ctrlKey || e.metaKey || e.shiftKey);
      const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(pt, m));

      if (hit) {
        const newDragState = handleSelectMouseDown({
          point: pt,
          screenX: e.clientX,
          screenY: e.clientY,
          isCtrlOrShift: isAdditive,
          pageMarkups,
          selectedMarkupIds,
          selectMarkup,
          deselectAll,
        });
        dragStateRef.current = newDragState;
        return;
      }

      // Vacío -> Iniciar Marquee de selección elástico
      if (!isAdditive) {
        deselectAll();
      }
      const initialSelected = isAdditive ? [...selectedMarkupIds] : [];
      marqueeStateRef.current = {
        start: pt,
        current: pt,
        isAdditive,
        initialSelectedIds: initialSelected,
      };
      setMarqueeState({ start: pt, current: pt });
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

    // Arrastre independiente de ancla de directriz (Callout)
    if (anchorDragRef.current) {
      const { markupId, leaderIndex } = anchorDragRef.current;
      anchorDragRef.current.hasMoved = true;
      const clampedPt = {
        x: Math.max(0, Math.min(1, pt.x)),
        y: Math.max(0, Math.min(1, pt.y)),
      };
      const target = markupsRef.current.find((m) => m.id === markupId);
      if (target && target.leaders) {
        const updatedLeaders = target.leaders.map((lead, idx) =>
          idx === leaderIndex ? [clampedPt, ...lead.slice(1)] : lead
        );
        setMarkupsTransient([{ ...target, leaders: updatedLeaders }]);
      }
      return;
    }

    // Arrastre interactivo o Marquee en modo selección
    if (activeTool === 'select') {
      if (dragStateRef.current) {
        const moveResult = handleSelectMouseMove({
          screenX: e.clientX,
          screenY: e.clientY,
          dragState: dragStateRef.current,
          viewportTransform,
          thresholdPx: 4,
        });

        if (moveResult.hasMovedPastThreshold && moveResult.updatedMarkups) {
          setMarkupsTransient(moveResult.updatedMarkups);
        }
        return;
      }

      if (marqueeStateRef.current) {
        const startPt = marqueeStateRef.current.start;
        marqueeStateRef.current.current = pt;
        setMarqueeState({ start: startPt, current: pt });

        const minX = Math.min(startPt.x, pt.x);
        const maxX = Math.max(startPt.x, pt.x);
        const minY = Math.min(startPt.y, pt.y);
        const maxY = Math.max(startPt.y, pt.y);
        const marqueeRect = {
          x: minX,
          y: minY,
          width: Math.max(0, maxX - minX),
          height: Math.max(0, maxY - minY),
        };

        const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex);
        const intersectingIds = selectMarkupsInRect(pageMarkups, marqueeRect);

        if (marqueeStateRef.current.isAdditive) {
          const combined = Array.from(
            new Set([...marqueeStateRef.current.initialSelectedIds, ...intersectingIds])
          );
          setSelectedMarkupIds(combined);
        } else {
          setSelectedMarkupIds(intersectingIds);
        }
        return;
      }
    }

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
    // Finalización de arrastre de ancla de directriz
    if (anchorDragRef.current) {
      const { markupId, initialLeaders, hasMoved } = anchorDragRef.current;
      anchorDragRef.current = null;
      if (hasMoved) {
        const target = markupsRef.current.find((m) => m.id === markupId);
        if (target && target.leaders) {
          commitMoveMarkups([
            {
              id: markupId,
              originalPoints: target.points.map((p) => ({ ...p })),
              newPoints: target.points.map((p) => ({ ...p })),
              originalLeaders: initialLeaders,
              newLeaders: target.leaders,
            },
          ]);
        }
      }
      return;
    }

    // Finalización de arrastre o Marquee en modo selección
    if (activeTool === 'select') {
      if (marqueeStateRef.current) {
        marqueeStateRef.current = null;
        setMarqueeState(null);
        return;
      }
      if (dragStateRef.current) {
        const result = handleSelectMouseUp({
          screenX: _e.clientX,
          screenY: _e.clientY,
          dragState: dragStateRef.current,
          viewportTransform,
          thresholdPx: 4,
        });
        dragStateRef.current = null;
        if (result.moves && result.moves.length > 0) {
          commitMoveMarkups(result.moves);
        } else if (result.restoredMarkups) {
          setMarkupsTransient(result.restoredMarkups);
        }
        return;
      }
    }
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
      const now = new Date().toISOString();

      if (activeTool === 'cloudPlus') {
        const groupId = uuidv4();
        const cloudId = uuidv4();
        const calloutId = uuidv4();

        const minX = Math.min(drawingStart.x, currentDrawPoint.x);
        const maxX = Math.max(drawingStart.x, currentDrawPoint.x);
        const minY = Math.min(drawingStart.y, currentDrawPoint.y);
        const maxY = Math.max(drawingStart.y, currentDrawPoint.y);

        const calloutWidth = 0.12;
        const calloutHeight = 0.04;
        let boxX = maxX + 0.03;
        if (boxX + calloutWidth > 0.99) {
          boxX = Math.max(0.01, minX - calloutWidth - 0.03);
        }
        let boxY = minY - 0.04;
        if (boxY < 0.01) {
          boxY = Math.min(0.95, maxY + 0.03);
        }

        const boxP1 = {
          x: Math.max(0, Math.min(0.99 - calloutWidth, boxX)),
          y: Math.max(0, Math.min(0.99 - calloutHeight, boxY)),
        };
        const boxP2 = { x: boxP1.x + calloutWidth, y: boxP1.y + calloutHeight };
        const arrowTarget = { x: maxX, y: minY };

        const cloudMarkup: Markup = {
          id: cloudId,
          type: 'cloudPlus',
          pageIndex: currentPageIndex,
          points: [drawingStart, currentDrawPoint],
          style: { ...currentStyle },
          author: author || 'Revisor',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: activeLayer,
          groupId,
          customFields: { arcStep: DEFAULT_ARC_STEP },
        };

        const calloutMarkup: Markup = {
          id: calloutId,
          type: 'callout',
          pageIndex: currentPageIndex,
          points: [boxP1, boxP2],
          leaders: [[arrowTarget]],
          style: {
            ...currentStyle,
            fillColor: '#ffffff',
            strokeWidth: 1.5,
          },
          text: 'Nota Cloud+',
          author: author || 'Revisor',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: activeLayer,
          groupId,
        };

        addMarkups([cloudMarkup, calloutMarkup], 'Crear Cloud+');
      } else if (activeTool === 'callout') {
        const newId = uuidv4();
        const initialText = 'Nota técnica';
        const unscaledWidth = pageViewport.width / (scale || 1.0);
        const unscaledHeight = pageViewport.height / (scale || 1.0);
        const normSize = estimateCalloutBoxNormalizedSize(
          initialText,
          10,
          unscaledWidth,
          unscaledHeight
        );
        const boxP1 = {
          x: Math.max(0, Math.min(1 - normSize.width, currentDrawPoint.x)),
          y: Math.max(0, Math.min(1 - normSize.height, currentDrawPoint.y)),
        };
        const boxP2 = {
          x: boxP1.x + normSize.width,
          y: boxP1.y + normSize.height,
        };

        const calloutMarkup: Markup = {
          id: newId,
          type: 'callout',
          pageIndex: currentPageIndex,
          points: [boxP1, boxP2],
          leaders: [[{ x: drawingStart.x, y: drawingStart.y }]],
          style: {
            ...currentStyle,
            fillColor:
              currentStyle.fillColor && currentStyle.fillColor !== 'transparent'
                ? currentStyle.fillColor
                : '#ffffff',
            strokeWidth: currentStyle.strokeWidth || 1.5,
          },
          text: initialText,
          author: author || 'Revisor',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: activeLayer,
        };

        addMarkup(calloutMarkup);
        setSelectedMarkupIds([newId]);
        setInlineEditing({
          markupId: newId,
          initialText,
          position: boxP1,
        });
      } else {
        const newId = uuidv4();
        const customFields = activeTool === 'cloud' ? { arcStep: DEFAULT_ARC_STEP } : undefined;
        const newMarkup: Markup = {
          id: newId,
          type: activeTool as MarkupType,
          pageIndex: currentPageIndex,
          points: [drawingStart, currentDrawPoint],
          style: { ...currentStyle },
          text: activeTool === 'text' ? 'Nota técnica' : undefined,
          author: author || 'Revisor',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: activeLayer,
          customFields,
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

    // Doble clic sobre texto o callout existente para editar inline
    const pt = getEventPoint(e);
    const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex);
    const hit = [...pageMarkups]
      .reverse()
      .find((m) => (m.type === 'text' || m.type === 'callout') && hitTestMarkup(pt, m));

    if (hit) {
      setInlineEditing({
        markupId: hit.id,
        initialText: hit.text || '',
        position: hit.points[0],
      });
      return;
    }
  };

  const handleAnchorMouseDown = (
    e: React.MouseEvent<SVGCircleElement>,
    markupId: string,
    leaderIndex: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const target = markupsRef.current.find((m) => m.id === markupId);
    if (!target || !target.leaders) return;

    anchorDragRef.current = {
      markupId,
      leaderIndex,
      initialLeaders: target.leaders.map((lead) => lead.map((p) => ({ ...p }))),
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      hasMoved: false,
    };
  };

  const handleAnchorContextMenu = (
    e: React.MouseEvent<SVGCircleElement>,
    markupId: string,
    leaderIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const target = markupsRef.current.find((m) => m.id === markupId);
    if (!target || !target.leaders) return;
    if (target.leaders.length <= 1) {
      // Invariante de mínimo 1 directriz: si leaders.length === 1, es no-op
      return;
    }
    const remaining = target.leaders.filter((_, idx) => idx !== leaderIndex);
    updateMarkup(markupId, { leaders: remaining });
  };

  const handleAddLeader = (e: React.MouseEvent, markupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const target = markupsRef.current.find((m) => m.id === markupId);
    if (!target) return;
    const boxP1 = target.points[0];
    const newAnchorX = boxP1.x > 0.15 ? boxP1.x - 0.08 : boxP1.x + 0.15;
    const newAnchorY = boxP1.y > 0.15 ? boxP1.y - 0.08 : boxP1.y + 0.15;
    const newAnchor = {
      x: Math.max(0.01, Math.min(0.99, newAnchorX)),
      y: Math.max(0.01, Math.min(0.99, newAnchorY)),
    };
    const currentLeaders = target.leaders || [];
    updateMarkup(markupId, { leaders: [...currentLeaders, [newAnchor]] });
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
                const targetMarkup = markupsRef.current.find((m) => m.id === inlineEditing.markupId);
                if (targetMarkup) {
                  // Condición 4: Si el texto es idéntico al actual, evitar comando de historial vacío
                  if (targetMarkup.text === newText) {
                    setInlineEditing(null);
                    return;
                  }
                  if (targetMarkup.type === 'callout') {
                    const unscaledWidth = pageViewport.width / (scale || 1.0);
                    const unscaledHeight = pageViewport.height / (scale || 1.0);
                    const normSize = estimateCalloutBoxNormalizedSize(
                      newText,
                      10,
                      unscaledWidth,
                      unscaledHeight
                    );
                    const p1 = targetMarkup.points[0];
                    const p2 = {
                      x: Math.min(1, p1.x + normSize.width),
                      y: Math.min(1, p1.y + normSize.height),
                    };
                    updateMarkup(targetMarkup.id, { text: newText, points: [p1, p2] });
                  } else {
                    updateMarkup(targetMarkup.id, { text: newText });
                  }
                }
                setInlineEditing(null);
              }}
              onCancel={() => setInlineEditing(null)}
            />
          )}

          {/* Overlay interactivo SVG para anotaciones */}
          <svg
            data-testid="markup-overlay-svg"
            width={pageViewport.width}
            height={pageViewport.height}
            viewBox={`0 0 ${pageViewport.width} ${pageViewport.height}`}
            style={{ width: `${pageViewport.width}px`, height: `${pageViewport.height}px` }}
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
              const descriptor = getMarkupSvgDescriptor(markup, viewportTransform);

              return (
                <g
                  key={markup.id}
                  data-testid={`markup-g-${markup.id}`}
                  className={`transition-opacity ${activeTool === 'select' ? 'cursor-move' : ''}`}
                >
                  {renderSvgDescriptor(descriptor, markup.id)}

                  {/* Bounding box de selección activa */}
                  {isSelected && (() => {
                    const allPts = [...markup.points];
                    if (markup.leaders) {
                      for (const l of markup.leaders) {
                        allPts.push(...l);
                      }
                    }
                    const b = allPts.reduce(
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
                          data-testid="selection-bbox"
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

                  {/* Tiradores interactivos para Callout seleccionado */}
                  {isSelected && markup.type === 'callout' && (
                    <g className="callout-handles">
                      {/* Tiradores de ancla (punta de flecha) */}
                      {markup.leaders?.map((leader, lIdx) => {
                        if (!leader || leader.length === 0) return null;
                        const anchorScr = normalizedToScreen(leader[0], viewportTransform);
                        return (
                          <circle
                            key={`callout-anchor-${markup.id}-${lIdx}`}
                            data-testid={`callout-anchor-handle-${lIdx}`}
                            cx={anchorScr.x}
                            cy={anchorScr.y}
                            r={6}
                            fill="#ffffff"
                            stroke="#0284c7"
                            strokeWidth={2}
                            className="cursor-move"
                            onMouseDown={(e) => handleAnchorMouseDown(e, markup.id, lIdx)}
                            onContextMenu={(e) => handleAnchorContextMenu(e, markup.id, lIdx)}
                          />
                        );
                      })}

                      {/* Tirador para añadir directriz (+) */}
                      {(() => {
                        const p1Scr = normalizedToScreen(markup.points[0], viewportTransform);
                        const p2Scr = normalizedToScreen(markup.points[1], viewportTransform);
                        const boxRight = Math.max(p1Scr.x, p2Scr.x);
                        const boxTop = Math.min(p1Scr.y, p2Scr.y);
                        const addX = boxRight + 12;
                        const addY = boxTop + 10;
                        return (
                          <g
                            data-testid="callout-add-leader-handle"
                            className="cursor-pointer"
                            onClick={(e) => handleAddLeader(e, markup.id)}
                          >
                            <circle cx={addX} cy={addY} r={8} fill="#0284c7" stroke="#ffffff" strokeWidth={1.5} />
                            <text
                              x={addX}
                              y={addY + 3.5}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="11"
                              fontWeight="bold"
                              className="select-none pointer-events-none"
                            >
                              +
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  )}
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

                  if (activeTool === 'cloud' || activeTool === 'cloudPlus') {
                    return (
                      <path
                        d={generateCloudPath(
                          drawingStart,
                          currentDrawPoint,
                          {
                            width: viewportTransform.width * viewportTransform.scale,
                            height: viewportTransform.height * viewportTransform.scale,
                          },
                          DEFAULT_ARC_STEP * viewportTransform.scale
                        )}
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

                  if (activeTool === 'callout') {
                    const unscaledWidth = pageViewport.width / (scale || 1.0);
                    const unscaledHeight = pageViewport.height / (scale || 1.0);
                    const normSize = estimateCalloutBoxNormalizedSize(
                      'Nota técnica',
                      10,
                      unscaledWidth,
                      unscaledHeight
                    );
                    const boxW = normSize.width * viewportTransform.width;
                    const boxH = normSize.height * viewportTransform.height;
                    return (
                      <g>
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke={currentStyle.strokeColor}
                          strokeWidth={currentStyle.strokeWidth || 1.5}
                          strokeDasharray="4 2"
                        />
                        <circle cx={p1.x} cy={p1.y} r={4} fill={currentStyle.strokeColor} />
                        <rect
                          x={p2.x}
                          y={p2.y}
                          width={boxW}
                          height={boxH}
                          stroke={currentStyle.strokeColor}
                          strokeWidth={1}
                          fill="rgba(255, 255, 255, 0.85)"
                          strokeDasharray="3 3"
                        />
                      </g>
                    );
                  }

                  return null;
                })()}
              </g>
            )}

            {/* D. Rectángulo elástico de selección Marquee (Sub-entregable A.2) */}
            {marqueeState && (() => {
              const p1 = normalizedToScreen(marqueeState.start, viewportTransform);
              const p2 = normalizedToScreen(marqueeState.current, viewportTransform);
              const x = Math.min(p1.x, p2.x);
              const y = Math.min(p1.y, p2.y);
              const width = Math.abs(p2.x - p1.x);
              const height = Math.abs(p2.y - p1.y);

              return (
                <rect
                  data-testid="marquee-selection-rect"
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="rgba(2, 132, 199, 0.12)"
                  stroke="#0284c7"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  className="pointer-events-none"
                />
              );
            })()}
          </svg>
        </div>
      )}
    </div>
  );
};
