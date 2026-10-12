import { Command } from './command';
import { MarkupStatus } from '../../types/markup';

export interface MarkupStatusTarget {
  id: string;
  previousStatus: MarkupStatus;
}

/**
 * Comando atómico y reversible para actualización de estados técnicos de marcas.
 * Soporta actualización conjunta de grupos (Condición 3) o marcas multiseleccionadas.
 */
export class UpdateMarkupStatusCommand implements Command {
  readonly description: string;
  readonly targets: MarkupStatusTarget[];
  readonly newStatus: MarkupStatus;
  private readonly applyStatus: (updates: { id: string; status: MarkupStatus }[]) => void;

  constructor(
    targets: MarkupStatusTarget[],
    newStatus: MarkupStatus,
    applyStatus: (updates: { id: string; status: MarkupStatus }[]) => void,
    description?: string
  ) {
    this.targets = targets;
    this.newStatus = newStatus;
    this.applyStatus = applyStatus;
    this.description =
      description ||
      (targets.length > 1
        ? `Set status of ${targets.length} markups to ${newStatus}`
        : `Set status to ${newStatus}`);
  }

  execute(): void {
    this.applyStatus(this.targets.map((t) => ({ id: t.id, status: this.newStatus })));
  }

  undo(): void {
    this.applyStatus(this.targets.map((t) => ({ id: t.id, status: t.previousStatus })));
  }
}
