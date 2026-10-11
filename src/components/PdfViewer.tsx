import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  getMarkupBounds,
  exceedsScreenThreshold,
  getStickyNoteNormalizedSize,
} from '../utils/coordinates';
import { useToolChestStore } from '../store/useToolChestStore';
import { ToolChestTool, RecentTool } from '../types/toolChest';
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
import {
  Markup,
  MarkupPoint,
  MarkupType,
  STICKY_NOTE_COLORS,
  HIGHLIGHT_STYLE,
} from '../types/markup';
import { InlineTextEditor } from './markup/InlineTextEditor';
import { showToast } from '../services/toastService';
import { extractTextForLineRect, mergeLineRects } from '../utils/textLayerUtils';
import { CalibrationModal } from './CalibrationModal';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useSearchStore } from '../store/useSearchStore';
import { useUiStore, NO_LAYER } from '../store/useUiStore';
import { CanvasContextMenu } from './shell/CanvasContextMenu';
import { translucentFill } from '../core/markup/typeLabels';
import {
  calculateLength,
  calculatePolylineLength,
  calculateArea,
  calculateCount,
} from '../core/measurements/calculate';

/** Herramientas que se trazan vértice a vértice (clic), y se cierran con Enter, doble clic o el primer vértice. */
export function isMultiPointTool(tool: string): boolean {
  return tool === 'polygon' || tool === 'polyLine' || tool === 'polylineMeasure' || tool === 'area';
}

export function minPointsFor(tool: string): number {
  return tool === 'polyLine' || tool === 'polylineMeasure' ? 2 : 3;
}

/** Quita vértices consecutivos prácticamente iguales (los dos mousedown que preceden a un doble clic). */
export function dedupeConsecutivePoints(points: MarkupPoint[], epsilon = 1e-4): MarkupPoint[] {
  return points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > epsilon
  );
}

