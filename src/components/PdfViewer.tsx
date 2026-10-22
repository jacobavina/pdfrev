import { tok } from './viewer/paint';
import { DEFAULT_MARKUP_COLOR, ATTACHMENT_COLOR, FORM_FIELD_COLOR, LINK_COLOR, STAMP_FILL, WHITE } from '../core/markup/palette';
import { isAutosizeText } from '../core/markup/autosizeText';
import { countMeasurement, countSymbolSizePt } from '../core/markup/countSymbols';
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore, ToolType, cloudCreationFields } from '../store/useToolStore';
import { useSplitStore } from '../store/useSplitStore';
import { scrollToCenter, viewCenterOnPage } from '../core/compare/splitSync';
import type { RenderResult } from '../services/pdfService';
import { PageCanvas } from './viewer/PageCanvas';
import {
  screenToNormalized,
  normalizedToScreen,
  hitTestMarkup,
  getMarkupBounds,
  exceedsScreenThreshold,
  isPointInPolygon,
} from '../utils/coordinates';
import { getSpatialIndexForPage } from '../core/markup/spatialIndex';
import type { BoundingBox } from '../types/markup';
import { useToolChestStore } from '../store/useToolChestStore';
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
  getMarkupSvgDescriptor,
  renderSvgDescriptor,
  estimateCalloutBoxNormalizedSize,
  getCalloutGeometryFromMarkup,
} from '../core/markup/render';
import {
  Markup,
  MarkupPoint,
  MarkupType,
  STICKY_NOTE_COLORS,
  HIGHLIGHT_STYLE,
} from '../types/markup';
import { useCalibrationStore } from '../store/useCalibrationStore';
// Editor inline de texto bajo demanda (bundle principal ≤ 800 kB)
const InlineTextEditor = lazy(() => import('./markup/InlineTextEditor').then((m) => ({ default: m.InlineTextEditor })));
import { extractTextForLineRect, mergeLineRects } from '../utils/textLayerUtils';
import { useSearchStore } from '../store/useSearchStore';
import { useUiStore, NO_LAYER } from '../store/useUiStore';
// Menú contextual del plano: se carga al primer clic derecho (presupuesto del bundle, ADR-0045)
const CanvasContextMenu = React.lazy(() => import('./shell/CanvasContextMenu').then((m) => ({ default: m.CanvasContextMenu })));
import { runPageOperation } from './shell/appActions';
import { translucentFill } from '../core/markup/typeLabels';
import { defaultDimensionLinePoint } from '../core/markup/dimension';
import { measureCaptionFrame } from '../core/markup/render';
import { captionOffsetOf, offsetFromPoint, shiftCaption } from '../core/markup/measureCaption';
import { controlPointsOf, applyControlPointDrag, controlPointShape, editableControlPointTarget } from '../core/markup/controlPoints';
import { revisionCloudPathNormalized } from '../core/markup/revisionCloud';
import { calloutBoxFromDrag, CALLOUT_LANDING_PT } from '../core/markup/calloutLayout';
import { snapPoint, SnapResult } from '../core/markup/snap';
import { remeasureMarkup, SCALED_MEASURE_TYPES } from '../core/measurements/remeasure';
import {
  markupBounds,
  boundsCorners,
  canScale,
  canRotate,
  scaleMarkup,
  rotateMarkup,
  snapAngle,
  visualOverhangPt,
  SELECTION_GAP_PX,
} from '../core/markup/transformHandles';
import type { ContentSnapIndex } from '../core/markup/contentSnap';
import type { loadContentSnapIndex } from '../services/contentSnapService';
import { showToast } from '../services/toastService';
import { executeSnapshot } from '../services/snapshotService';
import { ORTHO_TOOLS, SQUARE_TOOLS, orthoConstrain, squareConstrain } from '../core/markup/ortho';
import { stampById } from '../core/markup/stamps';
import { SEQUENCE_BOX_PT } from '../core/markup/sequences';
import { dynamicFillArea } from '../services/dynamicFillService';
import { redactionMarkup } from '../core/markup/redaction';
import { stampTexts, stampDefaultSize } from '../core/markup/stampArt';
import { fieldTypeDef, fieldTypeOf, nextFieldName } from '../core/markup/formFields';
import { useAttachmentStore } from '../store/useAttachmentStore';
import { useOverlayStore } from '../store/useOverlayStore';
import { applyAffine } from '../core/compare/overlayAlign';
import { openExternalUrl, goToPageNumber, pickAttachmentFile, saveAttachment } from '../services/linkService';
import { Plus, Minus, Crosshair } from 'lucide-react';
import {
  calculateLength,
  calculatePolylineLength,
  calculateArea,
  calculatePerimeter,
  calculateVolume,
  calculateAngle,
} from '../core/measurements/calculate';

// Diálogo de hipervínculo (ADR-0027), cargado al usarlo
const LinkDialog = lazy(() => import('./markup/LinkDialog').then((m) => ({ default: m.LinkDialog })));

/** Enlace propio del PDF (no de REA) en la página activa, en coordenadas normalizadas (ADR-0027). */
interface PdfLinkArea {
  x: number;
  y: number;
  w: number;
  h: number;
  url?: string;
  pageIndex?: number;
}

// El modal de calibración solo se descarga al abrirlo (bundle principal ≤ 800 kB)
const CalibrationModal = lazy(() => import('./CalibrationModal').then((m) => ({ default: m.CalibrationModal })));
// Overlay Pages (ADR-0038): solo se descarga al comparar
const OverlayCanvas = lazy(() => import('./viewer/OverlayCanvas'));
// Pantalla de bienvenida con zona de drop y recientes (ADR-0087)
const WelcomeCanvas = lazy(() => import('./viewer/WelcomeCanvas').then((m) => ({ default: m.WelcomeCanvas })));

/** Herramientas que usan snap al dibujar o medir (ADR-0025). */
/**
 * Herramientas de dos puntos que admiten clic-clic además del arrastre (ADR-0031): clic en el punto 1, el trazo
 * sigue al cursor (con snap) y clic en el punto 2, como en Revu.
 */
// El callout (ADR-0067) también: clic en la punta de la flecha y clic donde va el texto, o arrastre
const TWO_CLICK_TOOLS = new Set<string>(['length', 'radius', 'diameter', 'dimension', 'line', 'arrow', 'calibrate', 'callout']);

/** Distancia a la que el tirador del texto queda por encima de su línea base, en píxeles (ADR-0097). */
const CAPTION_HANDLE_LIFT_PX = 14;

/** Dónde se pinta el tirador del texto de una distancia o cota: sobre el texto, ya desplazado. */
function captionHandlePosition(
  markup: Markup,
  frame: { origin: { x: number; y: number }; angle: number; pxPerPt: number }
): { x: number; y: number } {
  const shifted = shiftCaption(
    { text: '', origin: frame.origin, angle: frame.angle, fontSize: 0 },
    captionOffsetOf(markup.customFields),
    frame.pxPerPt
  ).origin;
  return { x: shifted.x + CAPTION_HANDLE_LIFT_PX * Math.sin(frame.angle), y: shifted.y - CAPTION_HANDLE_LIFT_PX * Math.cos(frame.angle) };
}

const SNAP_TOOLS = new Set<string>([
  'line', 'arrow', 'dimension', 'length', 'polylineMeasure', 'area', 'count', 'calibrate',
  'perimeter', 'volume', 'angle', 'radius', 'diameter',
  'polygon', 'polyLine', 'rectangle', 'circle', 'cloud', 'cloudPlus', 'callout',
  'polygonCutout', 'ellipseCutout',
]);

/** Desfase inicial de la línea de cota respecto a los puntos acotados (pt de página). */
const DIMENSION_DEFAULT_OFFSET_PT = 15;

interface PdfPageLike {
  rotate: number;
  getViewport: (opts: { scale: number; rotation: number }) => { width: number; height: number };
}

/** Herramientas que se trazan vértice a vértice (clic), y se cierran con Enter, doble clic o el primer vértice. */
export function isMultiPointTool(tool: string): boolean {
  return (
    tool === 'polygon' ||
    tool === 'polyLine' ||
    tool === 'polylineMeasure' ||
    tool === 'area' ||
    tool === 'perimeter' ||
    tool === 'volume' ||
    tool === 'angle' ||
    tool === 'polygonCutout' ||
    tool === 'arc'
  );
}

export function minPointsFor(tool: string): number {
  return tool === 'polyLine' || tool === 'polylineMeasure' ? 2 : 3;
}

/** Contornos cerrados: se cierran también con un clic en el primer vértice. */
/** Nube y Cloud+ (ADR-0039): un clic sin arrastrar empieza una nube de forma libre, como en Revu. */
const isCloudTool = (tool: string) => tool === 'cloud' || tool === 'cloudPlus';

const isClosedMultiPointTool = (tool: string) =>
  isCloudTool(tool) ||
  tool === 'polygon' || tool === 'area' || tool === 'perimeter' || tool === 'volume' || tool === 'polygonCutout';

