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

    useMarkupStore.getState().redo();
    expect(useMarkupStore.getState().markups[0].status).toBe('accepted');
  });

  it('Condición 3: el estado de una marca agrupada se aplica a todo el grupo atómicamente y se revierte con undo', () => {
    const m1 = { ...createMockMarkup('m1'), groupId: 'grp-highlight-multiline' };
    const m2 = { ...createMockMarkup('m2'), groupId: 'grp-highlight-multiline' };
    const m3 = { ...createMockMarkup('m3'), groupId: 'grp-highlight-multiline' };
    const mIndependent = createMockMarkup('m-indep');

    useMarkupStore.getState().addMarkup(m1);
    useMarkupStore.getState().addMarkup(m2);
    useMarkupStore.getState().addMarkup(m3);
    useMarkupStore.getState().addMarkup(mIndependent);

    const prevMarkupsRef = useMarkupStore.getState().markups;

    // Actualizar estado de una sola marca del grupo a 'rejected'
    useMarkupStore.getState().updateMarkupStatus('m1', 'rejected');

    const updatedMarkups = useMarkupStore.getState().markups;
    expect(updatedMarkups).not.toBe(prevMarkupsRef);

    // Todos los miembros del grupo ahora son 'rejected'
    expect(updatedMarkups.find((m) => m.id === 'm1')?.status).toBe('rejected');
    expect(updatedMarkups.find((m) => m.id === 'm2')?.status).toBe('rejected');
    expect(updatedMarkups.find((m) => m.id === 'm3')?.status).toBe('rejected');

    // La marca independiente no se ve afectada
    expect(updatedMarkups.find((m) => m.id === 'm-indep')?.status).toBe('pending');
    expect(updatedMarkups.find((m) => m.id === 'm-indep')).toBe(prevMarkupsRef.find((m) => m.id === 'm-indep'));

    // Undo revierte las 3 marcas del grupo en UN SOLO paso
    useMarkupStore.getState().undo();
    const undoneMarkups = useMarkupStore.getState().markups;
    expect(undoneMarkups.find((m) => m.id === 'm1')?.status).toBe('pending');
    expect(undoneMarkups.find((m) => m.id === 'm2')?.status).toBe('pending');
    expect(undoneMarkups.find((m) => m.id === 'm3')?.status).toBe('pending');

    // Redo vuelve a poner las 3 marcas en 'rejected' en UN SOLO paso
    useMarkupStore.getState().redo();
    const redoneMarkups = useMarkupStore.getState().markups;
    expect(redoneMarkups.find((m) => m.id === 'm1')?.status).toBe('rejected');
    expect(redoneMarkups.find((m) => m.id === 'm2')?.status).toBe('rejected');
    expect(redoneMarkups.find((m) => m.id === 'm3')?.status).toBe('rejected');
  });

  it('Condición 3: sincronización atómica con estados iniciales heterogéneos dentro de un grupo', () => {
    // Grupo donde m1 era 'pending' y m2 era 'rejected'
    const m1 = { ...createMockMarkup('m1'), status: 'pending' as const, groupId: 'grp-hetero' };
    const m2 = { ...createMockMarkup('m2'), status: 'rejected' as const, groupId: 'grp-hetero' };

    useMarkupStore.getState().addMarkup(m1);
    useMarkupStore.getState().addMarkup(m2);

    // Cambiar a 'completed'
    useMarkupStore.getState().updateMarkupStatus('m1', 'completed');

    expect(useMarkupStore.getState().markups.find((m) => m.id === 'm1')?.status).toBe('completed');
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'm2')?.status).toBe('completed');

    // Deshacer debe restaurar cada miembro a su estado previo particular
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'm1')?.status).toBe('pending');
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'm2')?.status).toBe('rejected');
  });

  it('guarda de no-op: actualizar al mismo estado no emite comando de historial ni ensucia estado', () => {
    const markup = createMockMarkup('m1'); // status = 'pending'
    useMarkupStore.getState().addMarkup(markup);

    expect(useMarkupStore.getState().canUndo).toBe(true);
    // Llamar con el mismo estado existente
    useMarkupStore.getState().updateMarkupStatus('m1', 'pending');
    expect(useMarkupStore.getState().canUndo).toBe(true);

    // El estado sigue siendo 'pending' y no se apiló comando extra
    expect(useMarkupStore.getState().markups[0].status).toBe('pending');
    // Si sólo había 1 comando previo (addMarkup), deshacerlo debe quitar la marca directamente
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups).toHaveLength(0);
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

  describe('Sub-entregable B.2 / B.3: applyPropertiesToMarkups (Modo Propiedad sobre K marcas)', () => {
    it('aplica propiedades a K > 1 marcas seleccionadas en UN SOLO COMANDO con reversión atómica (Ctrl+Z)', () => {
      const m1 = createMockMarkup('k1', 'Marca 1');
      const m2 = createMockMarkup('k2', 'Marca 2');
      const m3 = createMockMarkup('k3', 'Marca 3');
      const mUnmodified = createMockMarkup('unmod', 'No Seleccionada');

      useMarkupStore.setState({
        markups: [m1, m2, m3, mUnmodified],
        selectedMarkupIds: ['k1', 'k2', 'k3'],
      });

      const oldMarkups = useMarkupStore.getState().markups;
      const oldM1 = oldMarkups[0];
      const oldM2 = oldMarkups[1];
      const oldM3 = oldMarkups[2];
      const oldUnmod = oldMarkups[3];

      const initialUndoCount = markupHistory.getUndoCount();

      // Aplicar nuevo estilo a las 3 marcas seleccionadas (K = 3)
      const newStyle = {
        strokeColor: '#10b981',
        strokeWidth: 5,
        opacity: 0.7,
      };

      useMarkupStore.getState().applyPropertiesToMarkups(
        ['k1', 'k2', 'k3'],
        { style: newStyle }
      );

      // Verificación 1: UN SOLO COMANDO registrado en el historial
      expect(markupHistory.getUndoCount()).toBe(initialUndoCount + 1);

      const updatedMarkups = useMarkupStore.getState().markups;

      // Verificación 2: INMUTABILIDAD DEMOSTRADA
      expect(updatedMarkups).not.toBe(oldMarkups);
      expect(updatedMarkups[0]).not.toBe(oldM1);
      expect(updatedMarkups[1]).not.toBe(oldM2);
      expect(updatedMarkups[2]).not.toBe(oldM3);
      // La marca no modificada retiene exactamente su identidad de referencia
      expect(updatedMarkups[3]).toBe(oldUnmod);
      // El array previo no fue alterado
      expect(oldM1.style.strokeColor).toBe('#ff0000');
      expect(oldM1.style.strokeWidth).toBe(2);

      // Verificación 3: Las 3 marcas tienen el nuevo estilo aplicado
      expect(updatedMarkups[0].style.strokeColor).toBe('#10b981');
      expect(updatedMarkups[0].style.strokeWidth).toBe(5);
      expect(updatedMarkups[1].style.strokeColor).toBe('#10b981');
      expect(updatedMarkups[2].style.strokeColor).toBe('#10b981');

      // Verificación 4: UN SOLO undo() revierte las K = 3 marcas a sus estilos originales
      useMarkupStore.getState().undo();

      const revertedMarkups = useMarkupStore.getState().markups;
      expect(markupHistory.getUndoCount()).toBe(initialUndoCount);
      expect(revertedMarkups[0].style.strokeColor).toBe('#ff0000');
      expect(revertedMarkups[0].style.strokeWidth).toBe(2);
      expect(revertedMarkups[1].style.strokeColor).toBe('#ff0000');
      expect(revertedMarkups[2].style.strokeColor).toBe('#ff0000');

      // Verificación 5: redo() las vuelve a modificar juntas
      useMarkupStore.getState().redo();
      const redoneMarkups = useMarkupStore.getState().markups;
      expect(redoneMarkups[0].style.strokeColor).toBe('#10b981');
      expect(redoneMarkups[1].style.strokeColor).toBe('#10b981');
      expect(redoneMarkups[2].style.strokeColor).toBe('#10b981');
    });

    it('no genera comando si los valores de propiedades son idénticos a los existentes', () => {
      const m1 = createMockMarkup('k1', 'Marca Idéntica');
      useMarkupStore.setState({ markups: [m1], selectedMarkupIds: ['k1'] });

      const initialUndoCount = markupHistory.getUndoCount();

      // Aplicar exactamente el mismo estilo
      useMarkupStore.getState().applyPropertiesToMarkups(['k1'], {
        style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      });

      // No debe agregar pasos al historial
      expect(markupHistory.getUndoCount()).toBe(initialUndoCount);
    });
  });

  describe('Paquete 3: Portapapeles y Bloqueo de Marcas', () => {
    it('copySelectedMarkups copia las marcas seleccionadas al portapapeles interno', () => {
      const m1 = createMockMarkup('m1', 'Marca 1');
      const m2 = createMockMarkup('m2', 'Marca 2');
      useMarkupStore.setState({ markups: [m1, m2], selectedMarkupIds: ['m1'] });

      useMarkupStore.getState().copySelectedMarkups();
      const clipboard = useMarkupStore.getState().clipboardMarkups;
      expect(clipboard).toHaveLength(1);
      expect(clipboard[0].id).toBe('m1');
    });

    it('pasteMarkups clona marcas con nuevos IDs, offset y selecciona las nuevas', () => {
      const m1 = createMockMarkup('m1', 'Marca 1');
      useMarkupStore.setState({ markups: [m1], selectedMarkupIds: ['m1'] });

      useMarkupStore.getState().copySelectedMarkups();
      useMarkupStore.getState().pasteMarkups(0);

      const state = useMarkupStore.getState();
      expect(state.markups).toHaveLength(2);
      const pasted = state.markups.find((m) => m.id !== 'm1')!;
      expect(pasted).toBeDefined();
      expect(pasted.id).not.toBe('m1');
      expect(pasted.points[0].x).toBeCloseTo(0.12); // 0.1 + 0.02
      expect(pasted.points[0].y).toBeCloseTo(0.12); // 0.1 + 0.02
      expect(state.selectedMarkupIds).toEqual([pasted.id]);

      // Undo elimina la marca pegada
      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups).toHaveLength(1);
    });

    it('pasteMarkups preserva relaciones de grupo con nuevo groupId único', () => {
      const m1 = { ...createMockMarkup('m1'), groupId: 'grp-orig' };
      const m2 = { ...createMockMarkup('m2'), groupId: 'grp-orig' };
      useMarkupStore.setState({ markups: [m1, m2], selectedMarkupIds: ['m1', 'm2'] });

      useMarkupStore.getState().copySelectedMarkups();
      useMarkupStore.getState().pasteMarkups(1);

      const state = useMarkupStore.getState();
      expect(state.markups).toHaveLength(4);
      const pasted = state.markups.filter((m) => m.pageIndex === 1);
      expect(pasted).toHaveLength(2);
      expect(pasted[0].groupId).toBeDefined();
      expect(pasted[0].groupId).not.toBe('grp-orig');
      expect(pasted[0].groupId).toBe(pasted[1].groupId);
    });

    it('duplicateSelectedMarkups clona inmediatamente sin requerir copy previo', () => {
      const m1 = createMockMarkup('m1', 'Duplicar');
      useMarkupStore.setState({ markups: [m1], selectedMarkupIds: ['m1'] });

      useMarkupStore.getState().duplicateSelectedMarkups();
      const state = useMarkupStore.getState();
      expect(state.markups).toHaveLength(2);
      const dup = state.markups.find((m) => m.id !== 'm1')!;
      expect(dup.id).not.toBe('m1');
      expect(dup.text).toBe('Duplicar');
    });

    it('toggleLockSelectedMarkups conmuta propiedad locked y genera comando undoable', () => {
      const m1 = createMockMarkup('m1', 'Bloquear');
      useMarkupStore.setState({ markups: [m1], selectedMarkupIds: ['m1'] });

      useMarkupStore.getState().toggleLockSelectedMarkups();
      expect(useMarkupStore.getState().markups[0].locked).toBe(true);

      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups[0].locked).toBeFalsy();

      useMarkupStore.getState().redo();
      expect(useMarkupStore.getState().markups[0].locked).toBe(true);
    });

    it('marcas bloqueadas quedan protegidas contra borrado, movimiento y actualización de propiedades', () => {
      const mLocked: Markup = { ...createMockMarkup('m-lock', 'Protegida'), locked: true };
      const mUnlocked: Markup = createMockMarkup('m-free', 'Libre');
      useMarkupStore.setState({
        markups: [mLocked, mUnlocked],
        selectedMarkupIds: ['m-lock', 'm-free'],
      });

      // 1. Intentar borrar mLocked directamente
      useMarkupStore.getState().deleteMarkup('m-lock');
      expect(useMarkupStore.getState().markups.some((m) => m.id === 'm-lock')).toBe(true);

      // 2. Intentar deleteSelectedMarkups: solo borra m-free
      useMarkupStore.getState().deleteSelectedMarkups();
      const current = useMarkupStore.getState().markups;
      expect(current.some((m) => m.id === 'm-lock')).toBe(true);
      expect(current.some((m) => m.id === 'm-free')).toBe(false);

      // 3. Intentar commitMoveMarkups en m-lock
      useMarkupStore.getState().commitMoveMarkups([
        {
          id: 'm-lock',
          originalPoints: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
          newPoints: [{ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.7 }],
        },
      ]);
      const afterMove = useMarkupStore.getState().markups.find((m) => m.id === 'm-lock')!;
      expect(afterMove.points[0].x).toBe(0.1);

      // 4. Intentar applyPropertiesToMarkups en m-lock
      useMarkupStore.getState().applyPropertiesToMarkups(['m-lock'], {
        style: { strokeColor: '#00ff00', strokeWidth: 10 },
      });
      const afterProp = useMarkupStore.getState().markups.find((m) => m.id === 'm-lock')!;
      expect(afterProp.style.strokeColor).toBe('#ff0000');
    });

    it('reordena marcas seleccionadas en el orden Z (front, back, forward, backward) con undo atómico y protege bloqueadas', () => {
      const m1 = createMockMarkup('m1', 'Uno');
      const m2 = createMockMarkup('m2', 'Dos');
      const m3 = createMockMarkup('m3', 'Tres');
      useMarkupStore.setState({
        markups: [m1, m2, m3],
        selectedMarkupIds: ['m1'],
      });

      // 1. Traer al frente (front): m1 pasa al final [m2, m3, m1]
      useMarkupStore.getState().reorderSelectedMarkups('front');
      expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['m2', 'm3', 'm1']);

      // 2. Deshacer
      useMarkupStore.getState().undo();
      expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

      // 3. Avanzar un paso (forward): m1 avanza una posición con m2 -> [m2, m1, m3]
      useMarkupStore.getState().reorderSelectedMarkups('forward');
      expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['m2', 'm1', 'm3']);

      // 4. Retroceder un paso (backward): m1 vuelve a la primera posición -> [m1, m2, m3]
      useMarkupStore.getState().reorderSelectedMarkups('backward');
      expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

      // 5. Enviar al fondo (back): seleccionamos m3 y lo enviamos al fondo -> [m3, m1, m2]
      useMarkupStore.setState({ selectedMarkupIds: ['m3'] });
      useMarkupStore.getState().reorderSelectedMarkups('back');
      expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['m3', 'm1', 'm2']);

      // 6. Proteger marcas bloqueadas: si m3 está bloqueada, no se reordena
      const m3Locked: Markup = { ...m3, locked: true };
      useMarkupStore.setState({
        markups: [m3Locked, m1, m2],
        selectedMarkupIds: ['m3'],
      });
      useMarkupStore.getState().reorderSelectedMarkups('front');
      expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['m3', 'm1', 'm2']);
    });
  });
});

