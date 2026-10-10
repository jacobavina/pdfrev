import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager, Command } from './command';

describe('HistoryManager (Command Pattern)', () => {
  let history: HistoryManager;
  let counter: number;

  beforeEach(() => {
    history = new HistoryManager(50);
    counter = 0;
  });

  const createIncrementCommand = (value = 1): Command => {
    return {
      description: `Add ${value}`,
      execute: () => {
        counter += value;
      },
      undo: () => {
        counter -= value;
      },
    };
  };

  it('executes and pushes commands correctly', () => {
    history.execute(createIncrementCommand(5));
    expect(counter).toBe(5);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('supports undo and redo cycles', () => {
    history.execute(createIncrementCommand(10));
    expect(counter).toBe(10);

    const undone = history.undo();
    expect(undone).toBe(true);
    expect(counter).toBe(0);
    expect(history.canRedo()).toBe(true);

    const redone = history.redo();
    expect(redone).toBe(true);
    expect(counter).toBe(10);
  });

  it('handles at least 50 steps of undo history correctly', () => {
    const manager = new HistoryManager(50);
    const TOTAL_COMMANDS = 55;

    // Execute 55 consecutive increment commands (+1 each)
    for (let i = 1; i <= TOTAL_COMMANDS; i++) {
      manager.execute(createIncrementCommand(1));
    }

    expect(counter).toBe(TOTAL_COMMANDS);
    // Since capacity is 50, exactly 50 commands should be in the undo stack
    expect(manager.getUndoCount()).toBe(50);

    // Undo 50 times
    for (let i = 0; i < 50; i++) {
      expect(manager.canUndo()).toBe(true);
      manager.undo();
    }

    // Since 5 initial steps were dropped out of the 50-step window:
    // counter should be 55 - 50 = 5.
    expect(counter).toBe(5);
    expect(manager.canUndo()).toBe(false);

    // Redo 50 times back to 55
    for (let i = 0; i < 50; i++) {
      expect(manager.canRedo()).toBe(true);
      manager.redo();
    }

    expect(counter).toBe(55);
    expect(manager.canRedo()).toBe(false);
  });

  it('clears redo stack when a new command is executed after undo', () => {
    history.execute(createIncrementCommand(2));
    history.execute(createIncrementCommand(3));
    expect(counter).toBe(5);

    history.undo(); // back to 2
    expect(counter).toBe(2);
    expect(history.canRedo()).toBe(true);

    // New action should branch history and drop redo
    history.execute(createIncrementCommand(10));
    expect(counter).toBe(12);
    expect(history.canRedo()).toBe(false);
  });

  // TAREA 0.7: HistoryManager.redo() debe aplicar el tope de maxSteps
  it('aplica el tope de maxSteps en redo() y undo(): 60 comandos -> 60 undos -> 60 redos con undoStack.length <= 50 en todo momento', () => {
    const manager = new HistoryManager(50);

    // 1. Ejecutar 60 comandos consecutivos
    for (let i = 1; i <= 60; i++) {
      manager.execute(createIncrementCommand(1));
      expect(manager.getUndoCount()).toBeLessThanOrEqual(50);
    }
    expect(manager.getUndoCount()).toBe(50);

    // 2. Realizar 60 undos consecutivos
    for (let i = 1; i <= 60; i++) {
      manager.undo();
      expect(manager.getUndoCount()).toBeLessThanOrEqual(50);
      expect(manager.getRedoCount()).toBeLessThanOrEqual(50);
    }
    expect(manager.getUndoCount()).toBe(0);
    expect(manager.getRedoCount()).toBe(50);

    // 3. Realizar 60 redos consecutivos
    for (let i = 1; i <= 60; i++) {
      manager.redo();
      expect(manager.getUndoCount()).toBeLessThanOrEqual(50);
      expect(manager.getRedoCount()).toBeLessThanOrEqual(50);
    }
    expect(manager.getUndoCount()).toBe(50);
    expect(manager.getRedoCount()).toBe(0);
  });
});
