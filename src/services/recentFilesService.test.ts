import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getRecentFiles,
  addRecentFile,
  removeRecentFile,
  clearRecentFiles,
  subscribeRecentFiles,
} from './recentFilesService';

describe('recentFilesService (ADR-0087: Archivos Recientes)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRecentFiles();
    vi.restoreAllMocks();
  });

  it('Sub-entregable C.6: Persistencia, deduplicación a 10 elementos y recuperación ante almacenamiento corrupto', () => {
    // 1. Estado inicial vacío
    expect(getRecentFiles()).toEqual([]);

    // 2. Adición y persistencia en localStorage
    addRecentFile({ path: '/docs/plan-A101.pdf', name: 'plan-A101.pdf', pageCount: 12 });
    let recents = getRecentFiles();
    expect(recents).toHaveLength(1);
    expect(recents[0].name).toBe('plan-A101.pdf');
    expect(recents[0].pageCount).toBe(12);
    expect(recents[0].lastOpened).toBeDefined();

    // 3. Deduplicación: reabrir el mismo archivo lo sube a la primera posición
    addRecentFile({ path: '/docs/spec-B200.pdf', name: 'spec-B200.pdf', pageCount: 4 });
    addRecentFile({ path: '/docs/plan-A101.pdf', name: 'plan-A101.pdf', pageCount: 15 });
    recents = getRecentFiles();
    expect(recents).toHaveLength(2);
    expect(recents[0].path).toBe('/docs/plan-A101.pdf');
    expect(recents[0].pageCount).toBe(15);
    expect(recents[1].path).toBe('/docs/spec-B200.pdf');

    // 4. Límite de 10 elementos: añadir 11 poda el más antiguo
    for (let i = 1; i <= 10; i++) {
      addRecentFile({ path: `/docs/sheet-${i}.pdf`, name: `sheet-${i}.pdf` });
    }
    recents = getRecentFiles();
    expect(recents).toHaveLength(10);
    expect(recents[0].path).toBe('/docs/sheet-10.pdf');
    // El más antiguo (/docs/spec-B200.pdf) debió ser podado
    expect(recents.some((r) => r.path === '/docs/spec-B200.pdf')).toBe(false);

    // 5. Recuperación ante almacenamiento corrupto en localStorage
    localStorage.setItem('rea:recent-files', '{ invalid-json');
    expect(getRecentFiles()).toEqual([]);
  });

  it('permite eliminar un elemento individualmente con removeRecentFile', () => {
    addRecentFile({ path: '/p1.pdf', name: 'p1.pdf' });
    addRecentFile({ path: '/p2.pdf', name: 'p2.pdf' });
    expect(getRecentFiles()).toHaveLength(2);

    removeRecentFile('/p1.pdf');
    const recents = getRecentFiles();
    expect(recents).toHaveLength(1);
    expect(recents[0].path).toBe('/p2.pdf');
  });

  it('limpia todos los elementos con clearRecentFiles', () => {
    addRecentFile({ path: '/p1.pdf', name: 'p1.pdf' });
    addRecentFile({ path: '/p2.pdf', name: 'p2.pdf' });
    expect(getRecentFiles()).toHaveLength(2);

    clearRecentFiles();
    expect(getRecentFiles()).toEqual([]);
  });

  it('notifica a los suscriptores cuando cambia la lista de archivos recientes', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeRecentFiles(subscriber);

    addRecentFile({ path: '/p1.pdf', name: 'p1.pdf' });
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ path: '/p1.pdf' })])
    );

    removeRecentFile('/p1.pdf');
    expect(subscriber).toHaveBeenCalledTimes(2);

    unsubscribe();
    addRecentFile({ path: '/p2.pdf', name: 'p2.pdf' });
    expect(subscriber).toHaveBeenCalledTimes(2); // no vuelve a llamarse tras desuscribirse
  });

  it('degrada con elegancia a memoria si localStorage.setItem arroja error (ej. cuota excedida o privado)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    addRecentFile({ path: '/fallback.pdf', name: 'fallback.pdf' });
    const recents = getRecentFiles();
    expect(recents).toHaveLength(1);
    expect(recents[0].path).toBe('/fallback.pdf');
  });
});