/** Recupera metadatos de Tool Chest activos (subject, unitPrice, layer, cost) si la herramienta coincide (ADR-0078). */
function getActiveToolChestMetadata(activeTool: string, quantity: number, defaultLayer: string) {
  const activeToolId = useToolChestStore.getState().activeToolId;
  const activeTcTool = activeToolId
    ? useToolChestStore.getState().tools.find((t) => t.id === activeToolId) ||
      useToolChestStore.getState().recentTools.find((t) => t.id === activeToolId)
    : null;
  const isMatching = activeTcTool?.type === activeTool;
  const subject = isMatching ? activeTcTool.subject : undefined;
  const unitPrice = isMatching ? activeTcTool.unitPrice : undefined;
  const layer = isMatching && activeTcTool.layer ? activeTcTool.layer : defaultLayer;
  let cost: number | undefined;
  if (unitPrice !== undefined) {
    cost = Math.round(quantity * Math.round(unitPrice * 100)) / 100;
  }
  return { subject, unitPrice, layer, cost };
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
    filePath,
    numPages,
    currentPageIndex,
    setCurrentPage,
    scale,
    setScale,
    rotation,
    setPageDimensions,
    pageHasText,
    setPageHasText,
    isLoading,
    error,
  } = useDocumentStore();
  const viewMode = useUiStore((s) => s.viewMode);
  const showMeasureLabels = useUiStore((s) => s.showMeasureLabels);
  const ocConfig = useDocumentStore((s) => s.ocConfig);
  const ocVersion = useDocumentStore((s) => s.ocVersion);
  const fitRequest = useUiStore((s) => s.fitRequest);

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

  const { activeTool, currentStyle, author, activeLayer, cloudSize, cloudInvert } = useToolStore();
  const { setCalibrationModalOpen, setPendingCalibrationPoints, isCalibrationModalOpen } = useCalibrationStore();
  const currentPageViewports = useCalibrationStore((s) => s.viewports[currentPageIndex] ?? []);
  const { matches: searchMatches, activeMatchIndex } = useSearchStore();

  // Capas ocultas (panel Capas): sus marcas no se dibujan ni se pueden seleccionar en el plano (ADR-0017)
  const hiddenLayers = useUiStore((s) => s.hiddenLayers);
  const setCursorPt = useUiStore((s) => s.setCursorPt);
  const isMarkupVisible = useCallback(
    (m: Markup) => !hiddenLayers.includes(m.layer ?? NO_LAYER),
    [hiddenLayers]
  );
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hitCutoutIndex?: number | null } | null>(null);

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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollPos, setScrollPos] = useState({ scrollLeft: 0, scrollTop: 0 });

  // Desplazamiento del plano arrastrando (ADR-0052): herramienta Pan, Espacio mantenido o botón central
  const [panning, setPanning] = useState(false);
  const startPan = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    setPanning(true);
    const move = (ev: MouseEvent) => {
      el.scrollLeft = start.left - (ev.clientX - start.x);
      el.scrollTop = start.top - (ev.clientY - start.y);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setPanning(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Count de Revu (ADR-0059): el conteo en curso termina al cambiar de herramienta (salvo el Pan temporal) o de
  // página, o con Enter o Esc; el siguiente clic empieza otro conteo
  useEffect(() => {
    if (activeTool !== 'count' && activeTool !== 'pan') useToolStore.setState({ activeCountId: null });
  }, [activeTool]);
  useEffect(() => {
    useToolStore.setState({ activeCountId: null });
  }, [currentPageIndex]);
  useEffect(() => {
    if (activeTool !== 'count') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') useToolStore.setState({ activeCountId: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool]);

  // Espacio mantenido: Pan temporal; al soltarlo vuelve la herramienta anterior
  useEffect(() => {
    let previous: ToolType | null = null;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t as HTMLElement | null)?.isContentEditable;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const { activeTool: tool, setActiveTool } = useToolStore.getState();
      if (tool === 'pan') return;
      e.preventDefault();
      previous = tool;
      setActiveTool('pan');
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || previous === null) return;
      e.preventDefault();
      useToolStore.getState().setActiveTool(previous);
      previous = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Vista lado a lado (ADR-0049 / ADR-0054): sincronización en ambos sentidos
  const splitActive = useSplitStore((s) => s.active);
  const splitSync = useSplitStore((s) => s.sync);
  const splitView = useSplitStore((s) => s.splitView);
  const splitDriver = useSplitStore((s) => s.driver);
  const publishSplitView = useCallback(() => {
    if (!useSplitStore.getState().active) return;
    const el = containerRef.current;
    const pageEl = pageContainerRef.current;
    if (!el || !pageEl) return;
    const c = viewCenterOnPage(el.getBoundingClientRect(), pageEl.getBoundingClientRect());
    if (c) useSplitStore.getState().setMainView({ pageIndex: useDocumentStore.getState().currentPageIndex, ...c });
  }, []);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  // Nodo de la capa de texto como estado: en la vista continua cambia de hoja al activar otra página
  const [textLayerNode, setTextLayerNode] = useState<HTMLDivElement | null>(null);
  const setTextLayerRef = useCallback((node: HTMLDivElement | null) => {
    textLayerRef.current = node;
    setTextLayerNode(node);
  }, []);
  const dragStateRef = useRef<DragState | null>(null);
  const markupsRef = useRef(markups);
  markupsRef.current = markups;

  const anchorDragRef = useRef<{
    markupId: string;
    leaderIndex: number;
    /** 0 = punta de la flecha; 1 = codo de la directriz (ADR-0042). */
    pointIndex: number;
    initialLeaders: MarkupPoint[][];
    startScreenX: number;
    startScreenY: number;
    hasMoved: boolean;
  } | null>(null);

  // Arrastre de un punto de control (ADR-0021): marca original y vértice
  const vertexDragRef = useRef<{
    original: Markup;
    index: number;
    hasMoved: boolean;
    latest: Markup;
    /** Tiradores de la caja (ADR-0039): escalar desde una esquina o rotar alrededor del centro. */
    transform?: { mode: 'scale' | 'rotate'; corner: number; startAngle: number; grab: MarkupPoint };
    /** Texto de una distancia o cota (ADR-0097): sitio normal del texto y dónde se agarró el tirador, en pantalla. */
    caption?: { origin: { x: number; y: number }; angle: number; pxPerPt: number; grab: { x: number; y: number } };
  } | null>(null);
  // Control de zoom del doble clic (ADR-0021): posición en pantalla
  const [zoomWidget, setZoomWidget] = useState<{ x: number; y: number } | null>(null);
  // Hipervínculo en creación (caja ya dibujada, falta el destino) y enlaces propios del PDF en la página activa
  const [linkDraft, setLinkDraft] = useState<MarkupPoint[] | null>(null);
  const [pdfLinks, setPdfLinks] = useState<PdfLinkArea[]>([]);
  // Grupo de botones de opción en curso: los botones seguidos se agrupan como en Revu
  const radioGroupRef = useRef<{ name: string; count: number } | null>(null);
  const zoomWidgetRef = useRef<{ x: number; y: number } | null>(null);
  zoomWidgetRef.current = zoomWidget;

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
  const pageViewportRef = useRef(pageViewport);
  pageViewportRef.current = pageViewport;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Dimensiones normalizadas y aceleración espacial celular por página (ADR-0089 / Hito D.2)
  const pageDims = useMemo(() => {
    const w = pageViewport.width / (scale || 1.0);
    const h = pageViewport.height / (scale || 1.0);
    return { width: w, height: h };
  }, [pageViewport.width, pageViewport.height, scale]);

  // Marcas de la página activa filtradas por visibilidad de capa (ADR-0024 / ADR-0089)
  const pageMarkups = useMemo(() => {
    return markups.filter((m) => m.pageIndex === currentPageIndex && isMarkupVisible(m));
  }, [markups, currentPageIndex, isMarkupVisible]);

  const pageSpatialIndex = useMemo(() => {
    return getSpatialIndexForPage(pageMarkups, currentPageIndex, pageDims);
  }, [pageMarkups, currentPageIndex, pageDims]);

  // Tamaño sin escalar (pt, con la rotación aplicada) de todas las páginas (ADR-0019): permite maquetar la vista
  // continua sin saltos antes de renderizar y calcular "Ajustar a página". Vacío si el documento no lo ofrece.
  const overlayActive = useOverlayStore((s) => s.active);
  const overlayAlign = useOverlayStore((s) => s.align);
  const overlayBaseColor = useOverlayStore((s) => s.baseColor);
  const overlayOtherColor = useOverlayStore((s) => s.otherColor);
  const overlayMatrix = useOverlayStore((s) => s.matrix);
  const overlayOffset = useOverlayStore((s) => s.offset);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);
  const pageSizesRef = useRef(pageSizes);
  pageSizesRef.current = pageSizes;
  useEffect(() => {
    let cancelled = false;
    setPageSizes([]);
    const doc = pdfDoc as unknown as { getPage?: (n: number) => Promise<PdfPageLike> } | null;
    if (!doc || typeof doc.getPage !== 'function' || numPages <= 0) return;
    Promise.all(
      Array.from({ length: numPages }, (_, i) =>
        doc.getPage!(i + 1).then((page) => {
          const total = (((page.rotate + rotation) % 360) + 360) % 360;
          const vp = page.getViewport({ scale: 1, rotation: total });
          return { w: vp.width, h: vp.height };
        })
      )
    )
      .then((sizes) => {
        if (!cancelled) setPageSizes(sizes);
      })
      .catch((err) => {
        // Sin tamaños se mantiene la vista de una página: nunca se deja el visor en blanco
        console.error('No se pudieron leer los tamaños de página; se usa la vista de una página:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, numPages, rotation]);

  // Capas del PDF (ADR-0024): se cargan al abrir, todas con su visibilidad inicial del documento
  useEffect(() => {
    const doc = pdfDoc as unknown as { getOptionalContentConfig?: () => Promise<unknown> } | null;
    const { setOcConfig } = useDocumentStore.getState();
    if (!doc || typeof doc.getOptionalContentConfig !== 'function') {
      setOcConfig(null);
      return;
    }
    let cancelled = false;
    doc
      .getOptionalContentConfig()
      .then((cfg) => {
        if (!cancelled) setOcConfig(cfg);
      })
      .catch((err) => {
        // Sin capas el plano se ve con su contenido por defecto; se informa en consola para diagnóstico
        console.error('No se pudieron leer las capas del PDF:', err);
        if (!cancelled) setOcConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  // Enlaces propios del PDF en la página activa (índices de láminas, referencias): se siguen con un clic
  useEffect(() => {
    let cancelled = false;
    setPdfLinks([]);
    const doc = pdfDoc as unknown as {
      getPage?: (n: number) => Promise<{
        rotate: number;
        getViewport: (o: { scale: number; rotation: number }) => {
          width: number;
          height: number;
          convertToViewportRectangle: (r: number[]) => number[];
        };
        getAnnotations: () => Promise<{ subtype: string; rect: number[]; url?: string; dest?: unknown; id?: string }[]>;
      }>;
      getDestination?: (name: string) => Promise<unknown[] | null>;
      getPageIndex?: (ref: unknown) => Promise<number>;
    } | null;
    if (!doc || typeof doc.getPage !== 'function') return;
    (async () => {
      const page = await doc.getPage!(currentPageIndex + 1);
      const vp = page.getViewport({ scale: 1, rotation: (((page.rotate + rotation) % 360) + 360) % 360 });
      const annots = await page.getAnnotations();
      const reaIds = new Set(useMarkupStore.getState().markups.map((m) => m.id));
      const out: PdfLinkArea[] = [];
      for (const a of annots) {
        if (a.subtype !== 'Link' || (a.id && reaIds.has(a.id))) continue;
        const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect);
        const area: PdfLinkArea = {
          x: Math.min(x1, x2) / vp.width,
          y: Math.min(y1, y2) / vp.height,
          w: Math.abs(x2 - x1) / vp.width,
          h: Math.abs(y2 - y1) / vp.height,
        };
        if (a.url) area.url = a.url;
        else if (a.dest) {
          const dest = typeof a.dest === 'string' ? await doc.getDestination?.(a.dest) : (a.dest as unknown[]);
          if (Array.isArray(dest) && dest[0] && typeof doc.getPageIndex === 'function') {
            area.pageIndex =
              typeof dest[0] === 'number' ? (dest[0] as number) : await doc.getPageIndex(dest[0]).catch(() => undefined);
          }
        }
        if (area.url || area.pageIndex !== undefined) out.push(area);
      }
      if (!cancelled) setPdfLinks(out);
    })().catch((err) => {
      // Sin enlaces navegables el plano se sigue viendo: se registra para diagnóstico
      console.error('No se pudieron leer los enlaces de la página:', err);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPageIndex, rotation]);

  const followPdfLink = (l: PdfLinkArea) => {
    if (l.url) void openExternalUrl(l.url);
    else if (l.pageIndex !== undefined) goToPageNumber(l.pageIndex + 1);
  };
  const followMarkupLink = (m: Markup) => {
    const uri = m.customFields?.linkUri;
    const pageNo = m.customFields?.linkPage;
    if (typeof uri === 'string' && uri) void openExternalUrl(uri);
    else if (typeof pageNo === 'number') goToPageNumber(pageNo);
  };

  const isContinuous = viewMode === 'continuous' && pageSizes.length === numPages && numPages > 0;

  // Mientras la página activa se renderiza, su lienzo ya ocupa el tamaño definitivo (sin saltos de maquetación)
  useLayoutEffect(() => {
    const sz = pageSizes[currentPageIndex];
    if (!sz) return;
    const width = sz.w * scale;
    const height = sz.h * scale;
    useUiStore.getState().setPageDimensionsPt({ width: sz.w, height: sz.h });
    setPageViewport((prev) =>
      Math.abs(prev.width - width) < 0.01 && Math.abs(prev.height - height) < 0.01 ? prev : { width, height }
    );
  }, [pageSizes, currentPageIndex, scale]);

  // Desplazamientos del visor hechos por código (zoom, ir a página): no deben cambiar la página activa
  // Se recuerda la posición resultante: el evento scroll que llegue con esa misma posición se ignora, y cualquier
  // desplazamiento posterior del usuario sí actualiza la página activa
  const programmaticScrollRef = useRef<{ left: number; top: number } | null>(null);
  const setScrollProgrammatically = (el: HTMLElement, left: number, top: number) => {
    el.scrollLeft = Math.max(0, left);
    el.scrollTop = Math.max(0, top);
    programmaticScrollRef.current = { left: el.scrollLeft, top: el.scrollTop };
  };
  // Zoom con Ctrl+rueda: punto del contenido que debe quedar bajo el cursor tras el cambio de escala
  const zoomAnchorRef = useRef<{ rx: number; ry: number; px: number; py: number } | null>(null);
  // Tras "Ajustar a página/ancho" se lleva al inicio de la página activa en lugar de conservar el centro
  const scrollToPageAfterLayoutRef = useRef(false);

  const scrollToPageSlot = useCallback((pageIndex: number) => {
    const el = containerRef.current;
    const slot = el?.querySelector(`[data-page-slot="${pageIndex}"]`) as HTMLElement | null;
    if (!el || !slot) return;
    setScrollProgrammatically(el, slot.offsetLeft + slot.offsetWidth / 2 - el.clientWidth / 2, slot.offsetTop - 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar el tamaño del contenido (zoom/rotación) se conserva el punto bajo el cursor (Ctrl+rueda) o el
  // centro de la vista. En la vista continua el tamaño depende solo de la escala; en la de una página, del render.
  const layoutKey = isContinuous
    ? `c|${scale}|${rotation}|${pageSizes.length}`
    : `s|${pageViewport.width}|${pageViewport.height}`;
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (scrollToPageAfterLayoutRef.current && isContinuous) {
      scrollToPageAfterLayoutRef.current = false;
      scrollToPageSlot(useDocumentStore.getState().currentPageIndex);
      return;
    }
    scrollToPageAfterLayoutRef.current = false;
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (anchor) {
      setScrollProgrammatically(el, anchor.rx * el.scrollWidth - anchor.px, anchor.ry * el.scrollHeight - anchor.py);
      updateViewCenter();
      return;
    }
    const { rx, ry } = viewCenterRef.current;
    setScrollProgrammatically(el, rx * el.scrollWidth - el.clientWidth / 2, ry * el.scrollHeight - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Estado del dibujo para figuras de 2 puntos (rect, circle, line, cloud)
  const [drawingStart, setDrawingStart] = useState<MarkupPoint | null>(null);
  const [currentDrawPoint, setCurrentDrawPoint] = useState<MarkupPoint | null>(null);

  // Estado del motor multi-punto (polygon y freehand)
  const [polygonPoints, setPolygonPoints] = useState<MarkupPoint[]>([]);
  const [freehandPoints, setFreehandPoints] = useState<MarkupPoint[]>([]);
  const [mouseCursorPoint, setMouseCursorPoint] = useState<MarkupPoint | null>(null);
  const [snapshotFlashRect, setSnapshotFlashRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Estado del editor de texto inline (B6 y A.4)
  const [inlineEditing, setInlineEditing] = useState<{
    markupId: string;
    initialText: string;
    position: MarkupPoint;
    isStickyNote?: boolean;
    isPendingCreation?: boolean;
    initialColor?: string;
  } | null>(null);

  // Resultado del render de cada página: la activa fija el tamaño del overlay interactivo
  const handlePageRendered = useCallback(
    (pageIndex: number, result: RenderResult, active: boolean) => {
      if (active && pageIndex === useDocumentStore.getState().currentPageIndex) {
        setPageViewport({ width: result.width, height: result.height });
      }
      setPageDimensions(pageIndex, result.width, result.height);
      setPageHasText(pageIndex, result.hasText);
    },
    [setPageDimensions, setPageHasText]
  );

  // ── Página activa en la vista continua (ADR-0019) ──────────────────────────────────────────────
  // La página bajo el cursor (o la del centro de la vista) es la interactiva. Nunca se cambia a mitad de un
  // trazo, un arrastre o una edición de texto.
  const internalNavRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const isInteracting = () =>
    Boolean(
      drawingStart ||
        polygonPoints.length > 0 ||
        freehandPoints.length > 0 ||
        inlineEditing ||
        dragStateRef.current ||
        marqueeStateRef.current ||
        anchorDragRef.current ||
        vertexDragRef.current
    );
  const activatePage = (pageIndex: number) => {
    if (pageIndex === useDocumentStore.getState().currentPageIndex || isInteracting()) return;
    internalNavRef.current = true;
    setCurrentPage(pageIndex);
  };

  const pageIndexAtClientY = (clientY: number): number | null => {
    const el = containerRef.current;
    if (!el) return null;
    let bestIndex: number | null = null;
    let bestDist = Infinity;
    el.querySelectorAll<HTMLElement>('[data-page-slot]').forEach((slot) => {
      const r = slot.getBoundingClientRect();
      const d = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
      if (d < bestDist) {
        bestDist = d;
        bestIndex = Number(slot.dataset.pageSlot);
      }
    });
    return bestIndex;
  };

  const handleContainerScroll = () => {
    updateViewCenter();
    const el = containerRef.current;
    const prog = programmaticScrollRef.current;
    const isProg = Boolean(prog && el && Math.abs(prog.top - el.scrollTop) < 1 && Math.abs(prog.left - el.scrollLeft) < 1);
    if (isProg) {
      programmaticScrollRef.current = null;
    } else {
      publishSplitView();
      if (el) {
        setScrollPos({ scrollLeft: el.scrollLeft, scrollTop: el.scrollTop });
      }
    }
    if (!isContinuous || !el || isProg) return;
    const rect = el.getBoundingClientRect();
    const probeY = lastPointerRef.current?.y ?? rect.top + el.clientHeight / 2;
    const i = pageIndexAtClientY(probeY);
    if (i !== null) activatePage(i);
  };

  // Al abrir el panel lado a lado, al cambiar de zoom o de página desde el visor: el panel sigue al visor
  useEffect(() => {
    if (!splitActive || useSplitStore.getState().driver === 'split') return;
    const id = requestAnimationFrame(publishSplitView);
    return () => cancelAnimationFrame(id);
  }, [splitActive, scale, currentPageIndex, publishSplitView]);

  // Sincronización inversa (split -> main, ADR-0054): el visor principal se desplaza hacia el centro del panel derecho
  useLayoutEffect(() => {
    if (!splitActive || !splitSync || splitDriver !== 'split' || !splitView) return;
    const el = containerRef.current;
    const pageEl = pageContainerRef.current;
    if (!el || !pageEl) return;
    const target = scrollToCenter(
      splitView.nx,
      splitView.ny,
      pageViewport,
      { x: pageEl.offsetLeft, y: pageEl.offsetTop },
      { width: el.clientWidth, height: el.clientHeight },
      { width: el.scrollWidth, height: el.scrollHeight }
    );
    setScrollProgrammatically(el, target.left, target.top);
    updateViewCenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitActive, splitSync, splitDriver, splitView, pageViewport]);

  // Navegación externa (miniaturas, barra de estado, búsqueda): llevar la página a la vista
  useLayoutEffect(() => {
    if (!isContinuous) return;
    if (internalNavRef.current) {
      internalNavRef.current = false;
      return;
    }
    scrollToPageSlot(currentPageIndex);
  }, [currentPageIndex, isContinuous, scrollToPageSlot]);

  // Páginas cercanas a la vista (las demás no retienen su mapa de bits)
  const [visiblePages, setVisiblePages] = useState<Set<number> | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!isContinuous || !el || typeof IntersectionObserver === 'undefined') {
      setVisiblePages(null);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev ?? []);
          for (const entry of entries) {
            const i = Number((entry.target as HTMLElement).dataset.pageSlot);
            if (entry.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next;
        });
      },
      { root: el, rootMargin: '600px 0px' }
    );
    el.querySelectorAll('[data-page-slot]').forEach((slot) => observer.observe(slot));
    return () => observer.disconnect();
  }, [isContinuous, numPages, pdfDoc]);

  // ── Ajustar a página / al ancho (ADR-0019) ─────────────────────────────────────────────────────
  const applyFit = useCallback(
    (kind: 'page' | 'width') => {
      const el = containerRef.current;
      if (!el) return;
      const { currentPageIndex: idx, scale: currentScale } = useDocumentStore.getState();
      const sz = pageSizes[idx] ?? {
        w: pageViewport.width / (currentScale || 1),
        h: pageViewport.height / (currentScale || 1),
      };
      if (!(sz.w > 0) || !(sz.h > 0)) return;
      const PADDING = 64; // p-8 a cada lado
      const availW = el.clientWidth - PADDING - 4;
      const availH = el.clientHeight - PADDING - 4;
      if (availW <= 0 || availH <= 0) return;
      const target = kind === 'width' ? availW / sz.w : Math.min(availW / sz.w, availH / sz.h);
      scrollToPageAfterLayoutRef.current = true;
      setScale(Math.floor(target * 100) / 100);
    },
    [pageSizes, pageViewport.width, pageViewport.height, setScale]
  );

  const lastFitSeqRef = useRef(0);
  useEffect(() => {
    if (!fitRequest || fitRequest.seq === lastFitSeqRef.current) return;
    lastFitSeqRef.current = fitRequest.seq;
    applyFit(fitRequest.kind);
  }, [fitRequest, applyFit]);

  // Al abrir un archivo, la primera página se ajusta al área visible
  const fittedDocRef = useRef<unknown>(null);
  useEffect(() => {
    if (!pdfDoc || !filePath || pageSizes.length === 0 || fittedDocRef.current === pdfDoc) return;
    fittedDocRef.current = pdfDoc;
    applyFit('page');
  }, [pdfDoc, filePath, pageSizes, applyFit]);

  /** Cambia el zoom manteniendo fijo el contenido que está bajo un punto de la pantalla. */
  const zoomAtClientPoint = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current;
    if (!el || !useDocumentStore.getState().pdfBytes) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    zoomAnchorRef.current = {
      rx: (el.scrollLeft + px) / (el.scrollWidth || 1),
      ry: (el.scrollTop + py) / (el.scrollHeight || 1),
      px,
      py,
    };
    const current = useDocumentStore.getState().scale;
    useDocumentStore.getState().setScale(Math.round(current * factor * 100) / 100);
  }, []);

  /** Desplaza la vista para que el punto de la pantalla quede en el centro. */
  const centerViewAt = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setScrollProgrammatically(
      el,
      el.scrollLeft + clientX - (rect.left + el.clientWidth / 2),
      el.scrollTop + clientY - (rect.top + el.clientHeight / 2)
    );
    updateViewCenter();
  };

  // Ctrl+rueda: zoom anclado al cursor (listener no pasivo para impedir el zoom del navegador)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Con el control de zoom abierto (doble clic), la rueda acerca/aleja en ese punto sin Ctrl, como en Revu:
      // girarla hacia uno acerca y hacia delante aleja (ADR-0063; al revés que Ctrl+rueda)
      const widget = zoomWidgetRef.current;
      if (widget) {
        e.preventDefault();
        zoomAtClientPoint(widget.x, widget.y, e.deltaY > 0 ? 1.15 : 1 / 1.15);
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAtClientPoint(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAtClientPoint]);

  // ── Puntos de control (ADR-0021) ───────────────────────────────────────────────────────────────
  /** Recalcula la medida (y el texto de una cota no personalizada) para la nueva forma. */
  const reshapedMarkup = (original: Markup, points: MarkupPoint[]): Markup => {
    const dims = { width: pageViewport.width / (scale || 1.0), height: pageViewport.height / (scale || 1.0) };
    const calib = useCalibrationStore.getState().getEffectiveCalibration(original.pageIndex, points);
    // Al deformar, el texto de una medición pasa a ser su valor nuevo (como antes de ADR-0031)
    const next = remeasureMarkup(original, points, dims, calib);
    if (next.measurement && next.type !== 'dimension') next.text = next.measurement.formatted;
    return next;
  };

  const handleControlPointMouseDown = (e: React.MouseEvent, markup: Markup, index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (markup.locked) return;
    vertexDragRef.current = { original: markup, index, hasMoved: false, latest: markup };
  };

  /** Arrastrar el texto de una distancia o cota para separarlo de la línea (ADR-0097). */
  const handleCaptionMouseDown = (e: React.MouseEvent, markup: Markup) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (markup.locked) return;
    const frame = measureCaptionFrame(markup, viewportTransform);
    if (!frame) return;
    const rect = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    const here = captionHandlePosition(markup, frame);
    vertexDragRef.current = {
      original: markup,
      index: -1,
      hasMoved: false,
      latest: markup,
      caption: { origin: frame.origin, angle: frame.angle, pxPerPt: frame.pxPerPt, grab: { x: e.clientX - rect.left - here.x, y: e.clientY - rect.top - here.y } },
    };
  };

  /** Escalar desde una esquina o rotar con el tirador superior (ADR-0039). */
  const handleTransformMouseDown = (e: React.MouseEvent, markup: Markup, mode: 'scale' | 'rotate', corner = 0) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (markup.locked) return;
    let startAngle = 0;
    const b = markupBounds(markup)!;
    const rect = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    const pt = screenToNormalized(e.clientX - rect.left, e.clientY - rect.top, viewportTransform);
    if (mode === 'rotate') {
      const w = pageViewport.width / (scale || 1);
      const h = pageViewport.height / (scale || 1);
      startAngle = Math.atan2((pt.y - (b.minY + b.maxY) / 2) * h, (pt.x - (b.minX + b.maxX) / 2) * w);
    }
    // El cuadro queda separado del dibujo (ADR-0041): se arrastra la esquina de los puntos con el mismo desfase
    const c0 = boundsCorners(b)[corner];
    const grab = { x: pt.x - c0.x, y: pt.y - c0.y };
    vertexDragRef.current = { original: markup, index: -1, hasMoved: false, latest: markup, transform: { mode, corner, startAngle, grab } };
  };

  const finishVertexDrag = () => {
    const drag = vertexDragRef.current;
    if (!drag) return;
    vertexDragRef.current = null;
    if (!drag.hasMoved) return;
    const { original, latest } = drag;
    if (drag.caption) {
      // El texto desplazado se guarda como un cambio de propiedades, deshacible de una vez
      const o = captionOffsetOf(latest.customFields);
      setMarkupsTransient([original]);
      useMarkupStore.getState().applyPropertiesToMarkups(
        [original.id],
        { customFields: { captionOffsetX: o.along, captionOffsetY: o.up } },
        'Move value text'
      );
      return;
    }
    useMarkupStore.getState().reshapeMarkup(
      original.id,
      { points: original.points, measurement: original.measurement, text: original.text, leaders: original.leaders },
      { points: latest.points, measurement: latest.measurement, text: latest.text, leaders: latest.leaders },
      drag.transform ? (drag.transform.mode === 'rotate' ? 'Rotate markup' : 'Scale markup') : undefined
    );
  };
  const finishVertexDragRef = useRef(finishVertexDrag);
  finishVertexDragRef.current = finishVertexDrag;

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
        if (vertexDragRef.current) {
          e.preventDefault();
          const { original } = vertexDragRef.current;
          vertexDragRef.current = null;
          setMarkupsTransient([original]);
          return;
        }
        if (zoomWidget) {
          setZoomWidget(null);
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
        if (useUiStore.getState().activeCutoutTargetId) {
          useUiStore.getState().cancelCutout();
        }
        if (polygonPoints.length > 0 || freehandPoints.length > 0 || drawingStart) {
          e.preventDefault();
          twoClickRef.current = false;
          leaderStageRef.current = null;
          setPolygonPoints([]);
          setFreehandPoints([]);
          setDrawingStart(null);
          setCurrentDrawPoint(null);
          setInlineEditing(null);
        } else if (activeTool === 'calibrate' || activeTool === 'snapshot' || activeTool === 'zoom') {
          // Sin trazo en curso, Esc abandona la calibración, instantánea o zoom (como en Revu)
          useToolStore.getState().setActiveTool('select');
        }
        return;
      }

      // Enter finaliza el polígono, la polilínea, la polilínea de medida o el área
      if (e.key === 'Enter' && (isMultiPointTool(activeTool) || (isCloudTool(activeTool) && polygonPoints.length > 0))) {
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

      // Atajos de vista de Revu (ADR-0023): Ctrl+9 ajustar a página, Ctrl+0 al ancho, Ctrl+8 tamaño real,
      // Ctrl+4 página única, Ctrl+5 continua, Ctrl+3 modo oscuro
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && /^Digit[034589]$/.test(e.code)) {
        e.preventDefault();
        const ui = useUiStore.getState();
        if (e.code === 'Digit9') ui.requestFit('page');
        else if (e.code === 'Digit0') ui.requestFit('width');
        else if (e.code === 'Digit8') useDocumentStore.getState().resetZoom();
        else if (e.code === 'Digit4') ui.setViewMode('single');
        else if (e.code === 'Digit5') ui.setViewMode('continuous');
        else if (e.code === 'Digit3') ui.toggleTheme();
        return;
      }

      // Páginas (Revu): Ctrl+Shift+R rotar, Ctrl+Shift+X extraer
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.code === 'KeyR' || e.code === 'KeyX')) {
        e.preventDefault();
        void runPageOperation(e.code === 'KeyR' ? 'rotate' : 'extract');
        return;
      }

      // Rotar vista 90° (ADR-0086): Ctrl+Shift++ en sentido horario, Ctrl+Shift+- en sentido antihorario
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        if (e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault();
          useDocumentStore.getState().rotateClockwise();
          return;
        }
        if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          useDocumentStore.getState().rotateCounterClockwise();
          return;
        }
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

      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'q' || e.key === 'Q')) {
        useToolStore.getState().setActiveTool('callout');
        return;
      }

      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
        useToolStore.getState().setActiveTool('stickyNote');
        return;
      }

      // Mediciones con Shift+Alt (como en Revu): L longitud, Q polilongitud, A área, C conteo, K recorte
      if (e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey) {
        const measureByCode: Record<string, ToolType> = {
          KeyL: 'length',
          KeyQ: 'polylineMeasure',
          KeyA: 'area',
          KeyC: 'count',
          KeyP: 'perimeter',
          KeyV: 'volume',
          KeyG: 'angle',
          KeyU: 'radius',
          KeyR: 'radius', // atajo anterior de REA
          KeyD: 'diameter',
          KeyK: 'polygonCutout',
        };
        const tool = measureByCode[e.code];
        if (tool) {
          e.preventDefault();
          useToolStore.getState().setActiveTool(tool);
          return;
        }
      }

      // Cota (Shift+L), polígono (Shift+P), polilínea (Shift+N), borrador (Shift+E), arco (Shift+C) y Pan (Shift+V), como en Revu (ADR-0052)
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const shiftTool: Record<string, ToolType> = {
          l: 'dimension',
          p: 'polygon',
          n: 'polyLine',
          v: 'pan',
          e: 'eraser',
          c: 'arc',
        };
        const tool = shiftTool[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          useToolStore.getState().setActiveTool(tool);
          return;
        }
      }

      if (
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === 'h' || e.key === 'H' || e.key === 'u' || e.key === 'U')
      ) {
        e.preventDefault();
        if (pageHasText[currentPageIndex] === false) {
          showToast(
            'This page has no selectable text layer. Use the Highlight tool (H).'
          );
        }
        useToolStore
          .getState()
          .setActiveTool(e.key.toLowerCase() === 'u' ? 'squiggly' : 'highlightText');
        return;
      }

      // Atajos de una letra (ADR-0017/0052): los de Revu; F (lápiz) y O (elipse) quedan como atajos anteriores
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const toolByKey: Record<string, ToolType> = {
          v: 'select',
          t: 'text',
          w: 'typewriter',
          r: 'rectangle',
          e: 'circle',
          o: 'circle',
          l: 'line',
          a: 'arrow',
          p: 'freehand',
          f: 'freehand',
          c: 'cloud',
          k: 'cloudPlus',
          s: 'stamp',
          g: 'snapshot',
          j: 'dynamicFill',
          z: 'zoom',
        };
        const tool = toolByKey[e.key.toLowerCase()];
        if (tool) {
          useToolStore.getState().setActiveTool(tool);
          return;
        }
        // Subrayado (U) y tachado (D) sobre el texto del plano
        const textTool: Record<string, ToolType> = { u: 'underline', d: 'strikeOut' };
        const tt = textTool[e.key.toLowerCase()];
        if (tt) {
          if (pageHasText[currentPageIndex] === false) {
            showToast('This page has no selectable text layer. Use the Highlight tool (H).');
          }
          useToolStore.getState().setActiveTool(tt);
          return;
        }
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
    zoomWidget,
  ]);

  // Transformación para convertir coordenadas
  const viewportTransform = useMemo(
    () => ({
      width: pageViewport.width,
      height: pageViewport.height,
      scale: 1.0,
      offsetX: 0,
      offsetY: 0,
      zoom: scale || 1.0,
      hideMeasureLabels: !showMeasureLabels,
    }),
    [pageViewport.width, pageViewport.height, scale, showMeasureLabels]
  );

  // Listener global de mouseup para asegurar finalización de arrastre limpia incluso fuera del svg
  useEffect(() => {
    const handleWindowMouseUp = (e: MouseEvent) => {
      if (vertexDragRef.current) {
        finishVertexDragRef.current();
        return;
      }
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
          const { markups: allMarkups } = useMarkupStore.getState();
          const dims = { width: unscaledW, height: unscaledH };
          const calStore = useCalibrationStore.getState();
          const enrichedMoves = result.moves.map((move) => {
            const m = allMarkups.find((it) => it.id === move.id);
            if (!m || !SCALED_MEASURE_TYPES.has(m.type)) return move;
            const prevCal = calStore.getEffectiveCalibration(m.pageIndex, move.originalPoints);
            const nextCal = calStore.getEffectiveCalibration(m.pageIndex, move.newPoints);
            if (JSON.stringify(prevCal) !== JSON.stringify(nextCal)) {
              const remeasured = remeasureMarkup(m, move.newPoints, dims, nextCal, prevCal);
              return {
                ...move,
                originalMeasurement: m.measurement,
                newMeasurement: remeasured.measurement,
                originalText: m.text,
                newText: remeasured.text,
              };
            }
            return move;
          });
          commitMoveMarkups(enrichedMoves);
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

  // Cambiar la escala de una página o un viewport recalcula sus mediciones (ADR-0031, ADR-0076), como Revu: si no, una longitud medida antes
  // de calibrar seguiría en mm de papel
  useEffect(() => {
    return useCalibrationStore.subscribe((state, prevState) => {
      const beforeCal = prevState.calibrations;
      const afterCal = state.calibrations;
      const beforeVp = prevState.viewports;
      const afterVp = state.viewports;
      // Abrir un documento sustituye las escalas/viewports por las suyas (y las importadas): sus medidas ya vienen del PDF
      if (
        (beforeCal === afterCal && beforeVp === afterVp) ||
        state.importedCalibrations !== prevState.importedCalibrations ||
        state.importedViewports !== prevState.importedViewports
      ) {
        return;
      }
      const changedPages = new Set<number>();
      for (const k of new Set([...Object.keys(beforeCal), ...Object.keys(afterCal)])) {
        if (JSON.stringify(beforeCal[Number(k)]) !== JSON.stringify(afterCal[Number(k)])) changedPages.add(Number(k));
      }
      for (const k of new Set([...Object.keys(beforeVp), ...Object.keys(afterVp)])) {
        if (JSON.stringify(beforeVp[Number(k)]) !== JSON.stringify(afterVp[Number(k)])) changedPages.add(Number(k));
      }
      if (changedPages.size === 0) return;
      const { markups: all } = useMarkupStore.getState();
      const updated: Markup[] = [];
      for (const m of all) {
        if (!changedPages.has(m.pageIndex) || !SCALED_MEASURE_TYPES.has(m.type)) continue;
        const size = pageSizesRef.current[m.pageIndex];
        const dims = size
          ? { width: size.w, height: size.h }
          : { width: pageViewportRef.current.width / (scaleRef.current || 1), height: pageViewportRef.current.height / (scaleRef.current || 1) };
        const prev = prevState.getEffectiveCalibration(m.pageIndex, m.points);
        const curr = state.getEffectiveCalibration(m.pageIndex, m.points);
        updated.push(remeasureMarkup(m, m.points, dims, curr, prev));
      }
      if (updated.length > 0) useMarkupStore.getState().remeasureMarkups(updated);
    });
  }, []);

  // Snap (ADR-0025): al dibujar o medir, el cursor se ajusta a extremos, puntos medios o aristas de las marcas
  const [snapIndicator, setSnapIndicator] = useState<SnapResult | null>(null);
  // Trazos del plano de la página activa para "Snap to Content" (ADR-0031), cargados al usar una herramienta con snap
  const contentIndexRef = useRef<{ key: string; index: ContentSnapIndex | null }>({ key: '', index: null });
  const snapContent = useUiStore((s) => s.snap.content);
  const wantsContent = SNAP_TOOLS.has(activeTool) && snapContent;
  useEffect(() => {
    const doc = pdfDoc as unknown as Parameters<typeof loadContentSnapIndex>[0] | null;
    if (!wantsContent || !doc || typeof doc.getPage !== 'function') return;
    const key = `${currentPageIndex}|${rotation}`;
    if (contentIndexRef.current.key === key) return;
    contentIndexRef.current = { key, index: null };
    let cancelled = false;
    // Carga bajo demanda: el lector de geometría solo se descarga al usar una herramienta con snap
    import('../services/contentSnapService')
      .then((m) => m.loadContentSnapIndex(doc, currentPageIndex, rotation))
      .then((index) => {
        if (!cancelled && contentIndexRef.current.key === key) contentIndexRef.current = { key, index };
      })
      .catch((err) => {
        if (cancelled) return;
        contentIndexRef.current = { key: '', index: null };
        console.warn('[Snap] No se pudo leer la geometría del plano:', err);
        showToast('Snap to content is unavailable on this page; snapping to markups only.');
      });
    return () => {
      cancelled = true;
      if (contentIndexRef.current.key === key && !contentIndexRef.current.index) contentIndexRef.current = { key: '', index: null };
    };
  }, [wantsContent, pdfDoc, currentPageIndex, rotation]);

  const snapAt = useCallback(
    (pt: MarkupPoint): SnapResult | null => {
      if (!SNAP_TOOLS.has(useToolStore.getState().activeTool)) return null;
      const { snap, hiddenLayers: hidden } = useUiStore.getState();
      const page = useDocumentStore.getState().currentPageIndex;
      const candidates = useMarkupStore
        .getState()
        .markups.filter((m) => m.pageIndex === page && !hidden.includes(m.layer ?? NO_LAYER));
      return snapPoint(
        pt,
        candidates,
        { width: viewportTransform.width, height: viewportTransform.height },
        snap,
        8,
        contentIndexRef.current.index
      );
    },
    [viewportTransform]
  );

  // Punto anterior del trazo en curso: con Shift el siguiente se endereza respecto a él (ADR-0047)
  const orthoAnchorRef = useRef<{ anchor: MarkupPoint | null; first: MarkupPoint | null; box: boolean }>({
    anchor: null,
    first: null,
    box: false,
  });
  orthoAnchorRef.current = {
    anchor: polygonPoints.length > 0 ? polygonPoints[polygonPoints.length - 1] : drawingStart,
    first: polygonPoints.length > 0 ? polygonPoints[0] : null,
    // Arrastre de una caja (no hay vértices): Shift dibuja un cuadrado o un círculo (ADR-0048)
    box: polygonPoints.length === 0 && drawingStart !== null,
  };

  const getEventPoint = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): MarkupPoint => {
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const raw = screenToNormalized(screenX, screenY, viewportTransform);
      const pt = snapAt(raw)?.point ?? raw;
      // Shift (ADR-0047/0048): cajas cuadradas o circulares; trazos a 0°, 45° o 90° (salvo al cerrar el contorno
      // sobre su primer vértice)
      const { anchor, first, box } = orthoAnchorRef.current;
      const tool = useToolStore.getState().activeTool;
      if (!e.shiftKey || !anchor || leaderStageRef.current) return pt;
      const dims = { width: viewportTransform.width, height: viewportTransform.height };
      if (box && (SQUARE_TOOLS.has(tool) || tool === 'ellipseCutout')) return squareConstrain(anchor, pt, dims);
      if (!ORTHO_TOOLS.has(tool)) return pt;
      if (first && Math.hypot((pt.x - first.x) * dims.width, (pt.y - first.y) * dims.height) < 8) return pt;
      return orthoConstrain(anchor, pt, dims);
    },
    [viewportTransform, snapAt]
  );

  /**
   * Cloud+ (nube + llamada agrupadas): `cloudPoints` son las dos esquinas de una nube rectangular o los vértices de
   * una de forma libre (ADR-0039). La llamada se coloca a la derecha y su flecha apunta al vértice más cercano a la
   * esquina superior derecha del contorno.
   */
  const createCloudPlus = (cloudPoints: MarkupPoint[]) => {
    if (!cloudPoints || cloudPoints.length < 2) return;
    const now = new Date().toISOString();
    const groupId = uuidv4();
    const cloudId = uuidv4();
    const calloutId = uuidv4();
    const xs = cloudPoints.map((p) => p.x);
    const ys = cloudPoints.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Dimensiones de página en puntos (unscaled) y en pantalla con zoom
    const unscaledWidth = Math.max(1, pageViewport.width / (scale || 1.0));
    const unscaledHeight = Math.max(1, pageViewport.height / (scale || 1.0));
    const currentScale = scale || 1.0;

    // Tamaño de la caja de llamada calculado a partir del texto y fuente, no como porcentaje fijo de la lámina (ADR-0042)
    const normSize = estimateCalloutBoxNormalizedSize(
      'Cloud+ note',
      currentStyle.fontSize || 10,
      unscaledWidth,
      unscaledHeight
    );
    const calloutWidth = normSize.width;
    const calloutHeight = normSize.height;

    // Separación visual entre la nube y la caja adaptada al zoom (en Revu ~24-30 pt, en pantalla ~20-36 px según nivel de zoom)
    const gapPx = Math.max(20, Math.min(36, 24 * currentScale));
    const gapX = gapPx / Math.max(1, pageViewport.width);
    const gapY = gapPx / Math.max(1, pageViewport.height);

    // Como en Revu, la nota queda arriba a la derecha, separada de la nube por una directriz en diagonal (ADR-0057)
    let boxX = maxX + gapX;
    if (boxX + calloutWidth > 0.99) {
      boxX = Math.max(0.01, minX - calloutWidth - gapX);
    }
    let boxY = minY - calloutHeight - gapY;
    if (boxY < 0.01) {
      boxY = Math.min(0.99 - calloutHeight, maxY + gapY);
    }
    const boxP1 = {
      x: Math.max(0.005, Math.min(0.995 - calloutWidth, boxX)),
      y: Math.max(0.005, Math.min(0.995 - calloutHeight, boxY)),
    };
    const boxP2 = { x: boxP1.x + calloutWidth, y: boxP1.y + calloutHeight };

    // Vértice de la nube donde se ancla la directriz: el más próximo a la caja de llamada en espacio físico de página (pt)
    const boxCenter = { x: boxP1.x + calloutWidth / 2, y: boxP1.y + calloutHeight / 2 };
    const rectCorners: MarkupPoint[] = [
      { x: maxX, y: minY },
      { x: minX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
    const candidatePoints = cloudPoints.length > 2 ? cloudPoints : rectCorners;
    const arrowTarget = candidatePoints.reduce((best, p) => {
      const dBest = Math.hypot((best.x - boxCenter.x) * unscaledWidth, (best.y - boxCenter.y) * unscaledHeight);
      const dP = Math.hypot((p.x - boxCenter.x) * unscaledWidth, (p.y - boxCenter.y) * unscaledHeight);
      return dP < dBest ? p : best;
    });

    const cloudMarkup: Markup = {
      id: cloudId,
      type: 'cloudPlus',
      pageIndex: currentPageIndex,
      points: cloudPoints.map((p) => ({ ...p })),
      style: { ...currentStyle },
      author: author || 'Reviewer',
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      layer: activeLayer,
      groupId,
      customFields: cloudCreationFields(),
    };
    const calloutMarkup: Markup = {
      id: calloutId,
      type: 'callout',
      pageIndex: currentPageIndex,
      points: [boxP1, boxP2],
      leaders: [[{ ...arrowTarget }]],
      // Nota de Revu (ADR-0042): texto con directriz, sin caja; en Cloud+ la directriz sale de la nube sin flecha
      // (ADR-0057), como en Revu
      style: { ...currentStyle, lineEndingStart: 'none', hatch: undefined },
      text: 'Cloud+ note',
      ...calloutBorderFields(),
      author: author || 'Reviewer',
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      layer: activeLayer,
      groupId,
    };
    addMarkups([cloudMarkup, calloutMarkup], 'Create Cloud+');
    useToolChestStore.getState().recordRecent(cloudMarkup);
  };

  /** Borde elegido en la barra para los callouts nuevos (ADR-0042). */
  const calloutBorderFields = () => {
    const { calloutBorder: b, autoSizeText } = useToolStore.getState();
    const fields: Record<string, number> = {
      ...(b === undefined ? {} : { calloutBorder: b ? 1 : 0 }),
      // Autosize Text de Revu (ADR-0061)
      ...(autoSizeText ? { autoSizeText: 1 } : {}),
    };
    return Object.keys(fields).length ? { customFields: fields } : {};
  };

  /** Cierra una nube de forma libre (ADR-0039): nube poligonal o Cloud+. */
  const createCloudFromPolygon = (points: MarkupPoint[]) => {
    const pts = dedupeConsecutivePoints(points);
    if (pts.length < 3) return;
    if (activeTool === 'cloudPlus') {
      createCloudPlus(pts);
      return;
    }
    const now = new Date().toISOString();
    const cloud: Markup = {
      id: uuidv4(),
      type: 'cloud',
      pageIndex: currentPageIndex,
      points: pts.map((p) => ({ ...p })),
      style: { ...currentStyle },
      author: author || 'Reviewer',
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      layer: activeLayer,
      customFields: cloudCreationFields(),
    };
    addMarkup(cloud);
    useToolChestStore.getState().recordRecent(cloud);
  };

  /**
   * Cierra una figura multipunto y crea la marca (un solo comando, deshacible). El área se mide como
   * polígono (fórmula del área firmada) con su perímetro; la polilínea de medida, como longitud acumulada.
   */
  const finalizeMultiPoint = (points: MarkupPoint[]) => {
    setPolygonPoints([]);
    if (isCloudTool(activeTool)) {
      // Nube de forma libre (ADR-0039)
      if (points.length >= 3) createCloudFromPolygon(points);
      return;
    }

    const activeCutoutTargetId = useUiStore.getState().activeCutoutTargetId;
    if (activeCutoutTargetId && points.length >= 2) {
      const pageDimsPt = {
        width: pageViewport.width / (scale || 1.0),
        height: pageViewport.height / (scale || 1.0),
      };
      const calib = useCalibrationStore.getState().getEffectiveCalibration(currentPageIndex, points);
      useMarkupStore.getState().addCutout(activeCutoutTargetId, points, pageDimsPt, calib);
      useUiStore.setState({ activeCutoutTargetId: null });
      useToolStore.setState({ activeTool: 'select' });
      return;
    }

    if (!isMultiPointTool(activeTool) || points.length < minPointsFor(activeTool)) return;

    const pageDimsPt = {
      width: pageViewport.width / (scale || 1.0),
      height: pageViewport.height / (scale || 1.0),
    };
    const calib = useCalibrationStore.getState().getEffectiveCalibration(currentPageIndex, points);
    let measurement: Markup['measurement'];
    const extraFields: Record<string, string | number> = {};
    if (activeTool === 'polylineMeasure') {
      measurement = calculatePolylineLength(points, pageDimsPt, calib);
    } else if (activeTool === 'area') {
      measurement = calculateArea(points, pageDimsPt, calib, false);
    } else if (activeTool === 'perimeter') {
      measurement = calculatePerimeter(points, pageDimsPt, calib);
    } else if (activeTool === 'volume') {
      const depth = useToolStore.getState().volumeDepth;
      measurement = calculateVolume(points, pageDimsPt, calib, depth);
      extraFields.volumeDepth = depth;
    } else if (activeTool === 'angle') {
      measurement = calculateAngle(points, pageDimsPt, calib);
    }

    const style = { ...currentStyle };
    // El área se rellena con el color de trazo translúcido para que la superficie medida se vea
    if (activeTool === 'area' && (!style.fillColor || style.fillColor === 'transparent')) {
      style.fillColor = translucentFill(style.strokeColor);
    }

    const { subject: toolSubject, unitPrice: toolUnitPrice, layer: toolLayer, cost } =
      getActiveToolChestMetadata(activeTool, measurement?.value ?? 1, activeLayer);

    const now = new Date().toISOString();
    const newMarkup: Markup = {
      id: uuidv4(),
      type: activeTool as MarkupType,
      pageIndex: currentPageIndex,
      points: [...points],
      style,
      text: measurement ? measurement.formatted : undefined,
      author: author || 'Reviewer',
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      layer: toolLayer,
      subject: toolSubject,
      unitPrice: toolUnitPrice,
      cost,
      measurement,
      ...(measurement && (useToolStore.getState().measureLabel.trim() || Object.keys(extraFields).length)
        ? {
            customFields: {
              ...extraFields,
              ...(useToolStore.getState().measureLabel.trim() ? { measureLabel: useToolStore.getState().measureLabel.trim() } : {}),
            },
          }
        : {}),
      // Polígono o polilínea con tipo de línea Cloud (ADR-0041): tamaño e inversión de la barra de propiedades
      ...(!measurement && style.lineStyle === 'cloud' ? { customFields: cloudCreationFields() } : {}),
    };
    addMarkup(newMarkup);
    useToolChestStore.getState().recordRecent(newMarkup);
  };

  // Clic derecho sobre una marca: seleccionarla (si no lo estaba) y abrir el menú contextual
  const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const pt = getEventPoint(e);
    const hit = pageSpatialIndex.hitTest(pt, 0.015, pageDims);
    if (!hit) {
      setContextMenu(null);
      return;
    }
    if (!selectedMarkupIds.includes(hit.id)) {
      setSelectedMarkupIds([hit.id]);
    }
    let hitCutoutIndex: number | null = null;
    if (hit.cutouts && hit.cutouts.length > 0) {
      for (let i = 0; i < hit.cutouts.length; i++) {
        const c = hit.cutouts[i];
        if (c.length === 2) {
          const minX = Math.min(c[0].x, c[1].x);
          const maxX = Math.max(c[0].x, c[1].x);
          const minY = Math.min(c[0].y, c[1].y);
          const maxY = Math.max(c[0].y, c[1].y);
          if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
            hitCutoutIndex = i;
            break;
          }
        } else if (c.length >= 3) {
          if (isPointInPolygon(pt, c)) {
            hitCutoutIndex = i;
            break;
          }
        }
      }
    }
    setContextMenu({ x: e.clientX, y: e.clientY, hitCutoutIndex });
  };

  // Inicio de interacción con el ratón
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Pan (ADR-0052): arrastrar con la herramienta Pan o con el botón central desplaza el plano, como en Revu
    if (e.button === 1 || (e.button === 0 && activeTool === 'pan')) {
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const pt = getEventPoint(e);

    // Borrador (Eraser, Shift+E): eliminar la marca sobre la que se hace clic
    if (activeTool === 'eraser') {
      const hit = pageSpatialIndex.hitTest(pt, 0.02, pageDims);
      if (hit && !hit.locked) {
        useMarkupStore.getState().deleteMarkup(hit.id);
      }
      return;
    }

    // Herramientas de recorte (Polygon Cutout / Ellipse Cutout): activar la marca objetivo si no lo está
    if (activeTool === 'polygonCutout' || activeTool === 'ellipseCutout') {
      if (!useUiStore.getState().activeCutoutTargetId) {
        const hit = pageSpatialIndex.hitTest(pt, 0.015, pageDims);
        if (hit && (hit.type === 'area' || hit.type === 'volume')) {
          useUiStore.getState().startCutout(hit.id);
          setSelectedMarkupIds([hit.id]);
        } else {
          showToast('Select an Area or Volume measurement first to add a cutout.');
          return;
        }
      }
    }

    // Alineación por puntos de Overlay Pages (ADR-0050): el clic marca un punto, no dibuja ni selecciona
    if (overlayAlign.picking) {
      e.stopPropagation();
      const w = pageViewport.width / (scale || 1);
      const h = pageViewport.height / (scale || 1);
      useOverlayStore.getState().addAlignPoint({ x: pt.x * w, y: pt.y * h });
      return;
    }

    // 1. Modo Selección (A.0 y A.2: Vacío -> Marquee, Marca -> Movimiento)
    if (activeTool === 'select') {
      const pageMarkups = markups.filter((m) => m.pageIndex === currentPageIndex && isMarkupVisible(m));
      const isAdditive = Boolean(e.ctrlKey || e.metaKey || e.shiftKey);
      const hit = pageSpatialIndex.hitTest(pt, 0.015, pageDims);

      if (hit && hit.type === 'link' && (e.ctrlKey || e.metaKey)) {
        followMarkupLink(hit);
        return;
      }
      if (!hit) {
        const link = pdfLinks.find((l) => pt.x >= l.x && pt.x <= l.x + l.w && pt.y >= l.y && pt.y <= l.y + l.h);
        if (link) {
          followPdfLink(link);
          return;
        }
      }

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
          spatialIndex: pageSpatialIndex,
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

    // 2. Herramientas multipunto: polígono, polilínea, polilínea de medida y área (polígono); y la nube de forma
    //    libre una vez empezada con un clic (ADR-0039)
    if (isMultiPointTool(activeTool) || (isCloudTool(activeTool) && polygonPoints.length > 0)) {
      if (polygonPoints.length === 0) {
        setPolygonPoints([pt]);
      } else {
        // Ángulo (ADR-0029) o Arco (ADR-0081): el tercer clic lo completa
        if ((activeTool === 'angle' || activeTool === 'arc') && polygonPoints.length === 2) {
          finalizeMultiPoint([...polygonPoints, pt]);
          return;
        }
        if (isClosedMultiPointTool(activeTool)) {
          // Clic cerca del primer vértice: cerrar la figura (medido en píxeles de pantalla para no cerrar
          // prematuramente figuras pequeñas, columnas o rectángulos ortogonales al clicar el 4.° vértice)
          const firstPt = polygonPoints[0];
          const W = viewportTransform.width || 1;
          const H = viewportTransform.height || 1;
          const distPx = Math.hypot((pt.x - firstPt.x) * W, (pt.y - firstPt.y) * H);
          if (distPx <= 8 && polygonPoints.length >= 3) {
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

    // 4. Modo Contador (Count de Revu, ADR-0059): los clics se suman a la misma marca hasta cambiar de herramienta o
    // de página, o pulsar Enter o Esc; cada clic se deshace por separado
    if (activeTool === 'count') {
      const { countSymbol, countScale, activeCountId } = useToolStore.getState();
      const active = activeCountId ? useMarkupStore.getState().markups.find((m) => m.id === activeCountId) : undefined;
      if (active && active.type === 'count' && active.pageIndex === currentPageIndex) {
        const points = [...active.points, pt];
        const newCost =
          active.unitPrice !== undefined
            ? Math.round(points.length * Math.round(active.unitPrice * 100)) / 100
            : undefined;
        useMarkupStore
          .getState()
          .reshapeMarkup(
            active.id,
            { points: active.points, measurement: active.measurement, cost: active.cost },
            { points, measurement: countMeasurement(points.length), cost: newCost },
            'Add to count'
          );
        return;
      }

      const { subject: toolSubject, unitPrice: toolUnitPrice, layer: toolLayer, cost } =
        getActiveToolChestMetadata('count', 1, activeLayer);

      const now = new Date().toISOString();
      const newMarkup: Markup = {
        id: uuidv4(),
        type: 'count',
        pageIndex: currentPageIndex,
        points: [pt],
        style: {
          strokeColor: currentStyle.strokeColor || DEFAULT_MARKUP_COLOR,
          fillColor: 'transparent',
          strokeWidth: 1,
          opacity: currentStyle.opacity ?? 1,
        },
        author: author || 'Reviewer',
        createdAt: now,
        updatedAt: now,
        status: 'pending',
        layer: toolLayer,
        subject: toolSubject,
        unitPrice: toolUnitPrice,
        cost,
        measurement: countMeasurement(1),
        customFields: { countSymbol, countScale },
      };
      addMarkup(newMarkup);
      useToolStore.setState({ activeCountId: newMarkup.id });
      useToolChestStore.getState().recordRecent(newMarkup);
      return;
    }

    // Clic-clic (ADR-0031): con el punto 1 fijado, este clic da el punto 2 (se cierra en mouseUp); en una distancia
    // con líneas de referencia, el tercer clic fija el desplazamiento (ADR-0033)
    if (TWO_CLICK_TOOLS.has(activeTool) && (twoClickRef.current || leaderStageRef.current) && drawingStart) {
      setCurrentDrawPoint(pt);
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
    {
      const rect = e.currentTarget.getBoundingClientRect();
      const snapped = snapAt(screenToNormalized(e.clientX - rect.left, e.clientY - rect.top, viewportTransform));
      setSnapIndicator((prev) =>
        prev?.point.x === snapped?.point.x && prev?.point.y === snapped?.point.y && prev?.kind === snapped?.kind
          ? prev
          : snapped
      );
    }
    setMouseCursorPoint(pt);
    // Coordenadas para la barra de estado, en puntos PDF desde la esquina superior izquierda
    setCursorPt({
      x: pt.x * (pageViewport.width / (scale || 1.0)),
      y: pt.y * (pageViewport.height / (scale || 1.0)),
    });

    // Arrastre de un punto de control: forma nueva en vivo (la medida se recalcula al vuelo)
    if (vertexDragRef.current) {
      const drag = vertexDragRef.current;
      drag.hasMoved = true;
      if (drag.caption) {
        // Texto de una distancia o cota (ADR-0097): el puntero fija el desplazamiento respecto de su sitio normal
        const rect = e.currentTarget.getBoundingClientRect();
        const cap = drag.caption;
        const target = { x: e.clientX - rect.left - cap.grab.x, y: e.clientY - rect.top - cap.grab.y };
        // El tirador está sobre el texto, no en su línea base
        const base = { x: target.x - (CAPTION_HANDLE_LIFT_PX * Math.sin(cap.angle)), y: target.y + (CAPTION_HANDLE_LIFT_PX * Math.cos(cap.angle)) };
        const raw = offsetFromPoint(cap.origin, cap.angle, base, cap.pxPerPt);
        // Cerca de su sitio normal el texto "se pega" a él
        const snap = (v: number) => (Math.abs(v) < 2 ? 0 : Math.round(v * 100) / 100);
        drag.latest = {
          ...drag.original,
          customFields: { ...(drag.original.customFields ?? {}), captionOffsetX: snap(raw.along), captionOffsetY: snap(raw.up) },
        };
        setMarkupsTransient([drag.latest]);
        return;
      }
      if (drag.transform) {
        // Tiradores de la caja (ADR-0039): escala (Mayús = proporcional) o rotación (Mayús = pasos de 15°)
        const dims = { width: pageViewport.width / (scale || 1), height: pageViewport.height / (scale || 1) };
        let res: { points: MarkupPoint[]; leaders?: MarkupPoint[][] };
        if (drag.transform.mode === 'scale') {
          const g = drag.transform.grab;
          res = scaleMarkup(drag.original, drag.transform.corner, { x: pt.x - g.x, y: pt.y - g.y }, e.shiftKey);
        } else {
          const b = markupBounds(drag.original)!;
          const now = Math.atan2((pt.y - (b.minY + b.maxY) / 2) * dims.height, (pt.x - (b.minX + b.maxX) / 2) * dims.width);
          res = rotateMarkup(drag.original, snapAngle(now - drag.transform.startAngle, e.shiftKey), dims);
        }
        drag.latest = { ...reshapedMarkup(drag.original, res.points), ...(res.leaders ? { leaders: res.leaders } : {}) };
      } else {
        drag.latest = reshapedMarkup(drag.original, applyControlPointDrag(drag.original, drag.index, pt));
      }
      setMarkupsTransient([drag.latest]);
      return;
    }

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
        const { pointIndex } = anchorDragRef.current;
        const updatedLeaders = target.leaders.map((lead, idx) =>
          idx !== leaderIndex ? lead : pointIndex === 0 ? [clampedPt, ...lead.slice(1)] : [lead[0], clampedPt]
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

        const intersectingIds = pageSpatialIndex.selectInRect(marqueeRect, pageDims);

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

  /** Caja normalizada: la del arrastre o, con un clic, `sizePt` centrado en el punto. */
  const boxFromDragOrDefault = (a: MarkupPoint, b: MarkupPoint, sizePt: { width: number; height: number }): MarkupPoint[] => {
    if (exceedsScreenThreshold(a, b, viewportTransform, 4)) {
      return [
        { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
      ];
    }
    const pw = pageViewport.width / (scale || 1.0);
    const ph = pageViewport.height / (scale || 1.0);
    const w = Math.min(1, sizePt.width / pw);
    const h = Math.min(1, sizePt.height / ph);
    const x = Math.max(0, Math.min(1 - w, b.x - w / 2));
    const y = Math.max(0, Math.min(1 - h, b.y - h / 2));
    return [
      { x, y },
      { x: x + w, y: y + h },
    ];
  };

  /** Crea un enlace (tras el diálogo), un adjunto (tras elegir archivo) o un campo de formulario (ADR-0027). */
  const createInteractiveMarkup = (tool: 'link' | 'fileAttachment' | 'formField', a: MarkupPoint, b: MarkupPoint) => {
    const base = () => {
      const now = new Date().toISOString();
      return { id: uuidv4(), pageIndex: currentPageIndex, author: author || 'Reviewer', createdAt: now, updatedAt: now, status: 'pending' as const, layer: activeLayer };
    };
    if (tool === 'link') {
      setLinkDraft(boxFromDragOrDefault(a, b, { width: 120, height: 24 }));
      return;
    }
    if (tool === 'fileAttachment') {
      const box = boxFromDragOrDefault(a, b, { width: 20, height: 20 });
      void pickAttachmentFile().then((file) => {
        if (!file) return;
        const key = uuidv4();
        useAttachmentStore.getState().putAttachment(key, file);
        const m: Markup = {
          ...base(),
          type: 'fileAttachment',
          points: box,
          text: file.name,
          style: { strokeColor: ATTACHMENT_COLOR, strokeWidth: 1, opacity: 1 },
          customFields: { attachmentKey: key, attachmentName: file.name, attachmentMime: file.mime, attachmentSize: file.bytes.length },
        };
        addMarkup(m);
        setSelectedMarkupIds([m.id]);
      });
      return;
    }
    const type = useToolStore.getState().activeFieldType;
    const def = fieldTypeDef(type);
    const all = useMarkupStore.getState().markups;
    let fieldName = nextFieldName(type, all);
    const extra: Record<string, string | number> = {};
    if (type === 'radio') {
      // Los botones de opción seguidos forman un grupo; cambiar de herramienta empieza otro
      if (!radioGroupRef.current) radioGroupRef.current = { name: fieldName, count: 0 };
      radioGroupRef.current.count += 1;
      fieldName = radioGroupRef.current.name;
      extra.radioValue = `Choice${radioGroupRef.current.count}`;
      extra.fieldValue = 'Off';
    }
    if (type === 'checkbox') extra.fieldValue = 'Off';
    if (type === 'dropdown' || type === 'listbox') extra.fieldOptions = 'Option 1\nOption 2\nOption 3';
    if (type === 'button') extra.buttonCaption = 'Button';
    const m: Markup = {
      ...base(),
      type: 'formField',
      points: boxFromDragOrDefault(a, b, def.size),
      text: fieldName,
      style: { strokeColor: FORM_FIELD_COLOR, strokeWidth: 1, opacity: 1 },
      customFields: { fieldType: type, fieldName, ...extra },
    };
    addMarkup(m);
    setSelectedMarkupIds([m.id]);
    useUiStore.getState().requestPropertiesPanel();
  };

  // Un grupo de botones de opción termina al cambiar de herramienta o de tipo de campo
  useEffect(() => {
    radioGroupRef.current = null;
  }, [activeTool]);

  // Cambiar de herramienta abandona un trazo clic-clic a medias
  const twoClickRef = useRef(false);
  const leaderStageRef = useRef<{ a: MarkupPoint; b: MarkupPoint } | null>(null);
  useEffect(() => {
    if (!twoClickRef.current && !leaderStageRef.current) return;
    twoClickRef.current = false;
    leaderStageRef.current = null;
    setDrawingStart(null);
    setCurrentDrawPoint(null);
  }, [activeTool]);

  // Si se activa un recorte y ya hay un Área o Volumen seleccionada, fijarla como objetivo automáticamente
  useEffect(() => {
    if (activeTool === 'polygonCutout' || activeTool === 'ellipseCutout') {
      const currentTargetId = useUiStore.getState().activeCutoutTargetId;
      if (!currentTargetId) {
        const selected = markups.filter((m) => selectedMarkupIds.includes(m.id));
        const target = selected.find(
          (m) => (m.type === 'area' || m.type === 'volume') && m.pageIndex === currentPageIndex
        );
        if (target) {
          useUiStore.getState().startCutout(target.id);
        }
      }
    }
  }, [activeTool, markups, selectedMarkupIds, currentPageIndex]);

  /** Caja normalizada del sello: la del arrastre o, con un clic, el tamaño por defecto centrado en el punto. */
  const stampBoxFor = (a: MarkupPoint, b: MarkupPoint): MarkupPoint[] => {
    if (exceedsScreenThreshold(a, b, viewportTransform, 4)) {
      return [
        { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
      ];
    }
    const def = stampById(useToolStore.getState().activeStampId);
    const texts = stampTexts(def, author || 'Reviewer', new Date().toISOString());
    const size = stampDefaultSize(def, texts.title, texts.subtitle);
    const pw = pageViewport.width / (scale || 1.0);
    const ph = pageViewport.height / (scale || 1.0);
    const w = Math.min(1, size.width / pw);
    const h = Math.min(1, size.height / ph);
    const x = Math.max(0, Math.min(1 - w, b.x - w / 2));
    const y = Math.max(0, Math.min(1 - h, b.y - h / 2));
    return [
      { x, y },
      { x: x + w, y: y + h },
    ];
  };

  /** Distancia de Acrobat con líneas de referencia (ADR-0033): la medida es a→b; `c` fija el desplazamiento. */
  const createLengthMarkup = (a: MarkupPoint, b: MarkupPoint, c: MarkupPoint) => {
    const dims = { width: pageViewport.width / (scale || 1), height: pageViewport.height / (scale || 1) };
    const measurement = calculateLength([a, b], dims, useCalibrationStore.getState().getEffectiveCalibration(currentPageIndex, [a, b]));
    const { measureLabel, measureCaption } = useToolStore.getState();
    const now = new Date().toISOString();
    const m: Markup = {
      id: uuidv4(),
      type: 'length',
      pageIndex: currentPageIndex,
      points: [a, b, c],
      style: { ...currentStyle, lineEndingStart: 'closedArrow', lineEndingEnd: 'closedArrow' },
      text: measurement.formatted,
      author: author || 'Reviewer',
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      layer: activeLayer,
      customFields: { captionStyle: measureCaption, ...(measureLabel.trim() ? { measureLabel: measureLabel.trim() } : {}) },
      measurement,
    };
    addMarkup(m);
    useToolChestStore.getState().recordRecent(m);
  };

  const latestDrawPoint = currentDrawPoint;
  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    // Herramientas de dos puntos: el punto final es el del propio evento (con snap), sin esperar al render
    const upPoint = TWO_CLICK_TOOLS.has(activeTool) && drawingStart ? getEventPoint(e) : null;
    const currentDrawPoint = upPoint ?? latestDrawPoint;
    // Tercer clic de una distancia con líneas de referencia: la crea con el desplazamiento elegido
    if (upPoint && leaderStageRef.current && activeTool === 'length') {
      const { a, b } = leaderStageRef.current;
      leaderStageRef.current = null;
      createLengthMarkup(a, b, upPoint);
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      return;
    }
    if (upPoint && drawingStart) {
      const moved = exceedsScreenThreshold(drawingStart, upPoint, viewportTransform, 4);
      if (!twoClickRef.current && !moved) {
        // Primer clic sin arrastre: el trazo sigue al cursor hasta el segundo clic
        twoClickRef.current = true;
        setCurrentDrawPoint(upPoint);
        return;
      }
      const wasSecondClick = twoClickRef.current;
      twoClickRef.current = false;
      if (!moved) {
        // Segundo clic en el mismo punto: nada que medir
        setDrawingStart(null);
        setCurrentDrawPoint(null);
        return;
      }
      // Arrastrar crea una distancia rápida de dos puntos; el clic-clic sigue el flujo de Acrobat (ADR-0035)
      if (activeTool === 'length' && wasSecondClick && useToolStore.getState().measureLeaders) {
        // Distancia de Acrobat con líneas de referencia: falta el tercer clic (el desplazamiento)
        leaderStageRef.current = { a: drawingStart, b: upPoint };
        setCurrentDrawPoint(upPoint);
        return;
      }
      setCurrentDrawPoint(upPoint);
    }
    if (vertexDragRef.current) {
      finishVertexDrag();
      return;
    }
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
          screenX: e.clientX,
          screenY: e.clientY,
          dragState: dragStateRef.current,
          viewportTransform,
          thresholdPx: 4,
          pageDimensions: { width: unscaledW, height: unscaledH },
        });
        dragStateRef.current = null;
        if (result.moves && result.moves.length > 0) {
          const { markups: allMarkups } = useMarkupStore.getState();
          const dims = { width: unscaledW, height: unscaledH };
          const calStore = useCalibrationStore.getState();
          const enrichedMoves = result.moves.map((move) => {
            const m = allMarkups.find((it) => it.id === move.id);
            if (!m || !SCALED_MEASURE_TYPES.has(m.type)) return move;
            const prevCal = calStore.getEffectiveCalibration(m.pageIndex, move.originalPoints);
            const nextCal = calStore.getEffectiveCalibration(m.pageIndex, move.newPoints);
            if (JSON.stringify(prevCal) !== JSON.stringify(nextCal)) {
              const remeasured = remeasureMarkup(m, move.newPoints, dims, nextCal, prevCal);
              return {
                ...move,
                originalMeasurement: m.measurement,
                newMeasurement: remeasured.measurement,
                originalText: m.text,
                newText: remeasured.text,
              };
            }
            return move;
          });
          commitMoveMarkups(enrichedMoves);
        } else if (result.restoredMarkups) {
          setMarkupsTransient(result.restoredMarkups);
        }
        return;
      }
    }

    // Modo Nota Adhesiva técnica (A.4: Abre editor contra ancla pendiente sin persistir marca aún)
    if (activeTool === 'stickyNote') {
      const pt = getEventPoint(e);
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
          author: author || 'Reviewer',
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

    // Instantánea / Snapshot (ADR-0085): arrastre = caja a capturar; al soltar ejecuta recorte y revierte a select
    if (activeTool === 'snapshot') {
      if (drawingStart && currentDrawPoint && exceedsScreenThreshold(drawingStart, currentDrawPoint, viewportTransform, 4)) {
        const x = Math.min(drawingStart.x, currentDrawPoint.x);
        const y = Math.min(drawingStart.y, currentDrawPoint.y);
        const width = Math.abs(currentDrawPoint.x - drawingStart.x);
        const height = Math.abs(currentDrawPoint.y - drawingStart.y);
        setSnapshotFlashRect({ x, y, width, height });
        setTimeout(() => setSnapshotFlashRect(null), 300);
        void executeSnapshot({ x, y, width, height }, currentPageIndex);
      } else {
        useToolStore.getState().setActiveTool('select');
      }
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      return;
    }

    // Zoom a Ventana (ADR-0086): arrastre = caja a encuadrar; clic sin arrastre = zoom 1.5x centrado en el punto
    if (activeTool === 'zoom') {
      const el = containerRef.current;
      if (drawingStart && currentDrawPoint && exceedsScreenThreshold(drawingStart, currentDrawPoint, viewportTransform, 5)) {
        if (el) {
          const p1 = normalizedToScreen(drawingStart, viewportTransform);
          const p2 = normalizedToScreen(currentDrawPoint, viewportTransform);
          const boxW = Math.max(1, Math.abs(p2.x - p1.x));
          const boxH = Math.max(1, Math.abs(p2.y - p1.y));
          const clientW = el.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0) || pageViewport.width || 1200;
          const clientH = el.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0) || pageViewport.height || 800;
          const availW = Math.max(50, clientW - 32);
          const availH = Math.max(50, clientH - 32);
          const factor = Math.min(availW / boxW, availH / boxH);
          const currentScale = useDocumentStore.getState().scale;
          const newScale = Math.min(5.0, Math.max(0.1, Math.round(currentScale * factor * 100) / 100));

          const pageEl = pageContainerRef.current;
          const rect = el.getBoundingClientRect();
          const pageRect = pageEl?.getBoundingClientRect();
          const centerXClient = (pageRect ? pageRect.left : rect.left) + (p1.x + p2.x) / 2;
          const centerYClient = (pageRect ? pageRect.top : rect.top) + (p1.y + p2.y) / 2;
          const currentPx = centerXClient - rect.left;
          const currentPy = centerYClient - rect.top;

          zoomAnchorRef.current = {
            rx: (el.scrollLeft + currentPx) / (el.scrollWidth || 1),
            ry: (el.scrollTop + currentPy) / (el.scrollHeight || 1),
            px: el.clientWidth / 2,
            py: el.clientHeight / 2,
          };
          useDocumentStore.getState().setScale(newScale);
        }
      } else {
        zoomAtClientPoint(e.clientX, e.clientY, 1.5);
      }
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      useToolStore.getState().setActiveTool('select');
      return;
    }

    // Enlace, adjunto y campo de formulario (ADR-0027): clic = tamaño por defecto; arrastre = caja
    if (activeTool === 'link' || activeTool === 'fileAttachment' || activeTool === 'formField') {
      if (drawingStart && currentDrawPoint) createInteractiveMarkup(activeTool, drawingStart, currentDrawPoint);
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      return;
    }

    // Secuencia numerada (ADR-0094): cada clic coloca el siguiente número como cuadro de texto centrado
    if (activeTool === 'sequence') {
      if (drawingStart) {
        const pw = Math.max(1, pageViewport.width / (scale || 1));
        const ph = Math.max(1, pageViewport.height / (scale || 1));
        const w = SEQUENCE_BOX_PT.width / pw;
        const h = SEQUENCE_BOX_PT.height / ph;
        const x = Math.max(0, Math.min(1 - w, drawingStart.x - w / 2));
        const y = Math.max(0, Math.min(1 - h, drawingStart.y - h / 2));
        const { text, index } = useToolStore.getState().takeNextSequence();
        const now = new Date().toISOString();
        const id = uuidv4();
        const marker: Markup = {
          id,
          type: 'text',
          pageIndex: currentPageIndex,
          points: [
            { x, y },
            { x: x + w, y: y + h },
          ],
          text,
          style: { ...currentStyle, fillColor: WHITE, strokeWidth: 1.5, opacity: 1 },
          textFormat: { align: 'center', bold: true },
          author: author || 'Reviewer',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: activeLayer,
          subject: 'Sequence',
          customFields: { sequenceIndex: index },
        };
        addMarkup(marker);
        setSelectedMarkupIds([id]);
      }
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      return;
    }

    // Relleno dinámico (ADR-0095): un clic dentro de un recinto crea su medición de área
    if (activeTool === 'dynamicFill') {
      const seed = drawingStart;
      const bytes = useDocumentStore.getState().pdfBytes;
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      if (seed && bytes) {
        void dynamicFillArea({
          pdfBytes: bytes,
          pageIndex: currentPageIndex,
          seed,
          pageDimsPt: { width: pageViewport.width / (scale || 1), height: pageViewport.height / (scale || 1) },
          style: { ...currentStyle },
          author: author || 'Reviewer',
          layer: activeLayer,
          gap: useToolStore.getState().dynamicFillGap,
        }).then((markup) => {
          if (!markup) return;
          addMarkup(markup);
          setSelectedMarkupIds([markup.id]);
        });
      }
      return;
    }

    // Sello (ADR-0026): clic = tamaño por defecto centrado; arrastre = caja del sello
    if (activeTool === 'stamp') {
      if (drawingStart && currentDrawPoint) {
        const box = stampBoxFor(drawingStart, currentDrawPoint);
        const def = stampById(useToolStore.getState().activeStampId);
        const now = new Date().toISOString();
        const texts = stampTexts(def, author || 'Reviewer', now);
        const id = uuidv4();
        const stamp: Markup = {
          id,
          type: 'stamp',
          pageIndex: currentPageIndex,
          points: box,
          text: texts.title,
          style: { strokeColor: def.color, fillColor: STAMP_FILL, strokeWidth: 2, opacity: 1 },
          author: author || 'Reviewer',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: activeLayer,
          customFields: { stampId: def.id, stampSubtitle: texts.subtitle },
        };
        addMarkup(stamp);
        useToolChestStore.getState().recordRecent(stamp);
        setSelectedMarkupIds([id]);
      }
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      return;
    }

    // Finalización de figuras de 2 puntos
    if (!drawingStart || !currentDrawPoint) {
      setDrawingStart(null);
      setCurrentDrawPoint(null);
      return;
    }

    // Nube de forma libre (ADR-0039): un clic sin arrastrar es su primer vértice
    if (isCloudTool(activeTool) && !exceedsScreenThreshold(drawingStart, currentDrawPoint, viewportTransform, 4)) {
      setPolygonPoints([drawingStart]);
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
      (hasExceededThreshold || activeTool === 'typewriter') &&
      activeTool !== 'select' &&
      activeTool !== 'pan' &&
      activeTool !== 'polygon'
    ) {
      const now = new Date().toISOString();

      if (activeTool === 'cloudPlus') {
        createCloudPlus([drawingStart, currentDrawPoint]);
      } else if (activeTool === 'redact') {
        // Redacción (ADR-0103): una caja que luego se aplica con Document ▸ Redaction ▸ Apply Redactions
        const mark = redactionMarkup(currentPageIndex, drawingStart, currentDrawPoint, author || 'Reviewer', activeLayer);
        addMarkup(mark);
        setSelectedMarkupIds([mark.id]);
      } else if (activeTool === 'callout') {
        const newId = uuidv4();
        const initialText = 'Note';
        const unscaledWidth = pageViewport.width / (scale || 1.0);
        const unscaledHeight = pageViewport.height / (scale || 1.0);
        const normSize = estimateCalloutBoxNormalizedSize(
          initialText,
          10,
          unscaledWidth,
          unscaledHeight
        );
        // Como en Revu y Foxit (ADR-0042): se suelta donde va el codo y la caja queda al lado
        const [boxP1, boxP2] = calloutBoxFromDrag(drawingStart, currentDrawPoint, normSize, CALLOUT_LANDING_PT / unscaledWidth);

        const calloutMarkup: Markup = {
          id: newId,
          type: 'callout',
          pageIndex: currentPageIndex,
          points: [boxP1, boxP2],
          leaders: [[{ x: drawingStart.x, y: drawingStart.y }]],
          // Sin caja por defecto (texto suelto, como Revu); con relleno, caja con borde (como Foxit)
          style: {
            ...currentStyle,
            strokeWidth: currentStyle.strokeWidth || 1,
          },
          text: initialText,
          author: author || 'Reviewer',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: activeLayer,
          ...calloutBorderFields(),
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
        const customFields = activeTool === 'cloud' || currentStyle.lineStyle === 'cloud' ? cloudCreationFields() : undefined;

        // Convención canónica min/max para highlightVector (points[0] esquina superior izq, points[1] inferior der)
        const minX = Math.min(drawingStart.x, currentDrawPoint.x);
        const minY = Math.min(drawingStart.y, currentDrawPoint.y);
        const maxX = Math.max(drawingStart.x, currentDrawPoint.x);
        const maxY = Math.max(drawingStart.y, currentDrawPoint.y);
        const isBoxTool =
          activeTool === 'highlightVector' ||
          activeTool === 'underline' ||
          activeTool === 'strikeOut' ||
          activeTool === 'squiggly';
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
            : activeTool === 'length'
            ? // Distancia de Acrobat (ADR-0033): flecha cerrada en ambos extremos (editable después)
              { ...currentStyle, lineEndingStart: 'closedArrow' as const, lineEndingEnd: 'closedArrow' as const }
            : activeTool === 'dimension'
            ? {
                // Cota: flechas cerradas en ambos extremos salvo que la cinta indique otros
                ...currentStyle,
                lineEndingStart:
                  currentStyle.lineEndingStart && currentStyle.lineEndingStart !== 'none'
                    ? currentStyle.lineEndingStart
                    : ('closedArrow' as const),
                lineEndingEnd:
                  currentStyle.lineEndingEnd && currentStyle.lineEndingEnd !== 'none'
                    ? currentStyle.lineEndingEnd
                    : ('closedArrow' as const),
              }
            : activeTool === 'arrow'
            ? {
                // Flecha = línea con punta final: abierta por defecto, como el Arrow de Acrobat (ADR-0032)
                ...currentStyle,
                lineEndingEnd:
                  currentStyle.lineEndingEnd && currentStyle.lineEndingEnd !== 'none'
                    ? currentStyle.lineEndingEnd
                    : ('openArrow' as const),
              }
            : activeTool === 'typewriter'
            ? {
                ...currentStyle,
                strokeWidth: 0,
                strokeColor: 'transparent',
                fillColor: 'transparent',
                fontSize: 12,
              }
            : { ...currentStyle };

        const unscaledW = pageViewport.width / (scale || 1.0);
        const unscaledH = pageViewport.height / (scale || 1.0);
        const pageDimsPt = { width: unscaledW, height: unscaledH };
        const calib = useCalibrationStore.getState().getEffectiveCalibration(currentPageIndex, [drawingStart, currentDrawPoint]);

        const activeCutoutTargetId = useUiStore.getState().activeCutoutTargetId;
        if (activeCutoutTargetId) {
          let cutoutPts: MarkupPoint[] = [drawingStart, currentDrawPoint];
          if (activeTool === 'ellipseCutout') {
            const cx = (drawingStart.x + currentDrawPoint.x) / 2;
            const cy = (drawingStart.y + currentDrawPoint.y) / 2;
            const rx = Math.abs(currentDrawPoint.x - drawingStart.x) / 2;
            const ry = Math.abs(currentDrawPoint.y - drawingStart.y) / 2;
            cutoutPts = [];
            for (let i = 0; i < 48; i++) {
              const th = (2 * Math.PI * i) / 48;
              cutoutPts.push({ x: cx + rx * Math.cos(th), y: cy + ry * Math.sin(th) });
            }
          }
          useMarkupStore.getState().addCutout(activeCutoutTargetId, cutoutPts, pageDimsPt, calib);
          useUiStore.setState({ activeCutoutTargetId: null });
          useToolStore.setState({ activeTool: 'select' });
          setDrawingStart(null);
          setCurrentDrawPoint(null);
          return;
        }

        let measurement: Markup['measurement'];
        let markupText: string | undefined = activeTool === 'text' ? 'Note' : activeTool === 'typewriter' ? '' : undefined;

        if (activeTool === 'length' || activeTool === 'radius' || activeTool === 'diameter') {
          measurement = calculateLength([drawingStart, currentDrawPoint], pageDimsPt, calib);
          markupText = measurement.formatted;
        }

        // Cota (ADR-0020): texto inicial = longitud con la escala de la página (editable al momento)
        let markupPoints = points;
        if (activeTool === 'dimension') {
          markupText = calculateLength([drawingStart, currentDrawPoint], pageDimsPt, calib).formatted;
          const a = { x: drawingStart.x * unscaledW, y: drawingStart.y * unscaledH };
          const b = { x: currentDrawPoint.x * unscaledW, y: currentDrawPoint.y * unscaledH };
          const c = defaultDimensionLinePoint(a, b, DIMENSION_DEFAULT_OFFSET_PT);
          markupPoints = [drawingStart, currentDrawPoint, { x: c.x / unscaledW, y: c.y / unscaledH }];
        } else if (activeTool === 'typewriter') {
          const wPt = Math.abs(currentDrawPoint.x - drawingStart.x) * unscaledW;
          const hPt = Math.abs(currentDrawPoint.y - drawingStart.y) * unscaledH;
          if (wPt < 8 && hPt < 8) {
            markupPoints = [
              drawingStart,
              { x: drawingStart.x + 120 / unscaledW, y: drawingStart.y + 24 / unscaledH },
            ];
          }
        }

        const { subject: toolSubject, unitPrice: toolUnitPrice, layer: toolLayer, cost } =
          getActiveToolChestMetadata(activeTool, measurement?.value ?? 1, activeLayer);

        const newMarkup: Markup = {
          id: newId,
          type: (activeTool === 'arrow' ? 'line' : activeTool) as MarkupType,
          pageIndex: currentPageIndex,
          points: markupPoints,
          style: markupStyle,
          text: markupText,
          author: author || 'Reviewer',
          createdAt: now,
          updatedAt: now,
          status: 'pending',
          layer: toolLayer,
          subject: toolSubject,
          unitPrice: toolUnitPrice,
          cost,
          customFields: {
            ...((activeTool === 'length' || activeTool === 'radius' || activeTool === 'diameter') &&
            useToolStore.getState().measureLabel.trim()
              ? { ...(customFields ?? {}), measureLabel: useToolStore.getState().measureLabel.trim() }
              : customFields),
            // Distancia: dónde va el valor ("Caption Style" de Acrobat, ADR-0032)
            ...(activeTool === 'length' ? { captionStyle: useToolStore.getState().measureCaption } : {}),
            // Autosize Text de Revu en los cuadros de texto nuevos (ADR-0061)
            ...(activeTool === 'text' && useToolStore.getState().autoSizeText ? { autoSizeText: 1 } : {}),
          },
          measurement,
        };
        if (newMarkup.customFields && Object.keys(newMarkup.customFields).length === 0) delete newMarkup.customFields;

        addMarkup(newMarkup);
        useToolChestStore.getState().recordRecent(newMarkup);

        // La cota queda lista para escribir su texto (como en Revu)
        if (activeTool === 'dimension') {
          setSelectedMarkupIds([newId]);
          setInlineEditing({
            markupId: newId,
            initialText: markupText ?? '',
            position: markupPoints[2],
          });
        }

        // Si es una marca de texto o máquina de escribir, seleccionarla y abrir inmediatamente el editor inline
        if (activeTool === 'text' || activeTool === 'typewriter') {
          setSelectedMarkupIds([newId]);
          setInlineEditing({
            markupId: newId,
            initialText: activeTool === 'typewriter' ? '' : 'Note',
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
    if (isMultiPointTool(activeTool) || (isCloudTool(activeTool) && polygonPoints.length > 0)) {
      // El doble clic dispara antes dos mousedown en el mismo punto: se descartan vértices repetidos
      finalizeMultiPoint(dedupeConsecutivePoints(polygonPoints));
      return;
    }

    // Doble clic sobre texto, callout o nota adhesiva existente para editar inline
    const pt = getEventPoint(e);

    // Enlaces, adjuntos y campos (ADR-0027): seguir, guardar o rellenar
    {
      const dims = { width: pageViewport.width / (scale || 1.0), height: pageViewport.height / (scale || 1.0) };
      const interactive = [...markups]
        .filter((m) => m.pageIndex === currentPageIndex && isMarkupVisible(m))
        .reverse()
        .find(
          (m) =>
            (m.type === 'link' || m.type === 'fileAttachment' || m.type === 'formField') &&
            hitTestMarkup(pt, m, 0.005, dims)
        );
      if (interactive?.type === 'link') {
        followMarkupLink(interactive);
        return;
      }
      if (interactive?.type === 'fileAttachment') {
        const file = useAttachmentStore.getState().getAttachment(String(interactive.customFields?.attachmentKey ?? ''));
        if (file) void saveAttachment(file);
        else showToast('The attached file is not available in this document.');
        return;
      }
      if (interactive?.type === 'formField' && !interactive.locked) {
        const ft = fieldTypeOf(interactive);
        const { applyPropertiesToMarkups } = useMarkupStore.getState();
        if (ft === 'checkbox') {
          const next = interactive.customFields?.fieldValue === 'Yes' ? 'Off' : 'Yes';
          applyPropertiesToMarkups([interactive.id], { customFields: { fieldValue: next } }, `Set ${String(interactive.customFields?.fieldName)} to ${next}`);
          return;
        }
        if (ft === 'radio') {
          const group = String(interactive.customFields?.fieldName ?? '');
          const others = markups
            .filter((m) => m.type === 'formField' && m.id !== interactive.id && fieldTypeOf(m) === 'radio' && m.customFields?.fieldName === group)
            .map((m) => m.id);
          if (others.length) applyPropertiesToMarkups(others, { customFields: { fieldValue: 'Off' } }, `Clear ${group}`);
          applyPropertiesToMarkups([interactive.id], { customFields: { fieldValue: 'Yes' } }, `Select ${String(interactive.customFields?.radioValue)}`);
          return;
        }
        if (ft === 'text') {
          setInlineEditing({
            markupId: interactive.id,
            initialText: String(interactive.customFields?.fieldValue ?? ''),
            position: interactive.points[0],
          });
          return;
        }
        // Listas, desplegables, botones y firma: se editan en Propiedades
        setSelectedMarkupIds([interactive.id]);
        useUiStore.getState().requestPropertiesPanel();
        return;
      }
    }
    const hit = pageSpatialIndex.hitTest(pt, 0.015, pageDims);

    if (
      hit &&
      (hit.type === 'text' ||
        hit.type === 'typewriter' ||
        hit.type === 'callout' ||
        hit.type === 'stickyNote')
    ) {
      setInlineEditing({
        markupId: hit.id,
        initialText: hit.text || '',
        position: hit.points[0],
        isStickyNote: hit.type === 'stickyNote',
        initialColor: hit.style?.fillColor,
      });
      return;
    }

    // Doble clic en el plano (sin marca debajo): control de zoom en ese punto, como en Revu
    if (activeTool === 'select' || activeTool === 'pan') {
      const anyHit = Boolean(pageSpatialIndex.hitTest(pt, 0.015, pageDims));
      if (!anyHit) setZoomWidget({ x: e.clientX, y: e.clientY });
    }
  };

  const handleAnchorMouseDown = (
    e: React.MouseEvent<SVGCircleElement>,
    markupId: string,
    leaderIndex: number,
    pointIndex = 0
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const target = markupsRef.current.find((m) => m.id === markupId);
    if (!target || !target.leaders) return;

    anchorDragRef.current = {
      markupId,
      leaderIndex,
      pointIndex,
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
        activeTool === 'strikeOut' ||
        activeTool === 'squiggly') &&
      pageHasText[currentPageIndex] === false
    ) {
      showToast(
        'This page has no selectable text layer. You can draw the markup manually.'
      );
    }
  };

  const handleTextSelectionMouseUp = () => {
    if (
      activeTool !== 'highlightText' &&
      activeTool !== 'underline' &&
      activeTool !== 'strikeOut' &&
      activeTool !== 'squiggly'
    ) {
      return;
    }

    if (pageHasText[currentPageIndex] === false) {
      showToast(
        'This page has no selectable text layer. You can draw the markup manually.'
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
              strokeColor: currentStyle.strokeColor || DEFAULT_MARKUP_COLOR,
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
        author: author || 'Reviewer',
        createdAt: now,
        updatedAt: now,
        status: 'pending',
        layer: activeLayer,
      };
    });

    const actionDesc =
      activeTool === 'underline'
        ? `Underline text (${newMarkups.length} lines)`
        : activeTool === 'squiggly'
        ? `Squiggly text (${newMarkups.length} lines)`
        : activeTool === 'strikeOut'
        ? `Strike out text (${newMarkups.length} lines)`
        : `Highlight text (${newMarkups.length} lines)`;

    addMarkups(
      newMarkups,
      newMarkups.length > 1 ? actionDesc : actionDesc.replace(/ \(\d+ lines\)/, '')
    );
    if (newMarkups.length > 0) {
      useToolChestStore.getState().recordRecent(newMarkups[0]);
    }
    setSelectedMarkupIds(newMarkups.map((m) => m.id));

    selection.removeAllRanges();
  };

  // Culling de viewport para planos con densidad masiva de anotaciones (> 150 marcas) (ADR-0089)
  // Soporta con exactitud milimétrica tanto la vista de página única como la vista continua multi-página
  const renderedMarkups = useMemo(() => {
    if (pageMarkups.length <= 150) {
      return pageMarkups;
    }
    const container = containerRef.current;
    const pageEl = pageContainerRef.current;
    if (!container || !pageEl || !pageDims) return pageMarkups;

    const cRect = container.getBoundingClientRect();
    const pRect = pageEl.getBoundingClientRect();
    if (pRect.width <= 0 || pRect.height <= 0) return pageMarkups;

    // Intersección en píxeles del viewport del contenedor sobre la lámina activa
    const viewLeft = Math.max(0, cRect.left - pRect.left);
    const viewTop = Math.max(0, cRect.top - pRect.top);
    const viewRight = Math.min(pRect.width, cRect.right - pRect.left);
    const viewBottom = Math.min(pRect.height, cRect.bottom - pRect.top);

    if (viewRight <= viewLeft || viewBottom <= viewTop) {
      // La página está completamente fuera del viewport en vista continua: conserva solo marcas seleccionadas
      if (selectedMarkupIds.length === 0) return [];
      const selSet = new Set(selectedMarkupIds);
      return pageMarkups.filter((m) => selSet.has(m.id));
    }

    // Margen de sobreexploración (overscan) del 20%
    const margin = 0.20;
    const normX0 = Math.max(0, (viewLeft / pRect.width) - margin);
    const normY0 = Math.max(0, (viewTop / pRect.height) - margin);
    const normW = Math.min(1 - normX0, ((viewRight - viewLeft) / pRect.width) + 2 * margin);
    const normH = Math.min(1 - normY0, ((viewBottom - viewTop) / pRect.height) + 2 * margin);

    const visibleRect: BoundingBox = {
      x: normX0,
      y: normY0,
      width: Math.max(0.01, normW),
      height: Math.max(0.01, normH),
    };

    const candidates = pageSpatialIndex.queryRect(visibleRect);
    const candidateSet = new Set(candidates.map((m) => m.id));

    // Las marcas seleccionadas NUNCA se descartan para que sus handles y bounding boxes no desaparezcan
    for (const selId of selectedMarkupIds) {
      candidateSet.add(selId);
    }

    return pageMarkups.filter((m) => candidateSet.has(m.id));
  }, [pageMarkups, pageSpatialIndex, pageDims, scrollPos, selectedMarkupIds]);

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

    const pageEl = pageContainerRef.current;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    void import('./viewer/toolDropPlacement').then(({ placeDroppedTool }) => {
      placeDroppedTool({
        rawData,
        screenX,
        screenY,
        viewportTransform,
        pageViewport,
        scale,
        currentPageIndex,
        activeLayer,
        author,
        addMarkup,
        setSelectedMarkupIds,
      });
    });
  };

  // Capas interactivas de la página activa: texto seleccionable, editor inline y overlay SVG de marcas
  const activeOverlay = (
    <>
          {/* TextLayer de PDF.js 4.x */}
          <div
            ref={setTextLayerRef}
            data-testid="pdf-text-layer"
            className="textLayer"
            style={{
              width: `${pageViewport.width}px`,
              height: `${pageViewport.height}px`,
              '--scale-factor': scale || 1.0,
              pointerEvents:
                activeTool === 'highlightText' ||
                activeTool === 'underline' ||
                activeTool === 'strikeOut' ||
                activeTool === 'squiggly'
                  ? 'auto'
                  : 'none',
            } as React.CSSProperties}
            onMouseUp={handleTextSelectionMouseUp}
            onClick={handleTextLayerClick}
          />

          {/* Editor inline genérico para texto y notas (B6 y A.4) */}
          {inlineEditing && (
            <Suspense fallback={null}>
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
                    author: author || 'Reviewer',
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
                if (targetMarkup?.type === 'formField') {
                  if (String(targetMarkup.customFields?.fieldValue ?? '') !== newText) {
                    useMarkupStore
                      .getState()
                      .applyPropertiesToMarkups([targetMarkup.id], { customFields: { fieldValue: newText } }, 'Fill text field');
                  }
                  setInlineEditing(null);
                  return;
                }
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
                    // Con Autosize Text (ADR-0061) la caja se queda y el texto se ajusta a ella
                    if (isAutosizeText(targetMarkup)) {
                      updateMarkup(targetMarkup.id, { text: newText });
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
                    if (targetMarkup.type === 'typewriter' && !newText.trim()) {
                      useMarkupStore.getState().deleteMarkup(targetMarkup.id);
                      setInlineEditing(null);
                      return;
                    }
                    if (targetMarkup.text === newText) {
                      setInlineEditing(null);
                      return;
                    }
                    updateMarkup(targetMarkup.id, { text: newText });
                  }
                }
                setInlineEditing(null);
              }}
              onCancel={() => {
                if (inlineEditing) {
                  const tm = markups.find((m) => m.id === inlineEditing.markupId);
                  if (tm?.type === 'typewriter' && !tm.text?.trim()) {
                    useMarkupStore.getState().deleteMarkup(tm.id);
                  }
                }
                setInlineEditing(null);
              }}
            />
          </Suspense>
        )}

          {/* Overlay interactivo SVG para anotaciones */}
          <svg
            data-testid="markup-overlay-svg"
            width={pageViewport.width}
            height={pageViewport.height}
            viewBox={`0 0 ${pageViewport.width} ${pageViewport.height}`}
            style={{ width: `${pageViewport.width}px`, height: `${pageViewport.height}px` }}
            // select-none (ADR-0032): el texto de las mediciones no debe iniciar una selección del navegador, que al
            // arrastrar cerca del borde desplaza el visor y movería el punto final
            className={`absolute inset-0 w-full h-full select-none ${
              activeTool === 'highlightText' ||
              activeTool === 'underline' ||
              activeTool === 'strikeOut' ||
              activeTool === 'squiggly'
                ? 'pointer-events-none'
                : activeTool === 'select'
                ? 'cursor-rea-select'
                : activeTool === 'pan'
                ? panning
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : activeTool === 'snapshot'
                ? 'cursor-crosshair'
                : activeTool === 'zoom'
                ? 'cursor-zoom-in'
                : 'cursor-rea-draw'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setCursorPt(null);
              setSnapIndicator(null);
            }}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Viewports regionales de la página (ADR-0076) */}
            {currentPageViewports.map((vp) => {
              const vx = vp.bounds.x * viewportTransform.width;
              const vy = vp.bounds.y * viewportTransform.height;
              const vw = vp.bounds.width * viewportTransform.width;
              const vh = vp.bounds.height * viewportTransform.height;
              const r = vp.calibration.ratio;
              const calLabel = r
                ? `${r.paperValue} ${r.paperUnit} = ${r.realValue} ${r.realUnit}`
                : `${vp.calibration.scale.toFixed(2)} ${vp.calibration.unit}`;
              return (
                <g key={vp.id} data-testid={`viewport-overlay-${vp.id}`} pointerEvents="none">
                  <rect
                    x={vx}
                    y={vy}
                    width={vw}
                    height={vh}
                    fill={tok('cad-accent', 0.08)}
                    stroke={tok('cad-accent')}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <rect
                    x={vx}
                    y={vy}
                    width={Math.min(vw, Math.max(70, (vp.name.length + calLabel.length + 4) * 6.5))}
                    height={18}
                    fill={tok('cad-accent')}
                    fillOpacity={0.85}
                  />
                  <text
                    x={vx + 4}
                    y={vy + 13}
                    fill={tok('ov-handle')}
                    fontSize={11}
                    fontWeight="500"
                    fontFamily="sans-serif"
                  >
                    {vp.name} ({calLabel})
                  </text>
                </g>
              );
            })}

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
                    fill={isActive ? tok('ov-find-active', 0.45) : tok('ov-find', 0.35)}
                    stroke={isActive ? tok('ov-find-active-edge') : tok('ov-find-edge')}
                    strokeWidth={isActive ? 1.5 : 1}
                    className="pointer-events-none"
                  />
                );
              });
            })}

            {/* Anotaciones guardadas en la página actual (con culling de viewport en conjuntos grandes) */}
            {renderedMarkups.map((markup) => {
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
                    // Count de Revu (ADR-0063): cada símbolo con su propio recuadro, no una caja que los englobe
                    if (markup.type === 'count' && markup.customFields?.countSymbol) {
                      const half = (countSymbolSizePt(markup) * (scale || 1)) / 2 + 3;
                      return (
                        <g data-testid="selection-count-items" className="pointer-events-none">
                          {markup.points.map((pt, i) => {
                            const c = normalizedToScreen(pt, viewportTransform);
                            return (
                              <rect
                                key={i}
                                data-testid="selection-bbox"
                                x={c.x - half}
                                y={c.y - half}
                                width={half * 2}
                                height={half * 2}
                                fill="none"
                                stroke={markup.locked ? tok('ov-warn') : tok('cad-accent')}
                                strokeWidth={1}
                                strokeDasharray="3 2"
                              />
                            );
                          })}
                        </g>
                      );
                    }
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
                      // La caja rodea todo el dibujo (lóbulos de nube, patrones) con margen, como en Revu (ADR-0041)
                      const pad = markup.type === 'stickyNote' ? 4 : SELECTION_GAP_PX + visualOverhangPt(markup) * (scale || 1);
                      return (
                        <rect
                          data-testid="selection-bbox"
                          x={b.minX - pad}
                          y={b.minY - pad}
                          width={Math.max(8, b.maxX - b.minX + pad * 2)}
                          height={Math.max(8, b.maxY - b.minY + pad * 2)}
                          fill="none"
                          stroke={markup.locked ? tok('ov-warn') : tok('cad-accent')}
                          strokeWidth={1}
                          strokeDasharray="3 2"
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
                            r={3.5}
                            fill={tok('ov-handle')}
                            stroke={tok('ov-handle-edge')}
                            strokeWidth={1}
                            className="cursor-move"
                            onMouseDown={(e) => handleAnchorMouseDown(e, markup.id, lIdx)}
                            onContextMenu={(e) => handleAnchorContextMenu(e, markup.id, lIdx)}
                          />
                        );
                      })}

                      {/* Codo de cada directriz (ADR-0042): círculo amarillo como en Revu; arrastrarlo alarga o acorta el
                          tramo horizontal hasta la caja */}
                      {getCalloutGeometryFromMarkup(markup, viewportTransform).leaders.map((lg, lIdx) =>
                        markup.leaders?.[lIdx] ? (
                          <circle
                            key={`callout-knee-${markup.id}-${lIdx}`}
                            data-testid={`callout-knee-handle-${lIdx}`}
                            cx={lg.elbow.x}
                            cy={lg.elbow.y}
                            r={3.5}
                            fill={tok('ov-handle')}
                            stroke={tok('ov-handle-edge')}
                            strokeWidth={1}
                            className="cursor-ew-resize"
                            onMouseDown={(e) => handleAnchorMouseDown(e, markup.id, lIdx, 1)}
                          />
                        ) : null
                      )}

                      {/* Tirador para añadir directriz (+) */}
                      {(() => {
                        const p1Scr = normalizedToScreen(markup.points[0], viewportTransform);
                        const p2Scr = normalizedToScreen(markup.points[1], viewportTransform);
                        const boxRight = Math.max(p1Scr.x, p2Scr.x);
                        const boxTop = Math.min(p1Scr.y, p2Scr.y);
                        // Separado del tirador de la esquina de la caja (ADR-0042)
                        const addX = boxRight + 20;
                        const addY = boxTop - 4;
                        return (
                          <g
                            data-testid="callout-add-leader-handle"
                            className="cursor-pointer"
                            onClick={(e) => handleAddLeader(e, markup.id)}
                          >
                            <circle cx={addX} cy={addY} r={5.5} fill={tok('cad-accent')} stroke={tok('ov-halo')} strokeWidth={1} />
                            <text
                              x={addX}
                              y={addY + 3.5}
                              textAnchor="middle"
                              fill={tok('ov-halo')}
                              fontSize="10"
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

            {/* Puntos de control (ADR-0021): capa propia. Edita una marca suelta o la nube de un único grupo
                seleccionado (Cloud+: la llamada queda fija, ADR-0069); nunca sobre marcas bloqueadas */}
            {activeTool === 'select' &&
              (() => {
                const markup = editableControlPointTarget(markups.filter((m) => selectedMarkupIds.includes(m.id)));
                if (!markup || markup.locked) return null;
                const cps = controlPointsOf(markup);
                if (!cps) return null;
                return (
                  <g data-testid="control-points-layer">
                    {(markup.type === 'length' || markup.type === 'dimension') &&
                      (() => {
                        const frame = measureCaptionFrame(markup, viewportTransform);
                        if (!frame) return null;
                        const at = captionHandlePosition(markup, frame);
                        return (
                          <rect
                            key={`cap-${markup.id}`}
                            data-testid="caption-handle"
                            x={at.x - 4}
                            y={at.y - 4}
                            width={8}
                            height={8}
                            transform={`rotate(45 ${at.x} ${at.y})`}
                            fill={tok('ov-handle')}
                            stroke={tok('ov-handle-edge')}
                            strokeWidth={1}
                            className="cursor-move"
                            onMouseDown={(e) => handleCaptionMouseDown(e, markup)}
                          >
                            <title>Drag to move the value text away from the line</title>
                          </rect>
                        );
                      })()}
                    {cps.map((cp, idx) => {
                      const scr = normalizedToScreen(cp, viewportTransform);
                      if (controlPointShape(markup, idx) === 'square') {
                        return (
                          <rect
                            key={`cp-${markup.id}-${idx}`}
                            data-testid={`control-point-${idx}`}
                            x={scr.x - 3}
                            y={scr.y - 3}
                            width={6}
                            height={6}
                            fill={tok('ov-handle')}
                            stroke={tok('ov-handle-edge')}
                            strokeWidth={1}
                            className={idx % 2 === 0 ? 'cursor-ns-resize' : 'cursor-ew-resize'}
                            onMouseDown={(e) => handleControlPointMouseDown(e, markup, idx)}
                          />
                        );
                      }
                      return (
                        <circle
                          key={`cp-${markup.id}-${idx}`}
                          data-testid={`control-point-${idx}`}
                          cx={scr.x}
                          cy={scr.y}
                          r={3.5}
                          // Los del conteo, verdes como en Revu (ADR-0063)
                          fill={markup.type === 'count' ? tok('ov-count') : tok('ov-handle')}
                          stroke={tok('ov-handle-edge')}
                          strokeWidth={1}
                          className="cursor-crosshair"
                          onMouseDown={(e) => handleControlPointMouseDown(e, markup, idx)}
                        />
                      );
                    })}
                  </g>
                );
              })()}

            {/* Tiradores de la caja (ADR-0039): cuadros azules en las esquinas para escalar y círculo para rotar */}
            {activeTool === 'select' &&
              selectedMarkupIds.length === 1 &&
              (() => {
                const markup = pageMarkups.find((m) => m.id === selectedMarkupIds[0]);
                if (!markup || markup.locked || !canScale(markup)) return null;
                const bounds = markupBounds(markup);
                if (!bounds) return null;
                const pad = SELECTION_GAP_PX + visualOverhangPt(markup) * (scale || 1);
                const tl = normalizedToScreen({ x: bounds.minX, y: bounds.minY }, viewportTransform);
                const br = normalizedToScreen({ x: bounds.maxX, y: bounds.maxY }, viewportTransform);
                const box = { x0: tl.x - pad, y0: tl.y - pad, x1: br.x + pad, y1: br.y + pad };
                const corners = boundsCorners({ minX: box.x0, minY: box.y0, maxX: box.x1, maxY: box.y1 });
                const cursors = ['cursor-nwse-resize', 'cursor-nesw-resize', 'cursor-nwse-resize', 'cursor-nesw-resize'];
                const cx = (box.x0 + box.x1) / 2;
                return (
                  <g data-testid="transform-handles-layer">
                    {corners.map((c, i) => (
                      <rect
                        key={`sh-${i}`}
                        data-testid={`scale-handle-${i}`}
                        x={c.x - 3.5}
                        y={c.y - 3.5}
                        width={7}
                        height={7}
                        fill={tok('cad-accent')}
                        stroke={tok('ov-handle-sel-edge')}
                        strokeWidth={1}
                        className={cursors[i]}
                        onMouseDown={(e) => handleTransformMouseDown(e, markup, 'scale', i)}
                      />
                    ))}
                    {canRotate(markup) && (
                      <>
                        <line x1={cx} y1={box.y0} x2={cx} y2={box.y0 - 18} stroke={tok('cad-accent')} strokeWidth={1} strokeDasharray="2 2" className="pointer-events-none" />
                        <circle
                          data-testid="rotate-handle"
                          cx={cx}
                          cy={box.y0 - 22}
                          r={4}
                          fill={tok('cad-accent')}
                          stroke={tok('ov-handle-sel-edge')}
                          strokeWidth={1}
                          className="cursor-grab"
                          onMouseDown={(e) => handleTransformMouseDown(e, markup, 'rotate')}
                        />
                      </>
                    )}
                  </g>
                );
              })()}

            {/* Puntos de la alineación de Overlay Pages (ADR-0050): numerados, del color de su página */}
            {overlayActive && overlayAlign.picking && (
              <g data-testid="overlay-align-points" className="pointer-events-none">
                {[
                  ...overlayAlign.base.map((p, i) => ({ p, i, color: overlayBaseColor })),
                  ...overlayAlign.other.map((o, i) => ({
                    p: applyAffine(overlayMatrix, overlayOffset, o),
                    i,
                    color: overlayOtherColor,
                  })),
                ].map(({ p, i, color }, k) => {
                  const x = p.x * (scale || 1);
                  const y = p.y * (scale || 1);
                  return (
                    <g key={k}>
                      <circle cx={x} cy={y} r={7} fill="none" stroke={tok('ov-halo')} strokeWidth={3} />
                      <circle cx={x} cy={y} r={7} fill="none" stroke={color} strokeWidth={1.5} />
                      <path d={`M ${x - 11} ${y} H ${x - 4} M ${x + 4} ${y} H ${x + 11} M ${x} ${y - 11} V ${y - 4} M ${x} ${y + 4} V ${y + 11}`} stroke={color} strokeWidth={1.2} />
                      <text x={x + 9} y={y - 9} fontSize={11} fontWeight="bold" fill={color} stroke={tok('ov-halo')} strokeWidth={3} paintOrder="stroke">
                        {i + 1}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

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
                      author: author || 'Reviewer',
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
            {(isMultiPointTool(activeTool) || isCloudTool(activeTool)) && polygonPoints.length > 0 && (
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
                      ? tok('ov-preview', 0.1)
                      : activeTool === 'area'
                      ? tok('ov-preview', 0.18)
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
                        idx === 0 && isClosedMultiPointTool(activeTool)
                          ? tok('ov-close')
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

                  if (activeTool === 'snapshot') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <rect
                        data-testid="snapshot-marquee"
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        stroke={tok('cad-accent')}
                        strokeWidth={1.5}
                        fill={tok('cad-accent', 0.15)}
                        strokeDasharray="4 3"
                      />
                    );
                  }

                  if (activeTool === 'zoom') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <rect
                        data-testid="zoom-marquee"
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        stroke={tok('cad-accent')}
                        strokeWidth={1.5}
                        fill={tok('cad-accent', 0.12)}
                        strokeDasharray="4 3"
                      />
                    );
                  }

                  if (activeTool === 'rectangle' || activeTool === 'redact') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        stroke={currentStyle.strokeColor}
                        strokeWidth={currentStyle.strokeWidth}
                        fill={tok('ov-preview', 0.15)}
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
                        fill={tok('ov-preview', 0.15)}
                        strokeDasharray="4 2"
                      />
                    );
                  }

                  if (activeTool === 'line' || activeTool === 'arrow') {
                    // Vista previa idéntica al resultado: tipo de línea y extremos reales (ADR-0018)
                    const previewStyle =
                      activeTool === 'arrow' &&
                      (!currentStyle.lineEndingEnd || currentStyle.lineEndingEnd === 'none')
                        ? { ...currentStyle, lineEndingEnd: 'openArrow' as const }
                        : currentStyle;
                    const previewMarkup: Markup = {
                      id: 'preview-line',
                      type: 'line',
                      pageIndex: currentPageIndex,
                      points: [drawingStart, currentDrawPoint],
                      style: previewStyle,
                      author: '',
                      createdAt: '',
                      updatedAt: '',
                      status: 'pending',
                    };
                    return (
                      <g className="pointer-events-none" opacity={0.85}>
                        {renderSvgDescriptor(getMarkupSvgDescriptor(previewMarkup, viewportTransform), 'preview-line')}
                      </g>
                    );
                  }

                  if (activeTool === 'link' || activeTool === 'formField' || activeTool === 'fileAttachment') {
                    const r = getRectGeometry(p1, p2);
                    return (
                      <rect
                        data-testid="interactive-box-preview"
                        x={r.x}
                        y={r.y}
                        width={r.width}
                        height={r.height}
                        fill={tok('ov-preview', 0.08)}
                        stroke={tok('ov-preview')}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                    );
                  }

                  if (activeTool === 'stamp') {
                    const def = stampById(useToolStore.getState().activeStampId);
                    const texts = stampTexts(def, author || 'Reviewer', new Date().toISOString());
                    const previewStamp: Markup = {
                      id: 'preview-stamp',
                      type: 'stamp',
                      pageIndex: currentPageIndex,
                      points: stampBoxFor(drawingStart, currentDrawPoint),
                      text: texts.title,
                      style: { strokeColor: def.color, strokeWidth: 2, opacity: 1 },
                      customFields: { stampId: def.id, stampSubtitle: texts.subtitle },
                      author: '',
                      createdAt: '',
                      updatedAt: '',
                      status: 'pending',
                    };
                    return (
                      <g opacity={0.7}>
                        {renderSvgDescriptor(getMarkupSvgDescriptor(previewStamp, viewportTransform), 'preview-stamp')}
                      </g>
                    );
                  }

                  if (activeTool === 'dimension') {
                    const pw = pageViewport.width / (scale || 1.0);
                    const ph = pageViewport.height / (scale || 1.0);
                    const a = { x: drawingStart.x * pw, y: drawingStart.y * ph };
                    const b = { x: currentDrawPoint.x * pw, y: currentDrawPoint.y * ph };
                    const c = defaultDimensionLinePoint(a, b, DIMENSION_DEFAULT_OFFSET_PT);
                    const calib = useCalibrationStore.getState().getEffectiveCalibration(currentPageIndex, [drawingStart, currentDrawPoint]);
                    const previewMarkup: Markup = {
                      id: 'preview-dimension',
                      type: 'dimension',
                      pageIndex: currentPageIndex,
                      points: [drawingStart, currentDrawPoint, { x: c.x / pw, y: c.y / ph }],
                      style: {
                        ...currentStyle,
                        lineEndingStart:
                          currentStyle.lineEndingStart && currentStyle.lineEndingStart !== 'none'
                            ? currentStyle.lineEndingStart
                            : 'closedArrow',
                        lineEndingEnd:
                          currentStyle.lineEndingEnd && currentStyle.lineEndingEnd !== 'none'
                            ? currentStyle.lineEndingEnd
                            : 'closedArrow',
                      },
                      text: calculateLength([drawingStart, currentDrawPoint], { width: pw, height: ph }, calib).formatted,
                      author: '',
                      createdAt: '',
                      updatedAt: '',
                      status: 'pending',
                    };
                    return (
                      <g opacity={0.85}>
                        {renderSvgDescriptor(getMarkupSvgDescriptor(previewMarkup, viewportTransform), 'preview-dimension')}
                      </g>
                    );
                  }

                  if (activeTool === 'radius' || activeTool === 'diameter') {
                    const previewMarkup: Markup = {
                      id: `preview-${activeTool}`,
                      type: activeTool,
                      pageIndex: currentPageIndex,
                      points: [drawingStart, currentDrawPoint],
                      style: currentStyle,
                      author: '',
                      createdAt: '',
                      updatedAt: '',
                      status: 'pending',
                    };
                    return (
                      <g opacity={0.85}>{renderSvgDescriptor(getMarkupSvgDescriptor(previewMarkup, viewportTransform), `preview-${activeTool}`)}</g>
                    );
                  }

                  if (activeTool === 'length') {
                    // Vista previa idéntica al resultado (ADR-0032): flechas abiertas y el valor en vivo
                    const dimsPt = { width: pageViewport.width / (scale || 1), height: pageViewport.height / (scale || 1) };
                    const lengthPts = leaderStageRef.current ? [leaderStageRef.current.a, leaderStageRef.current.b] : [drawingStart, currentDrawPoint];
                    const live = calculateLength(
                      lengthPts,
                      dimsPt,
                      useCalibrationStore.getState().getEffectiveCalibration(currentPageIndex, lengthPts)
                    );
                    const stage = leaderStageRef.current;
                    const previewMarkup: Markup = {
                      id: 'preview-length',
                      type: 'length',
                      pageIndex: currentPageIndex,
                      points: stage ? [stage.a, stage.b, currentDrawPoint] : [drawingStart, currentDrawPoint],
                      // Mientras se mide, como Acrobat (ADR-0035): guías sin flechas y el valor junto a la línea
                      style: { ...currentStyle, lineEndingStart: 'none', lineEndingEnd: 'none' },
                      measurement: live,
                      customFields: { captionStyle: 'top' },
                      author: '',
                      createdAt: '',
                      updatedAt: '',
                      status: 'pending',
                    };
                    return (
                      <g className="pointer-events-none" opacity={0.85}>
                        {renderSvgDescriptor(getMarkupSvgDescriptor(previewMarkup, viewportTransform), 'preview-length')}
                      </g>
                    );
                  }

                  if (activeTool === 'calibrate') {
                    return (
                      <g>
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke={activeTool === 'calibrate' ? tok('ov-warn') : currentStyle.strokeColor}
                          strokeWidth={currentStyle.strokeWidth || 2}
                          strokeDasharray="4 2"
                        />
                        <circle
                          cx={p1.x}
                          cy={p1.y}
                          r={3}
                          fill={activeTool === 'calibrate' ? tok('ov-warn') : currentStyle.strokeColor}
                        />
                        <circle
                          cx={p2.x}
                          cy={p2.y}
                          r={3}
                          fill={activeTool === 'calibrate' ? tok('ov-warn') : currentStyle.strokeColor}
                        />
                      </g>
                    );
                  }

                  if (activeTool === 'underline' || activeTool === 'squiggly') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <line
                        x1={rect.x}
                        y1={rect.y + rect.height}
                        x2={rect.x + rect.width}
                        y2={rect.y + rect.height}
                        stroke={currentStyle.strokeColor || DEFAULT_MARKUP_COLOR}
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
                        stroke={currentStyle.strokeColor || DEFAULT_MARKUP_COLOR}
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
                        stroke={tok('ov-find-edge')}
                        strokeWidth={1}
                        strokeDasharray="4 2"
                      />
                    );
                  }

                  if (activeTool === 'cloud' || activeTool === 'cloudPlus') {
                    return (
                      <path
                        d={revisionCloudPathNormalized(
                          [drawingStart, currentDrawPoint],
                          { width: viewportTransform.width, height: viewportTransform.height },
                          cloudSize * 10 * (scale || 1.0),
                          cloudInvert
                        )}
                        stroke={currentStyle.strokeColor}
                        strokeWidth={currentStyle.strokeWidth}
                        fill={tok('ov-preview', 0.15)}
                      />
                    );
                  }

                  if (activeTool === 'text' || activeTool === 'typewriter') {
                    const rect = getRectGeometry(p1, p2);
                    return (
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={Math.max(60, rect.width)}
                        height={Math.max(24, rect.height)}
                        stroke={activeTool === 'typewriter' ? tok('cad-accent') : currentStyle.strokeColor}
                        strokeWidth={1}
                        fill={activeTool === 'typewriter' ? 'transparent' : tok('ov-note')}
                        strokeDasharray="3 3"
                      />
                    );
                  }

                  if (activeTool === 'ellipseCutout') {
                    const ell = getEllipseGeometry(p1, p2);
                    return (
                      <ellipse
                        cx={ell.cx}
                        cy={ell.cy}
                        rx={ell.rx}
                        ry={ell.ry}
                        stroke={tok('ov-warn')}
                        strokeWidth={1.5}
                        fill={tok('ov-warn', 0.15)}
                        strokeDasharray="3 3"
                      />
                    );
                  }

                  if (activeTool === 'callout') {
                    const unscaledWidth = pageViewport.width / (scale || 1.0);
                    const unscaledHeight = pageViewport.height / (scale || 1.0);
                    const normSize = estimateCalloutBoxNormalizedSize(
                      'Note',
                      10,
                      unscaledWidth,
                      unscaledHeight
                    );
                    // Vista previa con el dibujo final (ADR-0042) y el contorno de la caja que se creará
                    const [b1, b2] = calloutBoxFromDrag(drawingStart, currentDrawPoint, normSize, CALLOUT_LANDING_PT / unscaledWidth);
                    const preview: Markup = {
                      id: 'callout-preview',
                      type: 'callout',
                      pageIndex: currentPageIndex,
                      points: [b1, b2],
                      leaders: [[drawingStart]],
                      style: { ...currentStyle, strokeWidth: currentStyle.strokeWidth || 1 },
                      text: '',
                      author: '',
                      createdAt: '',
                      updatedAt: '',
                      status: 'pending',
                    };
                    const s1 = normalizedToScreen(b1, viewportTransform);
                    const s2 = normalizedToScreen(b2, viewportTransform);
                    return (
                      <g data-testid="callout-preview">
                        {renderSvgDescriptor(getMarkupSvgDescriptor(preview, viewportTransform), 'callout-preview')}
                        <rect
                          x={s1.x}
                          y={s1.y}
                          width={s2.x - s1.x}
                          height={s2.y - s1.y}
                          stroke={currentStyle.strokeColor}
                          strokeWidth={1}
                          fill={tok('ov-halo', 0.35)}
                          strokeDasharray="3 2"
                        />
                      </g>
                    );
                  }

                  return null;
                })()}
              </g>
            )}

            {/* Destello visual de confirmación al capturar instantánea (ADR-0085) */}
            {snapshotFlashRect && (
              <g className="pointer-events-none">
                {(() => {
                  const p1 = normalizedToScreen({ x: snapshotFlashRect.x, y: snapshotFlashRect.y }, viewportTransform);
                  const p2 = normalizedToScreen(
                    {
                      x: snapshotFlashRect.x + snapshotFlashRect.width,
                      y: snapshotFlashRect.y + snapshotFlashRect.height,
                    },
                    viewportTransform
                  );
                  const rect = getRectGeometry(p1, p2);
                  return (
                    <rect
                      data-testid="snapshot-flash"
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      fill={tok('cad-accent', 0.35)}
                      stroke={tok('cad-accent')}
                      strokeWidth={2}
                      className="animate-pulse"
                    />
                  );
                })()}
              </g>
            )}

            {/* Enlaces propios del PDF: con Seleccionar, un clic los sigue (ADR-0027) */}
            {activeTool === 'select' &&
              pdfLinks.map((l, i) => {
                const a = normalizedToScreen({ x: l.x, y: l.y }, viewportTransform);
                const b = normalizedToScreen({ x: l.x + l.w, y: l.y + l.h }, viewportTransform);
                return (
                  <rect
                    key={`pdflink-${i}`}
                    data-testid={`pdf-link-${i}`}
                    x={a.x}
                    y={a.y}
                    width={b.x - a.x}
                    height={b.y - a.y}
                    fill="transparent"
                    className="cursor-pointer hover:fill-blue-500/10"
                  >
                    <title>{l.url ?? `Go to page ${(l.pageIndex ?? 0) + 1}`}</title>
                  </rect>
                );
              })}

            {/* Indicador de snap (ADR-0025): cuadrado = extremo, triángulo = punto medio, aspa = más cercano */}
            {snapIndicator && SNAP_TOOLS.has(activeTool) && (() => {
              const s = normalizedToScreen(snapIndicator.point, viewportTransform);
              const c = tok('ov-snap');
              return (
                <g data-testid={`snap-indicator-${snapIndicator.kind}`} className="pointer-events-none">
                  {snapIndicator.kind === 'endpoint' && (
                    <rect x={s.x - 5} y={s.y - 5} width={10} height={10} fill="none" stroke={c} strokeWidth={1.8} />
                  )}
                  {snapIndicator.kind === 'midpoint' && (
                    <polygon points={`${s.x},${s.y - 6} ${s.x + 6},${s.y + 5} ${s.x - 6},${s.y + 5}`} fill="none" stroke={c} strokeWidth={1.8} />
                  )}
                  {snapIndicator.kind === 'intersection' && (
                    <>
                      <circle cx={s.x} cy={s.y} r={6} fill="none" stroke={c} strokeWidth={1.8} />
                      <path d={`M${s.x - 4} ${s.y - 4}L${s.x + 4} ${s.y + 4}M${s.x + 4} ${s.y - 4}L${s.x - 4} ${s.y + 4}`} stroke={c} strokeWidth={1.5} />
                    </>
                  )}
                  {snapIndicator.kind === 'nearest' && (
                    <path d={`M${s.x - 5} ${s.y - 5}L${s.x + 5} ${s.y + 5}M${s.x + 5} ${s.y - 5}L${s.x - 5} ${s.y + 5}`} stroke={c} strokeWidth={1.8} />
                  )}
                </g>
              );
            })()}

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
                  fill={tok('cad-accent', 0.12)}
                  stroke={tok('cad-accent')}
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  className="pointer-events-none"
                />
              );
            })()}
          </svg>
    </>
  );

  // Marcas de las demás páginas (vista continua): solo lectura; al pasar el cursor la página se activa
  const renderPassiveOverlay = (pageIndex: number, width: number, height: number) => {
    const ms = markups.filter((m) => m.pageIndex === pageIndex && isMarkupVisible(m));
    if (ms.length === 0) return null;
    const t = { width, height, scale: 1.0, offsetX: 0, offsetY: 0, zoom: scale || 1.0 };
    return (
      <svg
        data-testid={`passive-overlay-${pageIndex}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 pointer-events-none"
      >
        {ms.map((m) => (
          <g key={m.id}>{renderSvgDescriptor(getMarkupSvgDescriptor(m, t), `passive-${m.id}`)}</g>
        ))}
      </svg>
    );
  };

  return (
    <div
      ref={containerRef}
      data-testid="pdf-viewer-container"
      // Centrado con m-auto en los hijos (no justify-center): con zoom alto la hoja sigue siendo
      // alcanzable por completo con el scroll, también por la izquierda y por arriba
      className="flex-1 bg-cad-canvas overflow-auto relative flex p-8 select-none"
      onScroll={handleContainerScroll}
      onMouseMove={(e) => {
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseLeave={() => {
        lastPointerRef.current = null;
      }}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-cad-canvas/80 flex items-center justify-center z-30">
          <div className="text-gray-300 font-medium animate-pulse">Loading PDF document...</div>
        </div>
      )}

      {error && (
        <div className="m-auto p-4 bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 rounded max-w-md text-center">
          {error}
        </div>
      )}

      {!pdfBytes && !isLoading && !error && (
        <Suspense fallback={null}>
          <WelcomeCanvas />
        </Suspense>
      )}

      {pdfBytes && (
        <div
          data-testid="pdf-pages-stack"
          className={`m-auto shrink-0 ${isContinuous ? 'flex flex-col items-center gap-4' : ''}`}
        >
          {(isContinuous ? pageSizes.map((_, i) => i) : [currentPageIndex]).map((i) => {
            const isActive = i === currentPageIndex;
            const slotW = isContinuous ? pageSizes[i].w * scale : pageViewport.width;
            const slotH = isContinuous ? pageSizes[i].h * scale : pageViewport.height;
            const shouldRender = isActive || !visiblePages || visiblePages.has(i);
            return (
              <div
                // Clave por modo elegido (no por si ya llegaron los tamaños): la hoja activa no se vuelve a montar
                // al pasar de la carga a la vista continua
                key={viewMode === 'continuous' ? `slot-${i}` : 'slot-single'}
                ref={isActive ? pageContainerRef : undefined}
                data-page-slot={i}
                data-testid={isActive ? 'pdf-page-container' : `pdf-page-slot-${i}`}
                data-rendered-page={isActive ? currentPageIndex : undefined}
                data-has-text={isActive ? String(pageHasText[currentPageIndex] ?? 'loading') : undefined}
                className={`relative shrink-0 sheet-shadow bg-white ${isActive ? 'select-text' : ''}`}
                style={{ width: `${slotW}px`, height: `${slotH}px` }}
                onDragOver={isActive ? handleDragOver : undefined}
                onDrop={isActive ? handleDrop : undefined}
                onDragEnter={isActive ? undefined : () => activatePage(i)}
                onMouseMove={isActive ? undefined : () => activatePage(i)}
                onMouseDown={isActive ? undefined : () => activatePage(i)}
              >
                {pdfDoc && (
                  <PageCanvas
                    pdfDoc={pdfDoc}
                    pageIndex={i}
                    scale={scale}
                    rotation={rotation}
                    active={isActive}
                    shouldRender={shouldRender}
                    textLayerNode={isActive ? textLayerNode : null}
                    ocConfig={ocConfig}
                    ocVersion={ocVersion}
                    onRendered={handlePageRendered}
                  />
                )}
                {isActive && overlayActive && pdfDoc && (
                  <Suspense fallback={null}>
                    <OverlayCanvas pdfDoc={pdfDoc} pageIndex={i} scale={scale} rotation={rotation} width={slotW} height={slotH} />
                  </Suspense>
                )}
                {isActive ? activeOverlay : renderPassiveOverlay(i, slotW, slotH)}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de calibración (el indicador de escala vive en la barra de estado, ADR-0017) */}
      {pdfBytes && isCalibrationModalOpen && (
        <Suspense fallback={null}>
          <CalibrationModal
            pageIndex={currentPageIndex}
            pageSizePt={{
              width: pageViewport.width / (scale || 1.0),
              height: pageViewport.height / (scale || 1.0),
            }}
          />
        </Suspense>
      )}

      {linkDraft && (
        <Suspense fallback={null}>
          <LinkDialog
            numPages={numPages}
            onCancel={() => setLinkDraft(null)}
            onConfirm={(target) => {
              const now = new Date().toISOString();
              const isUri = 'uri' in target;
              const m: Markup = {
                id: uuidv4(),
                type: 'link',
                pageIndex: currentPageIndex,
                points: linkDraft,
                text: isUri ? target.uri : `Page ${target.page}`,
                style: { strokeColor: LINK_COLOR, strokeWidth: 1, opacity: 1 },
                author: author || 'Reviewer',
                createdAt: now,
                updatedAt: now,
                status: 'pending',
                layer: activeLayer,
                customFields: isUri ? { linkUri: target.uri } : { linkPage: target.page },
              };
              addMarkup(m);
              setSelectedMarkupIds([m.id]);
              setLinkDraft(null);
            }}
          />
        </Suspense>
      )}

      {zoomWidget && (
        <ZoomWidget
          x={zoomWidget.x}
          y={zoomWidget.y}
          onZoom={(factor) => zoomAtClientPoint(zoomWidget.x, zoomWidget.y, factor)}
          onCenter={() => {
            centerViewAt(zoomWidget.x, zoomWidget.y);
            setZoomWidget(null);
          }}
          onClose={() => setZoomWidget(null)}
        />
      )}

      {contextMenu && (
        <React.Suspense fallback={null}>
          <CanvasContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            hitCutoutIndex={contextMenu.hitCutoutIndex}
            onClose={() => setContextMenu(null)}
          />
        </React.Suspense>
      )}
    </div>
  );
};

/**
 * Control de zoom que aparece con doble clic en el plano (ADR-0021): + acerca y − aleja manteniendo fijo el
 * punto donde se hizo doble clic; el centro centra la vista en ese punto. Se cierra con Esc o al hacer clic fuera.
 */
const ZoomWidget: React.FC<{
  x: number;
  y: number;
  onZoom: (factor: number) => void;
  onCenter: () => void;
  onClose: () => void;
}> = ({ x, y, onZoom, onCenter, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);
  const btn =
    'w-6 h-6 rounded-full bg-blue-900 text-white flex items-center justify-center hover:bg-blue-700 shadow-float';
  return (
    <div
      ref={ref}
      data-testid="zoom-widget"
      title="Scroll the mouse wheel to zoom in / out here"
      style={{ position: 'fixed', left: x - 22, top: y - 50, zIndex: 40 }}
      className="w-11 h-[100px] rounded-lg border-2 border-dotted border-blue-900 bg-sky-100/90 flex flex-col items-center justify-between py-1.5 select-none"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button type="button" data-testid="zoom-widget-in" className={btn} title="Zoom in here" onClick={() => onZoom(1.25)}>
        <Plus size={16} />
      </button>
      <button
        type="button"
        data-testid="zoom-widget-center"
        className="text-blue-900 hover:text-blue-600"
        title="Center the view here"
        onClick={onCenter}
      >
        <Crosshair size={18} />
      </button>
      <button type="button" data-testid="zoom-widget-out" className={btn} title="Zoom out here" onClick={() => onZoom(1 / 1.25)}>
        <Minus size={16} />
      </button>
    </div>
  );
};
