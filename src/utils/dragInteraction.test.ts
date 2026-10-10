import { describe, it, expect, vi } from 'vitest';
import {
  handleSelectMouseDown,
  handleSelectMouseMove,
  handleSelectMouseUp,
  DragState,
} from './dragInteraction';
import { Markup, ViewportTransform } from '../types/markup';

const mockTransform: ViewportTransform = {
  width: 1000,
  height: 800,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

function createMockRectangle(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fillColor?: string
): Markup {
  return {
    id,
    type: 'rectangle',
    pageIndex: 0,
    points: [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ],
    style: { strokeColor: '#000000', fillColor, strokeWidth: 2, opacity: 1 },
    author: 'Tester',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
  };
}

describe('Sub-entregable A.0: Interacción de Selección y Arrastre (dragInteraction)', () => {
  it('Condición 2: Clic sobre marca no seleccionada -> seleccionar Y preparar arrastre', () => {
    const m1 = createMockRectangle('m1', 0.1, 0.1, 0.3, 0.3, 'rgba(2, 132, 199, 0.15)');
    const selectMarkup = vi.fn();
    const deselectAll = vi.fn();

    const dragState = handleSelectMouseDown({
      point: { x: 0.2, y: 0.2 }, // Dentro de m1
      screenX: 200,
      screenY: 160,
      isCtrl: false,
      pageMarkups: [m1],
      selectedMarkupIds: [], // m1 no está seleccionada
      selectMarkup,
      deselectAll,
    });

    expect(selectMarkup).toHaveBeenCalledWith('m1', false);
    expect(deselectAll).not.toHaveBeenCalled();
    expect(dragState).not.toBeNull();
    expect(dragState?.initialMarkups).toHaveLength(1);
    expect(dragState?.initialMarkups[0].id).toBe('m1');
    expect(dragState?.hasMovedPastThreshold).toBe(false);
  });

  it('Condición 2: Ctrl+clic -> alternar selección SIN arrastrar', () => {
    const m1 = createMockRectangle('m1', 0.1, 0.1, 0.3, 0.3, 'rgba(2, 132, 199, 0.15)');
    const selectMarkup = vi.fn();
    const deselectAll = vi.fn();

    const dragState = handleSelectMouseDown({
      point: { x: 0.2, y: 0.2 },
      screenX: 200,
      screenY: 160,
      isCtrl: true, // Con tecla Ctrl
      pageMarkups: [m1],
      selectedMarkupIds: ['m1'],
      selectMarkup,
      deselectAll,
    });

    // Debe alternar selección pero devolver null para NO iniciar arrastre
    expect(selectMarkup).toHaveBeenCalledWith('m1', true);
    expect(dragState).toBeNull();
  });

  it('Condición 3: Clic en vacío -> deseleccionar todo y NO arrastrar', () => {
    const m1 = createMockRectangle('m1', 0.1, 0.1, 0.3, 0.3, 'rgba(2, 132, 199, 0.15)');
    const selectMarkup = vi.fn();
    const deselectAll = vi.fn();

    const dragState = handleSelectMouseDown({
      point: { x: 0.8, y: 0.8 }, // Fuera de m1
      screenX: 800,
      screenY: 640,
      isCtrl: false,
      pageMarkups: [m1],
      selectedMarkupIds: ['m1'],
      selectMarkup,
      deselectAll,
    });

    expect(deselectAll).toHaveBeenCalled();
    expect(selectMarkup).not.toHaveBeenCalled();
    expect(dragState).toBeNull();
  });

  it('Condición 2: Umbral de 4 px no se traga un clic con temblor de 3 px', () => {
    const m1 = createMockRectangle('m1', 0.1, 0.1, 0.3, 0.3);
    const dragState: DragState = {
      startScreenX: 200,
      startScreenY: 160,
      initialMarkups: [m1],
      hasMovedPastThreshold: false,
    };

    // Movimiento de exactamente 3 px (dx=3, dy=0)
    const moveResult = handleSelectMouseMove({
      screenX: 203,
      screenY: 160,
      dragState,
      viewportTransform: mockTransform,
      thresholdPx: 4,
    });

    // No debe activar arrastre
    expect(moveResult.hasMovedPastThreshold).toBe(false);
    expect(moveResult.updatedMarkups).toBeUndefined();

    // Al soltar el ratón tras un temblor de 3 px
    const upResult = handleSelectMouseUp({
      screenX: 203,
      screenY: 160,
      dragState,
      viewportTransform: mockTransform,
      thresholdPx: 4,
    });

    // Cero comandos de historial emitidos
    expect(upResult.moves).toBeUndefined();
  });

  it('Condición 2: Movimiento de 4 px o más activa arrastre y genera MoveMarkupItem atómico', () => {
    const m1 = createMockRectangle('m1', 0.1, 0.1, 0.3, 0.3);
    const dragState: DragState = {
      startScreenX: 200,
      startScreenY: 160,
      initialMarkups: [m1],
      hasMovedPastThreshold: false,
    };

    // Movimiento de 50 px a la derecha (dx=50 px -> deltaNorm = 50 / 1000 = 0.05)
    const moveResult = handleSelectMouseMove({
      screenX: 250,
      screenY: 160,
      dragState,
      viewportTransform: mockTransform,
      thresholdPx: 4,
    });

    expect(moveResult.hasMovedPastThreshold).toBe(true);
    expect(moveResult.updatedMarkups).toBeDefined();
    expect(moveResult.updatedMarkups![0].points[0].x).toBeCloseTo(0.15, 4);

    // Al soltar el ratón tras 50 px
    const upResult = handleSelectMouseUp({
      screenX: 250,
      screenY: 160,
      dragState,
      viewportTransform: mockTransform,
      thresholdPx: 4,
    });

    expect(upResult.moves).toBeDefined();
    expect(upResult.moves).toHaveLength(1);
    expect(upResult.moves![0].id).toBe('m1');
    expect(upResult.moves![0].originalPoints).toEqual(m1.points);
    expect(upResult.moves![0].newPoints[0].x).toBeCloseTo(0.15, 4);
    expect(upResult.moves![0].newPoints[1].x).toBeCloseTo(0.35, 4);
  });

  it('Condición 1: Clamp 0..1 impide arrastrar fuera de la página manteniendo la geometría', () => {
    // Marca en [0.85, 0.1] a [0.95, 0.3] (ancho 0.10)
    const m1 = createMockRectangle('m1', 0.85, 0.1, 0.95, 0.3);
    const dragState: DragState = {
      startScreenX: 900,
      startScreenY: 100,
      initialMarkups: [m1],
      hasMovedPastThreshold: true,
    };

    // Intento de arrastre de 200 px a la derecha (deltaNorm = 0.20 -> llevaría maxX a 1.15)
    const moveResult = handleSelectMouseMove({
      screenX: 1100,
      screenY: 100,
      dragState,
      viewportTransform: mockTransform,
    });

    expect(moveResult.hasMovedPastThreshold).toBe(true);
    // Debe recortar en maxX = 1.0 -> delta permitido = 0.05
    expect(moveResult.clampedDelta?.x).toBeCloseTo(0.05, 4);
    expect(moveResult.updatedMarkups![0].points[1].x).toBeCloseTo(1.0, 4);
    // Dimensión de ancho preservada exactamente: 1.0 - 0.9 = 0.10
    expect(moveResult.updatedMarkups![0].points[0].x).toBeCloseTo(0.9, 4);
  });

  it('Arrastre grupal: mueve múltiples marcas seleccionadas respetando el límite de página común', () => {
    const m1 = createMockRectangle('m1', 0.1, 0.1, 0.2, 0.2, 'rgba(2, 132, 199, 0.15)');
    const m2 = createMockRectangle('m2', 0.8, 0.8, 0.9, 0.9, 'rgba(2, 132, 199, 0.15)');
    const selectMarkup = vi.fn();
    const deselectAll = vi.fn();

    // Ambas seleccionadas, clic sobre m1
    const dragState = handleSelectMouseDown({
      point: { x: 0.15, y: 0.15 },
      screenX: 150,
      screenY: 120,
      isCtrl: false,
      pageMarkups: [m1, m2],
      selectedMarkupIds: ['m1', 'm2'],
      selectMarkup,
      deselectAll,
    });

    expect(dragState?.initialMarkups).toHaveLength(2);

    // Arrastre hacia la derecha 150 px (deltaNorm = 0.15)
    // m2 está en 0.9 maxX, por lo que el grupo solo puede moverse 0.10 a la derecha
    const moveResult = handleSelectMouseMove({
      screenX: 300,
      screenY: 120,
      dragState: dragState!,
      viewportTransform: mockTransform,
    });

    expect(moveResult.clampedDelta?.x).toBeCloseTo(0.1, 4);
    expect(moveResult.updatedMarkups![0].points[0].x).toBeCloseTo(0.2, 4);
    expect(moveResult.updatedMarkups![1].points[1].x).toBeCloseTo(1.0, 4);
  });

  it('Rectángulo hueco (sin relleno): clic en borde selecciona y arrastra; clic en interior deselecciona', () => {
    // Rectángulo hueco sin fillColor
    const hollow = createMockRectangle('hollow1', 0.2, 0.2, 0.6, 0.6, undefined);
    const selectMarkup = vi.fn();
    const deselectAll = vi.fn();

    // 1. Clic en el centro exacto (0.4, 0.4) -> vacío
    const hitCenter = handleSelectMouseDown({
      point: { x: 0.4, y: 0.4 },
      screenX: 400,
      screenY: 320,
      isCtrl: false,
      pageMarkups: [hollow],
      selectedMarkupIds: [],
      selectMarkup,
      deselectAll,
    });
    expect(hitCenter).toBeNull();
    expect(deselectAll).toHaveBeenCalled();

    // 2. Clic sobre el borde izquierdo (0.201, 0.4) -> dentro de la tolerancia de contorno
    const hitBorder = handleSelectMouseDown({
      point: { x: 0.201, y: 0.4 },
      screenX: 201,
      screenY: 320,
      isCtrl: false,
      pageMarkups: [hollow],
      selectedMarkupIds: [],
      selectMarkup,
      deselectAll,
    });
    expect(hitBorder).not.toBeNull();
    expect(selectMarkup).toHaveBeenCalledWith('hollow1', false);
  });

  it('Clamp 0..1 en esquinas superior e izquierda (x < 0, y < 0) no deforma el tamaño', () => {
    const m1 = createMockRectangle('m1', 0.1, 0.1, 0.25, 0.3); // width=0.15, height=0.20
    const dragState: DragState = {
      startScreenX: 100,
      startScreenY: 100,
      initialMarkups: [m1],
      hasMovedPastThreshold: true,
    };

    // Intentar mover -300 px en X e Y
    const moveResult = handleSelectMouseMove({
      screenX: -200,
      screenY: -200,
      dragState,
      viewportTransform: mockTransform,
    });

    expect(moveResult.clampedDelta?.x).toBeCloseTo(-0.1, 4);
    expect(moveResult.clampedDelta?.y).toBeCloseTo(-0.1, 4);
    // Borde izquierdo en 0.0, borde derecho en 0.15 (ancho 0.15 intacto)
    expect(moveResult.updatedMarkups![0].points[0].x).toBeCloseTo(0.0, 4);
    expect(moveResult.updatedMarkups![0].points[1].x).toBeCloseTo(0.15, 4);
    // Borde superior en 0.0, borde inferior en 0.20 (alto 0.20 intacto)
    expect(moveResult.updatedMarkups![0].points[0].y).toBeCloseTo(0.0, 4);
    expect(moveResult.updatedMarkups![0].points[1].y).toBeCloseTo(0.2, 4);
  });

  it('Cloud+ como GRUPO: arrastrar un miembro arrastra todos los miembros del grupo con clamp de bbox conjunto', () => {
    const groupId = 'group-cp-drag';
    const cloud: Markup = {
      id: 'cloud-m1',
      type: 'cloudPlus',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.3 },
      ],
      style: { strokeColor: '#10b981', strokeWidth: 2, opacity: 1 },
      author: 'Tester',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
      groupId,
      customFields: { arcStep: 20 },
    };

    const callout: Markup = {
      id: 'callout-m1',
      type: 'callout',
      pageIndex: 0,
      points: [
        { x: 0.45, y: 0.05 },
        { x: 0.6, y: 0.12 },
      ],
      leaders: [[{ x: 0.4, y: 0.1 }]],
      style: { strokeColor: '#10b981', strokeWidth: 1.5, opacity: 1 },
      text: 'Nota',
      author: 'Tester',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
      groupId,
    };

    const selectMarkup = vi.fn();
    const deselectAll = vi.fn();

    // Clic sobre la nube
    const dragState = handleSelectMouseDown({
      point: { x: 0.2, y: 0.2 },
      screenX: 200,
      screenY: 160,
      isCtrl: false,
      pageMarkups: [cloud, callout],
      selectedMarkupIds: [],
      selectMarkup,
      deselectAll,
    });

    expect(dragState).not.toBeNull();
    // initialMarkups debe contener AMBOS miembros del grupo
    expect(dragState?.initialMarkups).toHaveLength(2);
    expect(dragState?.initialMarkups.map((m) => m.id)).toEqual(['cloud-m1', 'callout-m1']);

    // Arrastrar 50 px en X e Y
    const moveResult = handleSelectMouseMove({
      screenX: 250,
      screenY: 210,
      dragState: dragState!,
      viewportTransform: mockTransform,
    });

    expect(moveResult.hasMovedPastThreshold).toBe(true);
    expect(moveResult.updatedMarkups).toHaveLength(2);
    // dxScreen = 50 / 1000 = 0.05, dyScreen = 50 / 800 = 0.0625
    expect(moveResult.clampedDelta?.x).toBeCloseTo(0.05, 4);
    expect(moveResult.clampedDelta?.y).toBeCloseTo(0.0625, 4);

    // Comprobar que la directriz del callout también se trasladó
    const movedCallout = moveResult.updatedMarkups!.find((m) => m.id === 'callout-m1');
    expect(movedCallout?.leaders?.[0][0].x).toBeCloseTo(0.4 + 0.05, 4);
    expect(movedCallout?.leaders?.[0][0].y).toBeCloseTo(0.1 + 0.0625, 4);

    // Finalizar arrastre con mouseUp
    const upResult = handleSelectMouseUp({
      screenX: 250,
      screenY: 210,
      dragState: dragState!,
      viewportTransform: mockTransform,
    });

    expect(upResult.moves).toHaveLength(2);
    expect(upResult.moves?.[0].id).toBe('cloud-m1');
    expect(upResult.moves?.[1].id).toBe('callout-m1');
  });
});
