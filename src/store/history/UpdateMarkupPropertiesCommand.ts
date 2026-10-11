import { Command } from './command';
import { Markup } from '../../types/markup';

export interface MarkupPropertyTarget {
  id: string;
  oldProperties: Partial<Markup>;
  newProperties: Partial<Markup>;
}

/**
 * Comando atómico y reversible para la actualización de propiedades de una o múltiples marcas.
 * Utilizado por el Inspector de Propiedades (P2-C.6 / ADR-0012).
 */
export class UpdateMarkupPropertiesCommand implements Command {
  readonly description: string;
  readonly targets: MarkupPropertyTarget[];
  private readonly applyProperties: (updates: { id: string; properties: Partial<Markup> }[]) => void;

  constructor(
    targets: MarkupPropertyTarget[],
    applyProperties: (updates: { id: string; properties: Partial<Markup> }[]) => void,
    description?: string
  ) {
    this.targets = targets;
    this.applyProperties = applyProperties;
    this.description =
      description ||
      (targets.length > 1
        ? `Modificar propiedades de ${targets.length} marcas`
        : 'Modificar propiedades de marca');
  }

  execute(): void {
    this.applyProperties(
      this.targets.map((t) => ({
        id: t.id,
        properties: t.newProperties,
      }))
    );
  }

  undo(): void {
    this.applyProperties(
      this.targets.map((t) => ({
        id: t.id,
        properties: t.oldProperties,
      }))
    );
  }
}
