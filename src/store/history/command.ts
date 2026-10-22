export interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxSteps: number;

  constructor(maxSteps = 50) {
    this.maxSteps = Math.max(50, maxSteps);
  }

  public execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    // Any new action clears the redo stack
    this.redoStack = [];
  }

  public undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    if (this.redoStack.length > this.maxSteps) {
      this.redoStack.shift();
    }
    return true;
  }

  public redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoCount(): number {
    return this.undoStack.length;
  }

  public getRedoCount(): number {
    return this.redoStack.length;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Descripciones del historial: lo hecho (de la más antigua a la última) y lo rehacible (la próxima en rehacerse primero). */
  public getEntries(): { past: string[]; future: string[] } {
    return {
      past: this.undoStack.map((c) => c.description),
      future: [...this.redoStack].reverse().map((c) => c.description),
    };
  }

  public getStacks(): { undoStack: Command[]; redoStack: Command[] } {
    return { undoStack: [...this.undoStack], redoStack: [...this.redoStack] };
  }

  public setStacks(stacks: { undoStack: Command[]; redoStack: Command[] }): void {
    this.undoStack = [...stacks.undoStack];
    this.redoStack = [...stacks.redoStack];
  }
}
