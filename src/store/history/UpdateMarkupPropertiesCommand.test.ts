import { describe, it, expect, vi } from 'vitest';
import {
  UpdateMarkupPropertiesCommand,
  MarkupPropertyTarget,
} from './UpdateMarkupPropertiesCommand';

describe('UpdateMarkupPropertiesCommand (P2-C.6 / ADR-0012)', () => {
  it('aplica propiedades nuevas al ejecutar y revierte a las anteriores al deshacer', () => {
    const applySpy = vi.fn();

    const targets: MarkupPropertyTarget[] = [
      {
        id: 'mk-1',
        oldProperties: { style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 } },
        newProperties: { style: { strokeColor: '#0055ff', strokeWidth: 4, opacity: 1 } },
      },
      {
        id: 'mk-2',
        oldProperties: { style: { strokeColor: '#00ff00', strokeWidth: 1, opacity: 1 } },
        newProperties: { style: { strokeColor: '#0055ff', strokeWidth: 4, opacity: 1 } },
      },
    ];

    const command = new UpdateMarkupPropertiesCommand(targets, applySpy);

    // Ejecución
    command.execute();
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledWith([
      { id: 'mk-1', properties: { style: { strokeColor: '#0055ff', strokeWidth: 4, opacity: 1 } } },
      { id: 'mk-2', properties: { style: { strokeColor: '#0055ff', strokeWidth: 4, opacity: 1 } } },
    ]);

    // Deshacer (Undo)
    command.undo();
    expect(applySpy).toHaveBeenCalledTimes(2);
    expect(applySpy).toHaveBeenLastCalledWith([
      { id: 'mk-1', properties: { style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 } } },
      { id: 'mk-2', properties: { style: { strokeColor: '#00ff00', strokeWidth: 1, opacity: 1 } } },
    ]);
  });
});
