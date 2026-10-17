import { describe, it, expect } from 'vitest';
import { Markup } from '../../types/markup';
import { editableControlPointTarget } from './controlPoints';

/**
 * Selección → miembro editable por puntos de control (ADR-0069). Puro, sin DOM: la capa de selección de
 * PdfViewer.tsx usa esta función para decidir si dibuja los tiradores y sobre qué marca.
 */

const base = (over: Partial<Markup>): Markup => ({
  id: over.id ?? 'm1',
  type: over.type ?? 'cloud',
  pageIndex: 0,
  points: over.points ?? [
    { x: 0.2, y: 0.2 },
    { x: 0.4, y: 0.4 },
  ],
  style: { strokeColor: '#111111', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
  status: 'pending',
  ...over,
});

describe('editableControlPointTarget (ADR-0069)', () => {
  it('selección vacía: sin tiradores', () => {
    expect(editableControlPointTarget([])).toBeNull();
  });

  it('una sola marca seleccionada: se edita esa marca', () => {
    const cloud = base({ id: 'c1', type: 'cloud' });
    expect(editableControlPointTarget([cloud])).toBe(cloud);
    const callout = base({ id: 'o1', type: 'callout' });
    expect(editableControlPointTarget([callout])).toBe(callout);
  });

  it('un grupo cloud+callout seleccionado completo: se edita la nube, no la llamada', () => {
    const cloud = base({ id: 'c1', type: 'cloudPlus', groupId: 'g1' });
    const callout = base({ id: 'o1', type: 'callout', groupId: 'g1' });
    expect(editableControlPointTarget([cloud, callout])).toBe(cloud);
    expect(editableControlPointTarget([callout, cloud])).toBe(cloud);
  });

  it('un grupo con la nube normal: se edita la nube', () => {
    const cloud = base({ id: 'c1', type: 'cloud', groupId: 'g2' });
    const callout = base({ id: 'o1', type: 'callout', groupId: 'g2' });
    expect(editableControlPointTarget([callout, cloud])).toBe(cloud);
  });

  it('selección con dos grupos distintos: sin tiradores', () => {
    const a = base({ id: 'a', type: 'cloudPlus', groupId: 'g1' });
    const b = base({ id: 'b', type: 'cloud', groupId: 'g2' });
    expect(editableControlPointTarget([a, b])).toBeNull();
  });

  it('un grupo más una marca suelta: sin tiradores', () => {
    const cloud = base({ id: 'c1', type: 'cloudPlus', groupId: 'g1' });
    const callout = base({ id: 'o1', type: 'callout', groupId: 'g1' });
    const loose = base({ id: 'x1', type: 'rectangle' });
    expect(editableControlPointTarget([cloud, callout, loose])).toBeNull();
  });

  it('varias marcas sueltas sin grupo: sin tiradores (comportamiento actual)', () => {
    const a = base({ id: 'a', type: 'cloud' });
    const b = base({ id: 'b', type: 'rectangle' });
    expect(editableControlPointTarget([a, b])).toBeNull();
  });

  it('un grupo sin miembro nube: sin tiradores', () => {
    const a = base({ id: 'a', type: 'rectangle', groupId: 'g9' });
    const b = base({ id: 'b', type: 'callout', groupId: 'g9' });
    expect(editableControlPointTarget([a, b])).toBeNull();
  });
});
