import type { Markup } from '../../types/markup';

/**
 * Panel lateral que se abre solo al seleccionar marcas (ADR-0043), como la barra de propiedades de Revu: las
 * mediciones abren Measure (escala, texto del valor, profundidad) y todo lo demás abre Properties (estilo, texto,
 * flecha, borde...). Sin selección no se abre nada.
 */
export type SelectionPanel = 'properties' | 'measure';

export function panelForSelection(selected: Pick<Markup, 'type' | 'measurement'>[]): SelectionPanel | null {
  if (selected.length === 0) return null;
  return selected.every((m) => m.measurement !== undefined) ? 'measure' : 'properties';
}
