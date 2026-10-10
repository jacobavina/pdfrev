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
});
