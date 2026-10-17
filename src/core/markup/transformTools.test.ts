import { describe, it, expect, beforeEach } from 'vitest';
import {
  alignMarkups,
  distributeMarkups,
  flipMarkups,
  alignSelectedMarkups,
  distributeSelectedMarkups,
  flipSelectedMarkups,
  AlignMode,
} from './transformTools';
import { Markup } from '../../types/markup';
import { useMarkupStore } from '../../store/useMarkupStore';

function makeRect(id: string, x0: number, y0: number, x1: number, y1: number, opts?: Partial<Markup>): Markup {
  return {
    id,
    type: 'rectangle',
    pageIndex: 0,
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y1 },
    ],
    style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
    author: 'Tester',
    createdAt: '2026-10-16T00:00:00Z',
    updatedAt: '2026-10-16T00:00:00Z',
    status: 'pending',
    ...opts,
  };
}

describe('Herramientas puras de alineación, distribución y volteo de marcas (ADR-0073)', () => {
  beforeEach(() => {
    useMarkupStore.getState().clearHistory();
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [], isDirty: false });
  });

  const threeRects = () => [
    makeRect('r1', 0.1, 0.1, 0.2, 0.2),
    makeRect('r2', 0.35, 0.3, 0.55, 0.5),
    makeRect('r3', 0.7, 0.6, 0.8, 0.8),
  ];

  it('alignMarkups: left alinea todos los bordes izquierdos al mínimo global minX', () => {
    const moves = alignMarkups(threeRects(), 'left');
    expect(moves).toHaveLength(2);
    const m2 = moves.find((m) => m.id === 'r2')!;
    const m3 = moves.find((m) => m.id === 'r3')!;
    expect(m2.newPoints[0].x).toBeCloseTo(0.1, 5);
    expect(m2.newPoints[1].x).toBeCloseTo(0.3, 5);
    expect(m3.newPoints[0].x).toBeCloseTo(0.1, 5);
    expect(m3.newPoints[1].x).toBeCloseTo(0.2, 5);
  });

  it('alignMarkups: center alinea los centros horizontales al centro global (0.45)', () => {
    const moves = alignMarkups(threeRects(), 'center');
    const byId = new Map(moves.map((m) => [m.id, m]));
    // Global X span: [0.1, 0.8] -> center = 0.45
    // r2 ya tiene centro en (0.35 + 0.55)/2 = 0.45 -> no necesita moverse
    expect(byId.has('r2')).toBe(false);
    expect((byId.get('r1')!.newPoints[0].x + byId.get('r1')!.newPoints[1].x) / 2).toBeCloseTo(0.45, 5);
    expect((byId.get('r3')!.newPoints[0].x + byId.get('r3')!.newPoints[1].x) / 2).toBeCloseTo(0.45, 5);
  });

  it('alignMarkups: right alinea los bordes derechos al máximo global maxX (0.8)', () => {
    const moves = alignMarkups(threeRects(), 'right');
    expect(moves).toHaveLength(2);
    const m1 = moves.find((m) => m.id === 'r1')!;
    const m2 = moves.find((m) => m.id === 'r2')!;
    expect(m1.newPoints[1].x).toBeCloseTo(0.8, 5);
    expect(m2.newPoints[1].x).toBeCloseTo(0.8, 5);
  });

  it('alignMarkups: top, middle y bottom alinean sobre el eje vertical Y', () => {
    const modes: [AlignMode, (pts: { x: number; y: number }[]) => number, number][] = [
      ['top', (pts) => pts[0].y, 0.1],
      ['middle', (pts) => (pts[0].y + pts[1].y) / 2, 0.45],
      ['bottom', (pts) => pts[1].y, 0.8],
    ];
    for (const [mode, getter, expected] of modes) {
      const base = threeRects();
      const moves = alignMarkups(base, mode);
      for (const m of base) {
        const move = moves.find((mv) => mv.id === m.id);
        const pts = move ? move.newPoints : m.points;
        expect(getter(pts)).toBeCloseTo(expected, 5);
      }
    }
  });

  it('alignMarkups: devuelve lista vacía con menos de 2 unidades', () => {
    expect(alignMarkups([makeRect('r1', 0.1, 0.1, 0.2, 0.2)], 'left')).toEqual([]);
  });

  it('distributeMarkups: reparte equitativamente los huecos horizontales entre 3 marcas', () => {
    const rects = [
      makeRect('r1', 0.1, 0.2, 0.2, 0.3), // ancho 0.1
      makeRect('r2', 0.22, 0.2, 0.32, 0.3), // ancho 0.1 (pegado a la izquierda)
      makeRect('r3', 0.7, 0.2, 0.8, 0.3), // ancho 0.1
    ];
    const moves = distributeMarkups(rects, 'horizontal');
    expect(moves).toHaveLength(1);
    expect(moves[0].id).toBe('r2');
    // Span [0.1, 0.8] = 0.7; suma anchos = 0.3; hueco libre = 0.4 -> gap = 0.2 -> r2 va a [0.4, 0.5]
    expect(moves[0].newPoints[0].x).toBeCloseTo(0.4, 5);
    expect(moves[0].newPoints[1].x).toBeCloseTo(0.5, 5);
  });

  it('distributeMarkups: reparte equitativamente los huecos verticales entre 3 marcas', () => {
    const rects = [
      makeRect('r1', 0.2, 0.1, 0.3, 0.2),
      makeRect('r2', 0.2, 0.55, 0.3, 0.65),
      makeRect('r3', 0.2, 0.7, 0.3, 0.8),
    ];
    const moves = distributeMarkups(rects, 'vertical');
    expect(moves).toHaveLength(1);
    expect(moves[0].id).toBe('r2');
    expect(moves[0].newPoints[0].y).toBeCloseTo(0.4, 5);
    expect(moves[0].newPoints[1].y).toBeCloseTo(0.5, 5);
  });

  it('distributeMarkups: devuelve lista vacía con menos de 3 unidades', () => {
    expect(distributeMarkups(threeRects().slice(0, 2), 'horizontal')).toEqual([]);
  });

  it('flipMarkups: voltea horizontal y verticalmente un polígono asimétrico y es involutivo al aplicarlo dos veces', () => {
    const poly: Markup = {
      id: 'poly-asym',
      type: 'polygon',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.3 },
        { x: 0.3, y: 0.7 },
      ],
      style: { strokeColor: '#00aa00', strokeWidth: 2, opacity: 1 },
      author: 'Tester',
      createdAt: '2026-10-16T00:00:00Z',
      updatedAt: '2026-10-16T00:00:00Z',
      status: 'pending',
    };

    // Centroide de caja: cx = (0.2 + 0.6)/2 = 0.4, cy = (0.2 + 0.7)/2 = 0.45
    const hMoves = flipMarkups([poly], 'horizontal');
    expect(hMoves).toHaveLength(1);
    expect(hMoves[0].newPoints[0].x).toBeCloseTo(0.6, 5);
    expect(hMoves[0].newPoints[1].x).toBeCloseTo(0.2, 5);
    expect(hMoves[0].newPoints[2].x).toBeCloseTo(0.5, 5);

    // Segundo flip horizontal devuelve exactamente los puntos originales
    const hTwice = flipMarkups([{ ...poly, points: hMoves[0].newPoints }], 'horizontal');
    expect(hTwice[0].newPoints[0].x).toBeCloseTo(0.2, 5);
    expect(hTwice[0].newPoints[1].x).toBeCloseTo(0.6, 5);
    expect(hTwice[0].newPoints[2].x).toBeCloseTo(0.3, 5);

    const vMoves = flipMarkups([poly], 'vertical');
    expect(vMoves).toHaveLength(1);
    expect(vMoves[0].newPoints[0].y).toBeCloseTo(0.7, 5);
    expect(vMoves[0].newPoints[1].y).toBeCloseTo(0.6, 5);
    expect(vMoves[0].newPoints[2].y).toBeCloseTo(0.2, 5);
  });

  it('flipMarkups: invierte también las directrices (leaders) de un callout manteniendo su caja canónica', () => {
    const callout: Markup = {
      id: 'co-1',
      type: 'callout',
      pageIndex: 0,
      points: [
        { x: 0.4, y: 0.3 },
        { x: 0.6, y: 0.4 },
      ],
      leaders: [
        [
          { x: 0.2, y: 0.5 },
          { x: 0.35, y: 0.35 },
        ],
      ],
      style: { strokeColor: '#ef4444', strokeWidth: 1.5, opacity: 1 },
      author: 'Tester',
      createdAt: '2026-10-16T00:00:00Z',
      updatedAt: '2026-10-16T00:00:00Z',
      status: 'pending',
    };

    // Bounding box X: [0.2, 0.6] -> cx = 0.4
    const moves = flipMarkups([callout], 'horizontal');
    expect(moves).toHaveLength(1);
    // Caja reflejada respecto a 0.4 pasa de [0.4, 0.6] a [0.2, 0.4] (canónica top-left -> bottom-right)
    expect(moves[0].newPoints[0].x).toBeCloseTo(0.2, 5);
    expect(moves[0].newPoints[1].x).toBeCloseTo(0.4, 5);
    // Ancla de la directriz en x=0.2 pasa a x=0.6
    expect(moves[0].newLeaders![0][0].x).toBeCloseTo(0.6, 5);
    expect(moves[0].newLeaders![0][1].x).toBeCloseTo(0.45, 5);
  });

  it('respeta grupos (groupId) como una sola unidad y nunca mueve marcas bloqueadas (locked)', () => {
    const g1Cloud = makeRect('g1-cloud', 0.3, 0.2, 0.5, 0.4, { groupId: 'grp-1' });
    const g1Callout = makeRect('g1-callout', 0.5, 0.15, 0.65, 0.25, { groupId: 'grp-1' });
    const targetLeft = makeRect('left-ref', 0.1, 0.5, 0.2, 0.6);
    const lockedRect = makeRect('locked-r', 0.7, 0.5, 0.8, 0.6, { locked: true });

    const moves = alignMarkups([g1Cloud, g1Callout, targetLeft, lockedRect], 'left');
    // lockedRect no se mueve; left-ref ya está en 0.1; grp-1 entero (minX=0.3) se traslada dx = -0.2
    expect(moves.map((m) => m.id).sort()).toEqual(['g1-callout', 'g1-cloud']);
    const cloudMove = moves.find((m) => m.id === 'g1-cloud')!;
    const calloutMove = moves.find((m) => m.id === 'g1-callout')!;
    // El desfase relativo entre nube y llamada (0.5 - 0.3 = 0.2) se conserva intacto
    expect(calloutMove.newPoints[0].x - cloudMove.newPoints[0].x).toBeCloseTo(0.2, 5);
  });

  it('alinea, distribuye y voltea horizontal y verticalmente un conjunto de marcas y revierte con un solo undo', () => {
    const r1 = makeRect('r1', 0.1, 0.1, 0.2, 0.2);
    const r2 = makeRect('r2', 0.25, 0.3, 0.35, 0.4);
    const r3 = makeRect('r3', 0.7, 0.6, 0.8, 0.7);

    useMarkupStore.setState({
      markups: [r1, r2, r3],
      selectedMarkupIds: ['r1', 'r2', 'r3'],
    });

    // 1. Alinear a la izquierda -> 1 comando en historial
    alignSelectedMarkups('left');
    expect(useMarkupStore.getState().markups.every((m) => Math.abs(m.points[0].x - 0.1) < 1e-6)).toBe(true);
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'r3')!.points[0].x).toBeCloseTo(0.7, 5);

    // 2. Distribuir horizontalmente -> 1 comando en historial
    distributeSelectedMarkups('horizontal');
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'r2')!.points[0].x).toBeCloseTo(0.4, 5);
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'r2')!.points[0].x).toBeCloseTo(0.25, 5);

    // 3. Voltear horizontalmente y verticalmente -> cada uno revierte con un solo undo
    flipSelectedMarkups('horizontal');
    // r1 estaba en [0.1, 0.2] y r3 en [0.7, 0.8]; tras flip H respecto a cx=0.45, r1 pasa a [0.7, 0.8]
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'r1')!.points[0].x).toBeCloseTo(0.7, 5);
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'r1')!.points[0].x).toBeCloseTo(0.1, 5);

    flipSelectedMarkups('vertical');
    // Span Y: [0.1, 0.7] -> cy=0.4; r1 [0.1, 0.2] pasa a [0.6, 0.7]
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'r1')!.points[0].y).toBeCloseTo(0.6, 5);
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'r1')!.points[0].y).toBeCloseTo(0.1, 5);
  });

  it('alinea y voltea marcas de tipo "image" conservando su bounding box (ADR-0085)', () => {
    const img1: Markup = {
      id: 'img-1',
      type: 'image',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.3 },
      ],
      style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 1 },
      customFields: { imageSrc: 'data:image/png;base64,1' },
      author: 'User',
      status: 'pending',
      createdAt: '',
      updatedAt: '',
    };
    const img2: Markup = {
      id: 'img-2',
      type: 'image',
      pageIndex: 0,
      points: [
        { x: 0.5, y: 0.2 },
        { x: 0.7, y: 0.4 },
      ],
      style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 1 },
      customFields: { imageSrc: 'data:image/png;base64,2' },
      author: 'User',
      status: 'pending',
      createdAt: '',
      updatedAt: '',
    };

    useMarkupStore.getState().setMarkups([img1, img2]);
    useMarkupStore.getState().setSelectedMarkupIds(['img-1', 'img-2']);

    // Alinear arriba (top) -> minY es 0.1
    alignSelectedMarkups('top');
    const updated = useMarkupStore.getState().markups;
    expect(updated.find((m) => m.id === 'img-1')!.points[0].y).toBeCloseTo(0.1, 5);
    expect(updated.find((m) => m.id === 'img-2')!.points[0].y).toBeCloseTo(0.1, 5);

    // Deshacer revierte img-2 a 0.2
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'img-2')!.points[0].y).toBeCloseTo(0.2, 5);
  });
});
