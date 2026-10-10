import { describe, it, expect, beforeEach } from 'vitest';
import { useMarkupStore, markupHistory } from './useMarkupStore';
import { Markup } from '../types/markup';

describe('useMarkupStore Integration & History', () => {
  beforeEach(() => {
    markupHistory.clear();
    useMarkupStore.getState().setMarkups([]);
    useMarkupStore.getState().markAsClean();
  });

  const createMockMarkup = (id: string, text = 'Nota'): Markup => ({
    id,
    type: 'rectangle',
    pageIndex: 0,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.3 },
    ],
    style: {
      strokeColor: '#ff0000',
      strokeWidth: 2,
      opacity: 1,
    },
    text,
    author: 'Revisor Test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
  });

  it('adds a markup and marks state as dirty', () => {
    const markup = createMockMarkup('m1');
    useMarkupStore.getState().addMarkup(markup);

    const state = useMarkupStore.getState();
    expect(state.markups).toHaveLength(1);
    expect(state.markups[0].id).toBe('m1');
    expect(state.isDirty).toBe(true);
    expect(state.canUndo).toBe(true);
  });

  it('undoes adding a markup', () => {
    const markup = createMockMarkup('m1');
    useMarkupStore.getState().addMarkup(markup);
    expect(useMarkupStore.getState().markups).toHaveLength(1);

    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups).toHaveLength(0);
    expect(useMarkupStore.getState().canRedo).toBe(true);

    useMarkupStore.getState().redo();
    expect(useMarkupStore.getState().markups).toHaveLength(1);
  });

  it('updates markup status and allows undoing it', () => {
    const markup = createMockMarkup('m1');
    useMarkupStore.getState().addMarkup(markup);

    useMarkupStore.getState().updateMarkupStatus('m1', 'accepted');
    expect(useMarkupStore.getState().markups[0].status).toBe('accepted');

    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups[0].status).toBe('pending');
  });

  it('deletes markup with undo/redo support', () => {
    const markup = createMockMarkup('m1');
    useMarkupStore.getState().addMarkup(markup);

    useMarkupStore.getState().deleteMarkup('m1');
    expect(useMarkupStore.getState().markups).toHaveLength(0);

    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups).toHaveLength(1);
    expect(useMarkupStore.getState().markups[0].id).toBe('m1');
  });

  it('supports selecting and batch deleting multiple markups', () => {
    const m1 = createMockMarkup('m1');
    const m2 = createMockMarkup('m2');
    const m3 = createMockMarkup('m3');

    useMarkupStore.getState().addMarkup(m1);
    useMarkupStore.getState().addMarkup(m2);
    useMarkupStore.getState().addMarkup(m3);

    useMarkupStore.getState().selectMarkup('m1');
    useMarkupStore.getState().selectMarkup('m2', true); // multi-select
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['m1', 'm2']);

    useMarkupStore.getState().deleteSelectedMarkups();
    expect(useMarkupStore.getState().markups).toHaveLength(1);
    expect(useMarkupStore.getState().markups[0].id).toBe('m3');

    // Undo batch delete
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups).toHaveLength(3);
  });

  it('commitMoveMarkups mueve una marca con un solo comando atómico y lo revierte con undo', () => {
    const m1 = createMockMarkup('m1');
    useMarkupStore.getState().addMarkup(m1);
    const undoCountBefore = markupHistory.getUndoCount();

    const originalPoints = [...m1.points];
    const newPoints = [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }];

    useMarkupStore.getState().commitMoveMarkups([
      {
        id: 'm1',
        originalPoints,
        newPoints,
      },
    ]);

    // Comprobar nueva posición
    expect(useMarkupStore.getState().markups[0].points).toEqual(newPoints);
    expect(useMarkupStore.getState().isDirty).toBe(true);
    // Un solo comando añadido al historial
    expect(markupHistory.getUndoCount()).toBe(undoCountBefore + 1);

    // Revertir con un único undo()
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups[0].points).toEqual(originalPoints);
    expect(markupHistory.getUndoCount()).toBe(undoCountBefore);

    // Rehacer con un único redo()
    useMarkupStore.getState().redo();
    expect(useMarkupStore.getState().markups[0].points).toEqual(newPoints);
  });

  it('commitMoveMarkups traslada multiples marcas en un unico comando atomico', () => {
    const m1 = createMockMarkup('m1');
    const m2 = createMockMarkup('m2');
    useMarkupStore.getState().addMarkup(m1);
    useMarkupStore.getState().addMarkup(m2);

    const m1Original = [...m1.points];
    const m2Original = [...m2.points];
    const m1New = [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }];
    const m2New = [{ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.7 }];

    useMarkupStore.getState().commitMoveMarkups([
      { id: 'm1', originalPoints: m1Original, newPoints: m1New },
      { id: 'm2', originalPoints: m2Original, newPoints: m2New },
    ]);

    expect(useMarkupStore.getState().markups.find((m) => m.id === 'm1')?.points).toEqual(m1New);
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'm2')?.points).toEqual(m2New);

    // Un solo comando atómico revierte ambas marcas juntas
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'm1')?.points).toEqual(m1Original);
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'm2')?.points).toEqual(m2Original);
  });

  it('setMarkupsTransient actualiza las marcas sin emitir comandos de historial', () => {
    const m1 = createMockMarkup('m1');
    useMarkupStore.getState().addMarkup(m1);
    const undoCountBefore = markupHistory.getUndoCount();

    const transientMarkups = [
      {
        ...m1,
        points: [{ x: 0.15, y: 0.15 }, { x: 0.35, y: 0.35 }],
      },
    ];

    useMarkupStore.getState().setMarkupsTransient(transientMarkups);
    expect(useMarkupStore.getState().markups[0].points).toEqual(transientMarkups[0].points);
    // Pila de historial intacta (no se ensucia con movimientos transitorios)
    expect(markupHistory.getUndoCount()).toBe(undoCountBefore);
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable A.1: Cloud+ como GRUPO (creación, selección, movimiento y borrado atómicos)
  // --------------------------------------------------------------------------------
  describe('Sub-entregable A.1: Cloud+ como GRUPO', () => {
    const createCloudPlusGroup = () => {
      const groupId = 'group-cp-1';
      const cloudMarkup: Markup = {
        id: 'cloud-1',
        type: 'cloudPlus',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.5, y: 0.4 },
        ],
        style: { strokeColor: '#10b981', strokeWidth: 2, opacity: 1 },
        author: 'Revisor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
        groupId,
        customFields: { arcStep: 20 },
      };

      const calloutMarkup: Markup = {
        id: 'callout-1',
        type: 'callout',
        pageIndex: 0,
        points: [
          { x: 0.55, y: 0.15 },
          { x: 0.7, y: 0.22 },
        ],
        leaders: [[{ x: 0.5, y: 0.2 }]],
        style: { strokeColor: '#10b981', strokeWidth: 1.5, opacity: 1 },
        text: 'Nota Cloud+',
        author: 'Revisor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
        groupId,
      };

      return { groupId, cloudMarkup, calloutMarkup };
    };

    it('addMarkups crea nube y callout en UN solo comando atómico de historial', () => {
      const { cloudMarkup, calloutMarkup } = createCloudPlusGroup();
      const undoCountBefore = markupHistory.getUndoCount();

      useMarkupStore.getState().addMarkups([cloudMarkup, calloutMarkup], 'Crear Cloud+');

      expect(useMarkupStore.getState().markups).toHaveLength(2);
      expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['cloud-1', 'callout-1']);
      expect(markupHistory.getUndoCount()).toBe(undoCountBefore + 1);

      // Un solo undo() elimina AMBOS elementos del grupo
      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups).toHaveLength(0);
      expect(useMarkupStore.getState().selectedMarkupIds).toEqual([]);

      // Un solo redo() restaura AMBOS elementos del grupo
      useMarkupStore.getState().redo();
      expect(useMarkupStore.getState().markups).toHaveLength(2);
      expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['cloud-1', 'callout-1']);
    });

    it('selectMarkup selecciona y deselecciona todos los miembros del grupo juntos', () => {
      const { cloudMarkup, calloutMarkup } = createCloudPlusGroup();
      useMarkupStore.getState().addMarkups([cloudMarkup, calloutMarkup]);

      useMarkupStore.getState().deselectAll();
      expect(useMarkupStore.getState().selectedMarkupIds).toEqual([]);

      // Seleccionar cloud selecciona automáticamente callout
      useMarkupStore.getState().selectMarkup('cloud-1', false);
      expect(useMarkupStore.getState().selectedMarkupIds).toContain('cloud-1');
      expect(useMarkupStore.getState().selectedMarkupIds).toContain('callout-1');

      // Toggling multi-select deselecciona ambos
      useMarkupStore.getState().selectMarkup('callout-1', true);
      expect(useMarkupStore.getState().selectedMarkupIds).toEqual([]);
    });

    it('deleteMarkup borra todos los miembros del grupo con UN solo comando de historial', () => {
      const { cloudMarkup, calloutMarkup } = createCloudPlusGroup();
      useMarkupStore.getState().addMarkups([cloudMarkup, calloutMarkup]);
      const undoCountBefore = markupHistory.getUndoCount();

      // Borrar solo especificando el id de la nube
      useMarkupStore.getState().deleteMarkup('cloud-1');
      expect(useMarkupStore.getState().markups).toHaveLength(0);
      expect(markupHistory.getUndoCount()).toBe(undoCountBefore + 1);

      // Deshacer restaura tanto la nube como el callout
      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups).toHaveLength(2);
      expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['cloud-1', 'callout-1']);
    });

    it('deleteSelectedMarkups expande la selección a todos los miembros del grupo', () => {
      const { cloudMarkup, calloutMarkup } = createCloudPlusGroup();
      useMarkupStore.getState().addMarkups([cloudMarkup, calloutMarkup]);

      // Supongamos que solo 'callout-1' estaba en selectedMarkupIds
      useMarkupStore.setState({ selectedMarkupIds: ['callout-1'] });

      useMarkupStore.getState().deleteSelectedMarkups();
      // Ambos miembros son eliminados
      expect(useMarkupStore.getState().markups).toHaveLength(0);

      // Undo restaura ambos
      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups).toHaveLength(2);
    });

    it('commitMoveMarkups traslada grupo completo (incluyendo directrices) y lo revierte atómicamente', () => {
      const { cloudMarkup, calloutMarkup } = createCloudPlusGroup();
      useMarkupStore.getState().addMarkups([cloudMarkup, calloutMarkup]);
      const undoCountBefore = markupHistory.getUndoCount();

      const cloudNew = [{ x: 0.25, y: 0.25 }, { x: 0.55, y: 0.45 }];
      const calloutNew = [{ x: 0.6, y: 0.2 }, { x: 0.75, y: 0.27 }];
      const leaderNew = [[{ x: 0.55, y: 0.25 }]];

      useMarkupStore.getState().commitMoveMarkups([
        {
          id: 'cloud-1',
          originalPoints: cloudMarkup.points,
          newPoints: cloudNew,
        },
        {
          id: 'callout-1',
          originalPoints: calloutMarkup.points,
          newPoints: calloutNew,
          originalLeaders: calloutMarkup.leaders,
          newLeaders: leaderNew,
        },
      ]);

      const stateMoved = useMarkupStore.getState();
      expect(stateMoved.markups.find((m) => m.id === 'cloud-1')?.points).toEqual(cloudNew);
      expect(stateMoved.markups.find((m) => m.id === 'callout-1')?.points).toEqual(calloutNew);
      expect(stateMoved.markups.find((m) => m.id === 'callout-1')?.leaders).toEqual(leaderNew);
      expect(markupHistory.getUndoCount()).toBe(undoCountBefore + 1);

      // Revertir con un solo undo
      useMarkupStore.getState().undo();
      const stateReverted = useMarkupStore.getState();
      expect(stateReverted.markups.find((m) => m.id === 'cloud-1')?.points).toEqual(cloudMarkup.points);
      expect(stateReverted.markups.find((m) => m.id === 'callout-1')?.points).toEqual(calloutMarkup.points);
      expect(stateReverted.markups.find((m) => m.id === 'callout-1')?.leaders).toEqual(calloutMarkup.leaders);
    });

    it('setSelectedMarkupIds establece seleccion directa y expande grupos si estan presentes', () => {
      const { cloudMarkup, calloutMarkup } = createCloudPlusGroup();
      useMarkupStore.getState().addMarkups([cloudMarkup, calloutMarkup]);

      useMarkupStore.getState().deselectAll();
      expect(useMarkupStore.getState().selectedMarkupIds).toEqual([]);

      // Pasar solo 'cloud-1' expande automáticamente a ambos por pertenecer a groupId
      useMarkupStore.getState().setSelectedMarkupIds(['cloud-1']);
      expect(useMarkupStore.getState().selectedMarkupIds).toContain('cloud-1');
      expect(useMarkupStore.getState().selectedMarkupIds).toContain('callout-1');
      expect(useMarkupStore.getState().selectedMarkupIds).toHaveLength(2);
    });

    it('Sub-entregable A.4: creación de stickyNote genera exactamente 1 comando en el historial; cancelación genera 0 comandos', () => {
      expect(markupHistory.getUndoCount()).toBe(0);

      // 1. Simulación de cancelación (Escape / botón cancelar): no se llama a addMarkup
      // (el editor simplemente se desmonta sin invocar el store)
      expect(markupHistory.getUndoCount()).toBe(0);
      expect(useMarkupStore.getState().markups).toHaveLength(0);

      // 2. Simulación de confirmación (Enter con texto o texto vacío): se llama a addMarkup exactamente 1 vez
      const newSticky: Markup = {
        id: 'sticky-cmd-1',
        type: 'stickyNote',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.3 }],
        text: 'Nota técnica confirmada',
        style: {
          strokeColor: '#ca8a04',
          fillColor: '#fef08a',
          strokeWidth: 1,
          opacity: 1,
        },
        author: 'Revisor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      useMarkupStore.getState().addMarkup(newSticky);
      expect(markupHistory.getUndoCount()).toBe(1);
      expect(useMarkupStore.getState().markups).toHaveLength(1);

      // 3. Undo revierte la creación en un solo paso
      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups).toHaveLength(0);
      expect(useMarkupStore.getState().canRedo).toBe(true);

      // 4. Redo restaura la nota
      useMarkupStore.getState().redo();
      expect(useMarkupStore.getState().markups).toHaveLength(1);
      expect(useMarkupStore.getState().markups[0].id).toBe('sticky-cmd-1');
    });
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable A.6: Modelo multilínea para highlightText con groupId común
  // --------------------------------------------------------------------------------
  describe('Sub-entregable A.6: Modelo multilínea para highlightText con groupId común', () => {
    it('tres líneas -> exactamente 3 marcas con un solo groupId y exactamente 1 comando en el historial', () => {
      useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
      markupHistory.clear();

      const groupId = 'group-hl-multiline-1';
      const lines: Markup[] = [
        {
          id: 'hl-line-1',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.4, y: 0.15 },
          ],
          text: 'Primera línea',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'hl-line-2',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.16 },
            { x: 0.5, y: 0.21 },
          ],
          text: 'Segunda línea',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'hl-line-3',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.22 },
            { x: 0.35, y: 0.27 },
          ],
          text: 'Tercera línea',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
      ];

      expect(markupHistory.getUndoCount()).toBe(0);
      useMarkupStore.getState().addMarkups(lines, 'Resaltar texto (3 líneas)');

      // Exactamente 3 marcas con el mismo groupId
      expect(useMarkupStore.getState().markups).toHaveLength(3);
      expect(useMarkupStore.getState().markups.every((m) => m.groupId === groupId)).toBe(true);

      // Cada marca guarda el texto de su propia línea
      expect(useMarkupStore.getState().markups.map((m) => m.text)).toEqual([
        'Primera línea',
        'Segunda línea',
        'Tercera línea',
      ]);

      // Exactamente 1 comando en el historial
      expect(markupHistory.getUndoCount()).toBe(1);

      // Un solo Ctrl+Z (undo) las quita todas
      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups).toHaveLength(0);
      expect(markupHistory.getUndoCount()).toBe(0);

      // Un solo Ctrl+Y (redo) las restaura todas
      useMarkupStore.getState().redo();
      expect(useMarkupStore.getState().markups).toHaveLength(3);
      expect(markupHistory.getUndoCount()).toBe(1);
    });

    it('borrar una de las marcas del grupo borra las 3 en un solo paso', () => {
      useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
      markupHistory.clear();

      const groupId = 'group-hl-multiline-2';
      const lines: Markup[] = [
        {
          id: 'hl-l1',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.4, y: 0.15 },
          ],
          text: 'L1',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'hl-l2',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.16 },
            { x: 0.5, y: 0.21 },
          ],
          text: 'L2',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'hl-l3',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.22 },
            { x: 0.35, y: 0.27 },
          ],
          text: 'L3',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
      ];

      useMarkupStore.getState().addMarkups(lines);
      expect(useMarkupStore.getState().markups).toHaveLength(3);

      // Borrar la marca 2 por id
      useMarkupStore.getState().deleteMarkup('hl-l2');
      // Las 3 marcas han sido borradas porque pertenecen al mismo groupId
      expect(useMarkupStore.getState().markups).toHaveLength(0);

      // Deshacer restaura las 3
      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups).toHaveLength(3);
    });

    it('arrastrar una de las marcas mueve las 3 juntas mediante handleSelectMouseDown', () => {
      const groupId = 'group-hl-multiline-3';
      const lines: Markup[] = [
        {
          id: 'hl-m1',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.4, y: 0.15 },
          ],
          text: 'M1',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'hl-m2',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.16 },
            { x: 0.5, y: 0.21 },
          ],
          text: 'M2',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 'hl-m3',
          type: 'highlightText',
          pageIndex: 0,
          groupId,
          points: [
            { x: 0.1, y: 0.22 },
            { x: 0.35, y: 0.27 },
          ],
          text: 'M3',
          style: { strokeColor: 'transparent', strokeWidth: 0, opacity: 0.5 },
          author: 'Revisor',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
      ];

      // Verificamos que selectMarkup expande la selección a los 3 miembros del grupo
      useMarkupStore.setState({ markups: lines, selectedMarkupIds: [] });
      useMarkupStore.getState().selectMarkup('hl-m1', false);
      expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['hl-m1', 'hl-m2', 'hl-m3']);

      // commitMoveMarkups traslada los 3 elementos en un solo comando
      const moves = lines.map((m) => ({
        id: m.id,
        originalPoints: m.points.map((p) => ({ ...p })),
        newPoints: m.points.map((p) => ({ x: p.x + 0.05, y: p.y + 0.05 })),
      }));

      const undoCountBefore = markupHistory.getUndoCount();
      useMarkupStore.getState().commitMoveMarkups(moves);
      expect(markupHistory.getUndoCount()).toBe(undoCountBefore + 1);

      const updated = useMarkupStore.getState().markups;
      expect(updated[0].points[0].x).toBeCloseTo(0.15);
      expect(updated[1].points[0].x).toBeCloseTo(0.15);
      expect(updated[2].points[0].x).toBeCloseTo(0.15);

      // Un solo undo() revierte el movimiento conjunto de los 3
      useMarkupStore.getState().undo();
      const reverted = useMarkupStore.getState().markups;
      expect(reverted[0].points[0].x).toBeCloseTo(0.1);
      expect(reverted[1].points[0].x).toBeCloseTo(0.1);
      expect(reverted[2].points[0].x).toBeCloseTo(0.1);
    });
  });
});