export const PdfViewer: React.FC = () => {
  const {
    pdfBytes,
    pdfDoc,
    currentPageIndex,
    scale,
    rotation,
    setPageDimensions,
    pageHasText,
    setPageHasText,
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
    copySelectedMarkups,
    pasteMarkups,
    duplicateSelectedMarkups,
    toggleLockSelectedMarkups,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useMarkupStore();

  const { activeTool, currentStyle, author, activeLayer } = useToolStore();
  const { setCalibrationModalOpen, setPendingCalibrationPoints } = useCalibrationStore();
  const { matches: searchMatches, activeMatchIndex } = useSearchStore();

  // Capas ocultas (panel Capas): sus marcas no se dibujan ni se pueden seleccionar en el plano (ADR-0017)
  const hiddenLayers = useUiStore((s) => s.hiddenLayers);
  const setCursorPt = useUiStore((s) => s.setCursorPt);
  const isMarkupVisible = useCallback(
    (m: Markup) => !hiddenLayers.includes(m.layer ?? NO_LAYER),
    [hiddenLayers]
  );
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Zoom alrededor del centro de la vista (ADR-0017): se recuerda qué punto relativo del contenido está en el
  // centro y, cuando la hoja cambia de tamaño (zoom/rotación), se restaura el scroll para mantenerlo centrado.
  const viewCenterRef = useRef({ rx: 0.5, ry: 0.5 });
  const updateViewCenter = useCallback(() => {
    const el = containerRef.current;
    if (!el || el.scrollWidth === 0 || el.scrollHeight === 0) return;
    viewCenterRef.current = {
      rx: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
      ry: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
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

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { rx, ry } = viewCenterRef.current;
    el.scrollLeft = Math.max(0, rx * el.scrollWidth - el.clientWidth / 2);
    el.scrollTop = Math.max(0, ry * el.scrollHeight - el.clientHeight / 2);
  }, [pageViewport.width, pageViewport.height]);

  // Estado del dibujo para figuras de 2 puntos (rect, circle, line, cloud)
  const [drawingStart, setDrawingStart] = useState<MarkupPoint | null>(null);
  const [currentDrawPoint, setCurrentDrawPoint] = useState<MarkupPoint | null>(null);

  // Estado del motor multi-punto (polygon y freehand)
  const [polygonPoints, setPolygonPoints] = useState<MarkupPoint[]>([]);
  const [freehandPoints, setFreehandPoints] = useState<MarkupPoint[]>([]);
  const [mouseCursorPoint, setMouseCursorPoint] = useState<MarkupPoint | null>(null);

  // Estado del editor de texto inline (B6 y A.4)
  const [inlineEditing, setInlineEditing] = useState<{
    markupId: string;
    initialText: string;
    position: MarkupPoint;
    isStickyNote?: boolean;
    isPendingCreation?: boolean;
    initialColor?: string;
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
          textLayerContainer: textLayerRef.current,
        });

        if (!isCancelled) {
          setPageViewport({ width: result.width, height: result.height });
          setPageDimensions(currentPageIndex, result.width, result.height);
          setPageHasText(currentPageIndex, result.hasText);
        }
      } catch (err) {
        console.error('Error renderizando página PDF:', err);
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPageIndex, scale, rotation, setPageDimensions, setPageHasText]);

  // Manejar atajos de teclado: Escape (Criterio 3), Enter (cerrar polígono), Delete (borrar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
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

      // Enter finaliza el polígono, la polilínea, la polilínea de medida o el área
      if (e.key === 'Enter' && isMultiPointTool(activeTool)) {
        if (polygonPoints.length >= minPointsFor(activeTool)) {
          e.preventDefault();
        }
        finalizeMultiPoint(polygonPoints);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedMarkupIds.length > 0) {
          e.preventDefault();
          deleteSelectedMarkups();
        }
        return;
      }

      // Portapapeles: Copiar (Ctrl+C / Cmd+C)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (selectedMarkupIds.length > 0) {
          e.preventDefault();
          copySelectedMarkups();
        }
        return;
      }

      // Portapapeles: Pegar (Ctrl+V / Cmd+V)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteMarkups(currentPageIndex);
        return;
      }

      // Portapapeles: Duplicar (Ctrl+D / Cmd+D)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (selectedMarkupIds.length > 0) {
          e.preventDefault();
          duplicateSelectedMarkups();
        }
        return;
      }

      // Bloquear / Desbloquear marca (Ctrl+L / Cmd+L)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        if (selectedMarkupIds.length > 0) {
          e.preventDefault();
          toggleLockSelectedMarkups();
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

      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
        useToolStore.getState().setActiveTool('stickyNote');
        return;
      }

      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        if (pageHasText[currentPageIndex] === false) {
          showToast(
            'Esta página no contiene capa de texto seleccionable. Utilice el resaltador vectorial (H).'
          );
        }
        useToolStore.getState().setActiveTool('highlightText');
        return;
      }

      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        useToolStore.getState().setActiveTool('highlightVector');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedMarkupIds,
    deleteSelectedMarkups,
    copySelectedMarkups,
    pasteMarkups,
    duplicateSelectedMarkups,
    toggleLockSelectedMarkups,
    undo,
    redo,
    canUndo,
    canRedo,
    polygonPoints,
    freehandPoints,
    drawingStart,
    activeTool,
    currentPageIndex,
    // finalizeMultiPoint (Enter) usa las dimensiones de la página para medir
    pageViewport,
    scale,
    pageHasText,
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
        const unscaledW = pageViewport.width / (scale || 1.0);
        const unscaledH = pageViewport.height / (scale || 1.0);
        const result = handleSelectMouseUp({
          screenX: e.clientX,
          screenY: e.clientY,
          dragState: dragStateRef.current,
          viewportTransform,
          thresholdPx: 4,
          pageDimensions: { width: unscaledW, height: unscaledH },
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

  /**
   * Cierra una figura multipunto y crea la marca (un solo comando, deshacible). El área se mide como
   * polígono (fórmula del área firmada) con su perímetro; la polilínea de medida, como longitud acumulada.
   */
  const finalizeMultiPoint = (points: MarkupPoint[]) => {
    setPolygonPoints([]);
    if (!isMultiPointTool(activeTool) || points.length < minPointsFor(activeTool)) return;

    const pageDimsPt = {
      width: pageViewport.width / (scale || 1.0),
      height: pageViewport.height / (scale || 1.0),
    };
    const calib = useCalibrationStore.getState().getPageCalibration(currentPageIndex);
    let measurement: Markup['measurement'];
    if (activeTool === 'polylineMeasure') {
      measurement = calculatePolylineLength(points, pageDimsPt, calib);
    } else if (activeTool === 'area') {
      measurement = calculateArea(points, pageDimsPt, calib, false);
    }

    const style = { ...currentStyle };
    // El área se rellena con el color de trazo translúcido para que la superficie medida se vea
    if (activeTool === 'area' && (!style.fillColor || style.fillColor === 'transparent')) {
      style.fillColor = translucentFill(style.strokeColor);
    }

    const now = new Date().toISOString();
    const newMarkup: Markup = {
      id: uuidv4(),
      type: activeTool as MarkupType,
      pageIndex: currentPageIndex,
      points: [...points],
      style,
      text: measurement ? measurement.formatted : undefined,
      author: author || 'Revisor',
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      layer: activeLayer,
      measurement,
    };
    addMarkup(newMarkup);
    useToolChestStore.getState().recordRecent(newMarkup);
  };

  // Clic derecho sobre una marca: seleccionarla (si no lo estaba) y abrir el menú contextual
  const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const pt = getEventPoint(e);
    const pageDims = { width: pageViewport.width / (scale || 1.0), height: pageViewport.height / (scale || 1.0) };
    const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex && isMarkupVisible(m));
    const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(pt, m, 0.015, pageDims));
    if (!hit) {
      setContextMenu(null);
      return;
    }
    if (!selectedMarkupIds.includes(hit.id)) {
      setSelectedMarkupIds([hit.id]);
    }
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Inicio de interacción con el ratón
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const pt = getEventPoint(e);

    // 1. Modo Selección (A.0 y A.2: Vacío -> Marquee, Marca -> Movimiento)
    if (activeTool === 'select') {
      const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex && isMarkupVisible(m));
      const isAdditive = Boolean(e.ctrlKey || e.metaKey || e.shiftKey);
      const unscaledW = pageViewport.width / (scale || 1.0);
      const unscaledH = pageViewport.height / (scale || 1.0);
      const pageDims = { width: unscaledW, height: unscaledH };
      const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(pt, m, 0.015, pageDims));

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
          pageDimensions: pageDims,
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

    // 2. Herramientas multipunto: polígono, polilínea, polilínea de medida y área (polígono)
    if (isMultiPointTool(activeTool)) {
      if (polygonPoints.length === 0) {
        setPolygonPoints([pt]);
      } else {
        if (activeTool === 'polygon' || activeTool === 'area') {
          // Clic cerca del primer vértice: cerrar la figura
          const firstPt = polygonPoints[0];
          const distToFirst = Math.hypot(pt.x - firstPt.x, pt.y - firstPt.y);
          if (distToFirst < 0.02 && polygonPoints.length >= 3) {
            finalizeMultiPoint(polygonPoints);
            return;
          }
        }
        // Agregar nuevo vértice
        setPolygonPoints((prev) => [...prev, pt]);
      }
      return;
    }

    // 3. Modo Mano Alzada (Freehand)
    if (activeTool === 'freehand') {
      setFreehandPoints([pt]);
      return;
    }

    // 4. Modo Contador (Takeoff Count)
    if (activeTool === 'count') {
      const now = new Date().toISOString();
      const existingCounts = markups.filter((m) => m.type === 'count').length;
      const countIndex = existingCounts + 1;
      const measurement = calculateCount(countIndex);
      const newMarkup: Markup = {
        id: uuidv4(),
        type: 'count',
        pageIndex: currentPageIndex,
        points: [pt],
        style: {
          strokeColor: currentStyle.strokeColor || '#ff8800',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
        },
        text: String(countIndex),
        author: author || 'Revisor',
        createdAt: now,
        updatedAt: now,
        status: 'pending',
        layer: activeLayer,
        measurement,
      };
      addMarkup(newMarkup);
      return;
    }

    // 5. Modo Calibración por arrastre de 2 puntos
    if (activeTool === 'calibrate') {
      setDrawingStart(pt);
      setCurrentDrawPoint(pt);
      return;
    }

    // 6. Modo Nota Adhesiva técnica (A.4: Se abre en mouseUp para evitar colisión con el ciclo de blur)
    if (activeTool === 'stickyNote') {
      return;
    }

    // 7. Figuras de 2 puntos y Texto
    if (activeTool !== 'pan') {
      setDrawingStart(pt);
      setCurrentDrawPoint(pt);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getEventPoint(e);
    setMouseCursorPoint(pt);
    // Coordenadas para la barra de estado, en puntos PDF desde la esquina superior izquierda
    setCursorPt({
      x: pt.x * (pageViewport.width / (scale || 1.0)),
      y: pt.y * (pageViewport.height / (scale || 1.0)),
    });

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
      const unscaledW = pageViewport.width / (scale || 1.0);
      const unscaledH = pageViewport.height / (scale || 1.0);
      const pageDims = { width: unscaledW, height: unscaledH };

      if (dragStateRef.current) {
        const moveResult = handleSelectMouseMove({
          screenX: e.clientX,
          screenY: e.clientY,
          dragState: dragStateRef.current,
          viewportTransform,
          thresholdPx: 4,
          pageDimensions: pageDims,
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

        const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex && isMarkupVisible(m));
        const intersectingIds = selectMarkupsInRect(pageMarkups, marqueeRect, pageDims);

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
        const unscaledW = pageViewport.width / (scale || 1.0);
        const unscaledH = pageViewport.height / (scale || 1.0);
        const result = handleSelectMouseUp({
          screenX: _e.clientX,
          screenY: _e.clientY,
          dragState: dragStateRef.current,
          viewportTransform,
          thresholdPx: 4,
          pageDimensions: { width: unscaledW, height: unscaledH },
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

    // Modo Nota Adhesiva técnica (A.4: Abre editor contra ancla pendiente sin persistir marca aún)
    if (activeTool === 'stickyNote') {
      const pt = getEventPoint(_e);
      setInlineEditing({
        markupId: '',
        initialText: '',
        position: pt,
        isStickyNote: true,
        isPendingCreation: true,
        initialColor: currentStyle.fillColor || STICKY_NOTE_COLORS.yellow.fillColor,
      });
      return;
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
        useToolChestStore.getState().recordRecent(newMarkup);
      }
      setFreehandPoints([]);
      return;
    }

    // Finalización de calibración por 2 puntos
    if (activeTool === 'calibrate') {
      if (drawingStart && currentDrawPoint) {
        setPendingCalibrationPoints([drawingStart, currentDrawPoint]);
        setCalibrationModalOpen(true);
      }
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      useToolStore.getState().setActiveTool('select');
      return;
    }

    // Finalización de figuras de 2 puntos
    if (!drawingStart || !currentDrawPoint) {
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      return;
    }

    // Evitar crear marcas accidentales con un microclic (umbral de 4 px de pantalla invariable a la escala)
    const hasExceededThreshold = exceedsScreenThreshold(
      drawingStart,
      currentDrawPoint,
      viewportTransform,
      4
    );

    if (
      hasExceededThreshold &&
      activeTool !== 'select' &&
      activeTool !== 'pan' &&
      activeTool !== 'polygon'
    ) {
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
        useToolChestStore.getState().recordRecent(cloudMarkup);
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
        useToolChestStore.getState().recordRecent(calloutMarkup);
        setSelectedMarkupIds([newId]);
        setInlineEditing({
          markupId: newId,
          initialText,
          position: boxP1,
        });
      } else {
        const newId = uuidv4();
        const customFields = activeTool === 'cloud' ? { arcStep: DEFAULT_ARC_STEP } : undefined;

        // Convención canónica min/max para highlightVector (points[0] esquina superior izq, points[1] inferior der)
        const minX = Math.min(drawingStart.x, currentDrawPoint.x);
        const minY = Math.min(drawingStart.y, currentDrawPoint.y);
        const maxX = Math.max(drawingStart.x, currentDrawPoint.x);
        const maxY = Math.max(drawingStart.y, currentDrawPoint.y);
        const isBoxTool =
          activeTool === 'highlightVector' ||
          activeTool === 'underline' ||
          activeTool === 'strikeOut';
        const points = isBoxTool
          ? [
              { x: minX, y: minY },
              { x: maxX, y: maxY },
            ]
          : [drawingStart, currentDrawPoint];

        // HIGHLIGHT_STYLE como fuente única de verdad para el estilo de highlightVector
        const markupStyle =
          activeTool === 'highlightVector'
            ? {
                strokeColor: 'transparent',
                fillColor: HIGHLIGHT_STYLE.colorHex,
                strokeWidth: 0,
                opacity: HIGHLIGHT_STYLE.opacity,
              }
            : { ...currentStyle };

        const unscaledW = pageViewport.width / (scale || 1.0);
        const unscaledH = pageViewport.height / (scale || 1.0);
        const pageDimsPt = { width: unscaledW, height: unscaledH };
        const calib = useCalibrationStore.getState().getPageCalibration(currentPageIndex);

        let measurement: Markup['measurement'];
        let markupText: string | undefined = activeTool === 'text' ? 'Nota técnica' : undefined;

        if (activeTool === 'length') {
          measurement = calculateLength([drawingStart, currentDrawPoint], pageDimsPt, calib);
          markupText = measurement.formatted;
        }

        const newMarkup: Markup = {
          id: newId,
          type: activeTool as MarkupType,
          pageIndex: currentPageIndex,
          points,
          style: markupStyle,
          text: markupText,
          author: author || 'Revisor',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: activeLayer,
          customFields,
          measurement,
        };

        addMarkup(newMarkup);
        useToolChestStore.getState().recordRecent(newMarkup);

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

  // Doble clic para finalizar polígono o polilínea o para abrir editor de texto
  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isMultiPointTool(activeTool)) {
      // El doble clic dispara antes dos mousedown en el mismo punto: se descartan vértices repetidos
      finalizeMultiPoint(dedupeConsecutivePoints(polygonPoints));
      return;
    }

    // Doble clic sobre texto, callout o nota adhesiva existente para editar inline
    const pt = getEventPoint(e);
    const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex && isMarkupVisible(m));
    const unscaledW = pageViewport.width / (scale || 1.0);
    const unscaledH = pageViewport.height / (scale || 1.0);
    const hit = [...pageMarkups]
      .reverse()
      .find(
        (m) =>
          (m.type === 'text' || m.type === 'callout' || m.type === 'stickyNote') &&
          hitTestMarkup(pt, m, 0.015, { width: unscaledW, height: unscaledH })
      );

    if (hit) {
      setInlineEditing({
        markupId: hit.id,
        initialText: hit.text || '',
        position: hit.points[0],
        isStickyNote: hit.type === 'stickyNote',
        initialColor: hit.style?.fillColor,
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

  const handleTextLayerClick = () => {
    if (
      (activeTool === 'highlightText' ||
        activeTool === 'underline' ||
        activeTool === 'strikeOut') &&
      pageHasText[currentPageIndex] === false
    ) {
      showToast(
        'Esta página no contiene capa de texto seleccionable. Puede trazar la marca manualmente.'
      );
    }
  };

  const handleTextSelectionMouseUp = () => {
    if (
      activeTool !== 'highlightText' &&
      activeTool !== 'underline' &&
      activeTool !== 'strikeOut'
    ) {
      return;
    }

    if (pageHasText[currentPageIndex] === false) {
      showToast(
        'Esta página no contiene capa de texto seleccionable. Puede trazar la marca manualmente.'
      );
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rawRects = Array.from(range.getClientRects());
    const validRects = mergeLineRects(rawRects);
    if (validRects.length === 0) {
      return;
    }

    const container = pageContainerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    // Condición 4 & 6: N marcas con un groupId común en un solo addMarkups atómico
    const groupId = validRects.length > 1 ? uuidv4() : undefined;
    const now = new Date().toISOString();

    const newMarkups: Markup[] = validRects.map((rect) => {
      // Condición 1: Restar el offset del contenedor antes de screenToNormalized
      const leftInPage = rect.left - containerRect.left;
      const topInPage = rect.top - containerRect.top;
      const rightInPage = rect.right - containerRect.left;
      const bottomInPage = rect.bottom - containerRect.top;

      const p1 = screenToNormalized(leftInPage, topInPage, viewportTransform);
      const p2 = screenToNormalized(rightInPage, bottomInPage, viewportTransform);

      const canonicalP1 = {
        x: Math.max(0, Math.min(1, Math.min(p1.x, p2.x))),
        y: Math.max(0, Math.min(1, Math.min(p1.y, p2.y))),
      };
      const canonicalP2 = {
        x: Math.max(0, Math.min(1, Math.max(p1.x, p2.x))),
        y: Math.max(0, Math.min(1, Math.max(p1.y, p2.y))),
      };

      const lineText =
        extractTextForLineRect(rect, range, textLayerRef.current) || range.toString().trim();

      const markupStyle =
        activeTool === 'highlightText'
          ? {
              strokeColor: 'transparent',
              fillColor: HIGHLIGHT_STYLE.colorHex,
              strokeWidth: 0,
              opacity: HIGHLIGHT_STYLE.opacity,
            }
          : {
              strokeColor: currentStyle.strokeColor || '#e02424',
              strokeWidth: currentStyle.strokeWidth || 2,
              opacity: currentStyle.opacity ?? 1,
            };

      return {
        id: uuidv4(),
        type: activeTool as MarkupType,
        pageIndex: currentPageIndex,
        groupId,
        points: [canonicalP1, canonicalP2],
        text: lineText,
        style: markupStyle,
        author: author || 'Revisor Técnico',
        createdAt: now,
        updatedAt: now,
        status: 'pending',
        layer: activeLayer,
      };
    });

    const actionDesc =
      activeTool === 'underline'
        ? `Subrayar texto (${newMarkups.length} líneas)`
        : activeTool === 'strikeOut'
        ? `Tachar texto (${newMarkups.length} líneas)`
        : `Resaltar texto (${newMarkups.length} líneas)`;

    addMarkups(
      newMarkups,
      newMarkups.length > 1 ? actionDesc : actionDesc.replace(/ \(\d+ líneas\)/, '')
    );
    if (newMarkups.length > 0) {
      useToolChestStore.getState().recordRecent(newMarkups[0]);
    }
    setSelectedMarkupIds(newMarkups.map((m) => m.id));

    selection.removeAllRanges();
  };

  const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex && isMarkupVisible(m));

  // Sub-entregable B.5: Arrastre y colocación de herramientas del Tool Chest sobre el lienzo
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/rea-tool')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const rawData = e.dataTransfer.getData('application/rea-tool');
    if (!rawData) return;
    e.preventDefault();
    e.stopPropagation();

    try {
      const tool = JSON.parse(rawData) as ToolChestTool | RecentTool;
      if (!tool || !tool.type) return;

      const pageEl = pageContainerRef.current;
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Convertir punto de caída a coordenadas normalizadas [0..1]
      const normCenter = screenToNormalized(screenX, screenY, viewportTransform);

      const unscaledW = pageViewport.width / (scale || 1.0);
      const unscaledH = pageViewport.height / (scale || 1.0);

      // Dimensiones estándar en pantalla (120x60 px) proyectadas a espacio normalizado
      const widthNorm = 120 / (viewportTransform.width * (viewportTransform.scale || 1.0));
      const heightNorm = 60 / (viewportTransform.height * (viewportTransform.scale || 1.0));

      let points: MarkupPoint[] = [];
      let leaders: MarkupPoint[][] | undefined = undefined;

      switch (tool.type) {
        case 'rectangle':
        case 'circle':
        case 'highlight':
        case 'highlightVector':
        case 'highlightText':
        case 'stamp': {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }

        case 'line': {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y + halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.max(0, normCenter.y - halfH) },
          ];
          break;
        }

        case 'cloud':
        case 'cloudPlus': {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }

        case 'stickyNote': {
          const normSize = getStickyNoteNormalizedSize({ width: unscaledW, height: unscaledH });
          points = [
            {
              x: Math.max(0, normCenter.x - normSize.width / 2),
              y: Math.max(0, normCenter.y - normSize.height / 2),
            },
          ];
          break;
        }

        case 'callout': {
          const boxW = Math.max(0.12, widthNorm);
          const boxH = Math.max(0.04, heightNorm);
          const boxP1 = {
            x: Math.min(1 - boxW, normCenter.x + 0.04),
            y: Math.max(0, normCenter.y - boxH - 0.02),
          };
          const boxP2 = { x: boxP1.x + boxW, y: boxP1.y + boxH };
          points = [boxP1, boxP2];
          leaders = [[{ x: normCenter.x, y: normCenter.y }]];
          break;
        }

        case 'text': {
          const halfW = widthNorm / 2;
          const textHeightNorm = 30 / (viewportTransform.height * (viewportTransform.scale || 1.0));
          const halfH = textHeightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }

        case 'polygon': {
          const rW = widthNorm / 2;
          const rH = heightNorm / 2;
          points = [
            { x: normCenter.x, y: normCenter.y - rH },
            { x: normCenter.x + rW, y: normCenter.y },
            { x: normCenter.x, y: normCenter.y + rH },
            { x: normCenter.x - rW, y: normCenter.y },
          ];
          break;
        }

        case 'freehand': {
          const rW = widthNorm / 2;
          const strokeCurveNorm = 10 / (viewportTransform.height * (viewportTransform.scale || 1.0));
          points = [
            { x: normCenter.x - rW, y: normCenter.y },
            { x: normCenter.x - rW / 2, y: normCenter.y - strokeCurveNorm },
            { x: normCenter.x + rW / 2, y: normCenter.y + strokeCurveNorm },
            { x: normCenter.x + rW, y: normCenter.y },
          ];
          break;
        }

        default: {
          const halfW = widthNorm / 2;
          const halfH = heightNorm / 2;
          points = [
            { x: Math.max(0, normCenter.x - halfW), y: Math.max(0, normCenter.y - halfH) },
            { x: Math.min(1, normCenter.x + halfW), y: Math.min(1, normCenter.y + halfH) },
          ];
          break;
        }
      }

      const now = new Date().toISOString();
      const newId = uuidv4();
      const newMarkup: Markup = {
        id: newId,
        type: tool.type,
        pageIndex: currentPageIndex,
        points,
        leaders,
        text:
          tool.text ||
          (tool.type === 'callout'
            ? 'Nota técnica'
            : tool.type === 'text'
            ? 'Texto'
            : undefined),
        textFormat: tool.textFormat ? { ...tool.textFormat } : undefined,
        style: { ...tool.style },
        author: author || 'Revisor',
        createdAt: now,
        updatedAt: now,
        status: 'pending',
        layer: activeLayer,
      };

      // Invocación única de addMarkup (genera un único comando de historial reversible con Ctrl+Z)
      addMarkup(newMarkup);
      setSelectedMarkupIds([newId]);

      // Registro asíncrono no bloqueante en Herramientas Recientes
      useToolChestStore.getState().recordRecent(newMarkup);
    } catch (err) {
      console.error('Error al soltar herramienta en el lienzo:', err);
    }
  };

  return (
    <div
      ref={containerRef}
      data-testid="pdf-viewer-container"
      // Centrado con m-auto en los hijos (no justify-center): con zoom alto la hoja sigue siendo
      // alcanzable por completo con el scroll, también por la izquierda y por arriba
      className="flex-1 bg-cad-canvas overflow-auto relative flex p-8 select-none"
      onScroll={updateViewCenter}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-cad-canvas/80 flex items-center justify-center z-30">
          <div className="text-gray-300 font-medium animate-pulse">Cargando documento PDF...</div>
        </div>
      )}

      {error && (
        <div className="m-auto p-4 bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 rounded max-w-md text-center">
          {error}
        </div>
      )}

      {!pdfBytes && !isLoading && !error && (
        <div className="m-auto text-center text-white/90">
          <p className="text-base font-semibold mb-1">Ningún documento abierto</p>
          <p className="text-xs">Use Archivo → Abrir PDF (Ctrl+O) o el botón Abrir de la cinta</p>
        </div>
      )}

      {pdfBytes && (
        <div
          ref={pageContainerRef}
          data-testid="pdf-page-container"
          data-rendered-page={currentPageIndex}
          data-has-text={String(pageHasText[currentPageIndex] ?? 'loading')}
          className="relative m-auto shrink-0 shadow-[0_2px_14px_rgba(0,0,0,0.35)] bg-white select-text"
          style={{ width: `${pageViewport.width}px`, height: `${pageViewport.height}px` }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Canvas de PDF.js */}
          <canvas
            ref={canvasRef}
            id="pdf-render-canvas"
            data-testid="pdf-canvas"
            className="block"
          />

          {/* TextLayer de PDF.js 4.x */}
          <div
            ref={textLayerRef}
            data-testid="pdf-text-layer"
            className="textLayer"
            style={{
              width: `${pageViewport.width}px`,
              height: `${pageViewport.height}px`,
              '--scale-factor': scale || 1.0,
              pointerEvents:
                activeTool === 'highlightText' ||
                activeTool === 'underline' ||
                activeTool === 'strikeOut'
                  ? 'auto'
                  : 'none',
            } as React.CSSProperties}
            onMouseUp={handleTextSelectionMouseUp}
            onClick={handleTextLayerClick}
          />

          {/* Editor inline genérico para texto y notas (B6 y A.4) */}
          {inlineEditing && (
            <InlineTextEditor
              initialText={inlineEditing.initialText}
              position={inlineEditing.position}
              transform={viewportTransform}
              colorPresets={inlineEditing.isStickyNote}
              initialColor={inlineEditing.initialColor}
              onCommit={(newText, selectedColor) => {
                if (inlineEditing.isPendingCreation && inlineEditing.isStickyNote) {
                  // Condición 4: La nota se crea al CONFIRMAR el texto en un solo comando
                  const now = new Date().toISOString();
                  const newId = uuidv4();
                  const preset = selectedColor || STICKY_NOTE_COLORS.yellow;
                  const newMarkup: Markup = {
                    id: newId,
                    type: 'stickyNote',
                    pageIndex: currentPageIndex,
                    points: [inlineEditing.position],
                    text: newText,
                    style: {
                      ...currentStyle,
                      fillColor: preset.fillColor,
                      strokeColor: preset.strokeColor,
                      strokeWidth: 1,
                    },
                    author: author || 'Revisor',
                    createdAt: now,
                    updatedAt: now,
                    status: 'pending',
                    layer: activeLayer,
                  };
                  addMarkup(newMarkup);
                  useToolChestStore.getState().recordRecent(newMarkup);
                  setSelectedMarkupIds([newId]);
                  setInlineEditing(null);
                  return;
                }

                const targetMarkup = markupsRef.current.find((m) => m.id === inlineEditing.markupId);
                if (targetMarkup) {
                  if (targetMarkup.type === 'stickyNote') {
                    const preset = selectedColor;
                    const styleUpdate = preset
                      ? {
                          ...targetMarkup.style,
                          fillColor: preset.fillColor,
                          strokeColor: preset.strokeColor,
                        }
                      : targetMarkup.style;

                    if (
                      targetMarkup.text === newText &&
                      (!preset || targetMarkup.style.fillColor === preset.fillColor)
                    ) {
                      setInlineEditing(null);
                      return;
                    }

                    updateMarkup(targetMarkup.id, {
                      text: newText,
                      style: styleUpdate,
                    });
                  } else if (targetMarkup.type === 'callout') {
                    // Condición 4: Si el texto es idéntico al actual, evitar comando de historial vacío
                    if (targetMarkup.text === newText) {
                      setInlineEditing(null);
                      return;
                    }
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
                    if (targetMarkup.text === newText) {
                      setInlineEditing(null);
                      return;
                    }
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
              activeTool === 'highlightText' ||
              activeTool === 'underline' ||
              activeTool === 'strikeOut'
                ? 'pointer-events-none'
                : activeTool === 'select'
                ? 'cursor-default'
                : 'cursor-crosshair'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setCursorPt(null)}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Capa de resaltado de búsqueda (Paquete 5) */}
            {searchMatches.map((match) => {
              if (match.pageIndex !== currentPageIndex) return null;
              const isActive = match.matchIndex === activeMatchIndex;
              return match.rects.map((rect, rIdx) => {
                const screenX = rect.x * viewportTransform.width;
                const screenY = rect.y * viewportTransform.height;
                const screenW = rect.width * viewportTransform.width;
                const screenH = rect.height * viewportTransform.height;
                return (
                  <rect
                    key={`search-${match.matchIndex}-${rIdx}`}
                    data-testid={isActive ? 'search-active-highlight' : 'search-match-highlight'}
                    x={screenX}
                    y={screenY}
                    width={screenW}
                    height={screenH}
                    fill={isActive ? 'rgba(249, 115, 22, 0.45)' : 'rgba(250, 204, 21, 0.35)'}
                    stroke={isActive ? '#ea580c' : '#ca8a04'}
                    strokeWidth={isActive ? 1.5 : 1}
                    className="pointer-events-none"
                  />
                );
              });
            })}

            {/* Anotaciones guardadas en la página actual */}
            {pageMarkups.map((markup) => {
              const isSelected = selectedMarkupIds.includes(markup.id);
              const descriptor = getMarkupSvgDescriptor(markup, viewportTransform);

              return (
                <g
                  key={markup.id}
                  data-testid={`markup-g-${markup.id}`}
                  className={`transition-opacity ${activeTool === 'select' && !markup.locked ? 'cursor-move' : ''}`}
                >
                  {renderSvgDescriptor(descriptor, markup.id)}

                  {/* Bounding box de selección activa */}
                  {isSelected && (() => {
                    let b: { minX: number; minY: number; maxX: number; maxY: number };
                    if (markup.type === 'stickyNote') {
                      const unscaledW = pageViewport.width / (scale || 1.0);
                      const unscaledH = pageViewport.height / (scale || 1.0);
                      const bounds = getMarkupBounds(markup, { width: unscaledW, height: unscaledH });
                      const p1Scr = normalizedToScreen({ x: bounds.x, y: bounds.y }, viewportTransform);
                      const p2Scr = normalizedToScreen(
                        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
                        viewportTransform
                      );
                      b = {
                        minX: Math.min(p1Scr.x, p2Scr.x),
                        minY: Math.min(p1Scr.y, p2Scr.y),
                        maxX: Math.max(p1Scr.x, p2Scr.x),
                        maxY: Math.max(p1Scr.y, p2Scr.y),
                      };
                    } else {
                      const allPts = [...markup.points];
                      if (markup.leaders) {
                        for (const l of markup.leaders) {
                          allPts.push(...l);
                        }
                      }
                      b = allPts.reduce(
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
                    }

                    if (b.minX !== Infinity) {
                      return (
                        <rect
                          data-testid="selection-bbox"
                          x={b.minX - 4}
                          y={b.minY - 4}
                          width={Math.max(8, b.maxX - b.minX + 8)}
                          height={Math.max(8, b.maxY - b.minY + 8)}
                          fill="none"
                          stroke={markup.locked ? '#f59e0b' : '#0284c7'}
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

            {/* Vista previa de nota adhesiva en ancla pendiente de confirmación (A.4) */}
            {inlineEditing && inlineEditing.isPendingCreation && inlineEditing.isStickyNote && (
              <g data-testid="pending-sticky-note-preview" className="pointer-events-none opacity-85">
                {renderSvgDescriptor(
                  getMarkupSvgDescriptor(
                    {
                      id: 'pending-sticky-preview',
                      type: 'stickyNote',
                      pageIndex: currentPageIndex,
                      points: [inlineEditing.position],
                      style: {
                        ...currentStyle,
                        fillColor: inlineEditing.initialColor || STICKY_NOTE_COLORS.yellow.fillColor,
                        strokeColor: STICKY_NOTE_COLORS.yellow.strokeColor,
                      },
                      author: author || 'Revisor',
                      createdAt: '',
                      updatedAt: '',
                      status: 'pending',
                    },
                    viewportTransform
                  ),
                  'pending-sticky-preview'
                )}
              </g>
            )}

            {/* Previsualización en vivo mientras se dibuja */}
            {/* A. Polígono o Polilínea en construcción */}
            {isMultiPointTool(activeTool) && polygonPoints.length > 0 && (
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
                  fill={
                    activeTool === 'polygon'
                      ? 'rgba(0, 122, 204, 0.1)'
                      : activeTool === 'area'
                      ? 'rgba(0, 160, 110, 0.18)'
                      : 'none'
                  }
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
                      fill={
                        idx === 0 && (activeTool === 'polygon' || activeTool === 'area')
                          ? '#10b981'
                          : currentStyle.strokeColor
                      }
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

                  if (activeTool === 'length' || activeTool === 'calibrate') {
                    return (
                      <g>
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke={activeTool === 'calibrate' ? '#f59e0b' : currentStyle.strokeColor}
                          strokeWidth={currentStyle.strokeWidth || 2}
                          strokeDasharray="4 2"
                        />
                        <circle
                          cx={p1.x}
                          cy={p1.y}
                          r={3}
                          fill={activeTool === 'calibrate' ? '#f59e0b' : currentStyle.strokeColor}
                        />
                        <circle
                          cx={p2.x}
                          cy={p2.y}
                          r={3}
                          fill={activeTool === 'calibrate' ? '#f59e0b' : currentStyle.strokeColor}
                        />
                      </g>
                    );
                  }

                  if (activeTool === 'underline') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <line
                        x1={rect.x}
                        y1={rect.y + rect.height}
                        x2={rect.x + rect.width}
                        y2={rect.y + rect.height}
                        stroke={currentStyle.strokeColor || '#e02424'}
                        strokeWidth={currentStyle.strokeWidth || 2}
                        strokeDasharray="4 2"
                      />
                    );
                  }

                  if (activeTool === 'strikeOut') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <line
                        x1={rect.x}
                        y1={rect.y + rect.height / 2}
                        x2={rect.x + rect.width}
                        y2={rect.y + rect.height / 2}
                        stroke={currentStyle.strokeColor || '#e02424'}
                        strokeWidth={currentStyle.strokeWidth || 2}
                        strokeDasharray="4 2"
                      />
                    );
                  }

                  if (activeTool === 'highlightVector') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <rect
                        data-testid="highlight-vector-preview"
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        fill={HIGHLIGHT_STYLE.colorHex}
                        opacity={HIGHLIGHT_STYLE.opacity}
                        style={{ mixBlendMode: HIGHLIGHT_STYLE.mixBlendMode }}
                        stroke="#ca8a04"
                        strokeWidth={1}
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

      {/* Modal de calibración (el indicador de escala vive en la barra de estado, ADR-0017) */}
      {pdfBytes && (
        <CalibrationModal
          pageIndex={currentPageIndex}
          pageSizePt={{
            width: pageViewport.width / (scale || 1.0),
            height: pageViewport.height / (scale || 1.0),
          }}
        />
      )}

      {contextMenu && (
        <CanvasContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
};
