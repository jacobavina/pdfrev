import { describe, it, expect } from 'vitest';
import { HistoryManager } from './command';
import { UpdateMarkupCustomFieldCommand } from './UpdateMarkupCustomFieldCommand';

describe('UpdateMarkupCustomFieldCommand', () => {
  it('ejecuta y deshace la edición de un campo personalizado atómicamente', () => {
    const history = new HistoryManager(10);
    const storeState: Record<string, string | number | undefined> = {
      largo: 10,
    };

    const applyValue = (
      _markupId: string,
      columnId: string,
      val: string | number | undefined
    ) => {
      storeState[columnId] = val;
    };

    const cmd = new UpdateMarkupCustomFieldCommand(
      'm-1',
      'largo',
      10,
      25.5,
      applyValue
    );

    history.execute(cmd);
    expect(storeState.largo).toBe(25.5);
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(storeState.largo).toBe(10);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(storeState.largo).toBe(25.5);
  });
});
