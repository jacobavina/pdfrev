import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager } from './command';
import { UpdateMarkupStatusCommand, MarkupStatusTarget } from './UpdateMarkupStatusCommand';
import { MarkupStatus } from '../../types/markup';

describe('UpdateMarkupStatusCommand', () => {
  let history: HistoryManager;
  let statusMap: Map<string, MarkupStatus>;

  beforeEach(() => {
    history = new HistoryManager(50);
    statusMap = new Map();
  });

  const applyStatus = (updates: { id: string; status: MarkupStatus }[]) => {
    for (const u of updates) {
      statusMap.set(u.id, u.status);
    }
  };

  it('actualiza una única marca y permite revertirla con undo', () => {
    statusMap.set('m1', 'pending');
    const targets: MarkupStatusTarget[] = [{ id: 'm1', previousStatus: 'pending' }];

    const cmd = new UpdateMarkupStatusCommand(targets, 'accepted', applyStatus);
    history.execute(cmd);

    expect(statusMap.get('m1')).toBe('accepted');
    expect(cmd.description).toBe('Cambiar estado a accepted');
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(statusMap.get('m1')).toBe('pending');
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(statusMap.get('m1')).toBe('accepted');
  });

  it('actualiza un grupo de marcas atómicamente y revierte a sus estados previos individuales', () => {
    // Grupo heterogéneo
    statusMap.set('m1', 'pending');
    statusMap.set('m2', 'rejected');
    statusMap.set('m3', 'accepted');

    const targets: MarkupStatusTarget[] = [
      { id: 'm1', previousStatus: 'pending' },
      { id: 'm2', previousStatus: 'rejected' },
      { id: 'm3', previousStatus: 'accepted' },
    ];

    const cmd = new UpdateMarkupStatusCommand(targets, 'completed', applyStatus);
    history.execute(cmd);

    // Todas pasan a completed
    expect(statusMap.get('m1')).toBe('completed');
    expect(statusMap.get('m2')).toBe('completed');
    expect(statusMap.get('m3')).toBe('completed');
    expect(cmd.description).toBe('Cambiar estado de 3 marcas a completed');

    // Deshacer revierte cada una a su estado previo correspondiente
    history.undo();
    expect(statusMap.get('m1')).toBe('pending');
    expect(statusMap.get('m2')).toBe('rejected');
    expect(statusMap.get('m3')).toBe('accepted');

    // Rehacer vuelve a poner todas en completed
    history.redo();
    expect(statusMap.get('m1')).toBe('completed');
    expect(statusMap.get('m2')).toBe('completed');
    expect(statusMap.get('m3')).toBe('completed');
  });

  it('admite descripción personalizada si se proporciona', () => {
    const targets: MarkupStatusTarget[] = [{ id: 'm1', previousStatus: 'pending' }];
    const cmd = new UpdateMarkupStatusCommand(
      targets,
      'cancelled',
      applyStatus,
      'Descartar marca técnica'
    );
    expect(cmd.description).toBe('Descartar marca técnica');
  });
});
