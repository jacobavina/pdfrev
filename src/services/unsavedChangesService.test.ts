import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasAnyUnsavedChanges,
  useUnsavedChangesStore,
} from './unsavedChangesService';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useDocumentTabsStore } from '../store/useDocumentTabsStore';
import * as documentSaveService from './documentSaveService';

describe('unsavedChangesService', () => {
  beforeEach(() => {
    useUnsavedChangesStore.setState({ pendingClose: null });
    useMarkupStore.setState({ isDirty: false, markups: [] });
    useDocumentStore.setState({
      pdfBytes: null,
      fileName: null,
      filePath: null,
    });
    useDocumentTabsStore.setState({ tabs: [], activeTabId: null });
    vi.restoreAllMocks();
  });

  describe('hasAnyUnsavedChanges', () => {
    it('devuelve false cuando no hay documento ni pestañas con cambios', () => {
      expect(hasAnyUnsavedChanges()).toBe(false);
    });

    it('devuelve true si el documento activo tiene cambios no guardados', () => {
      useDocumentStore.setState({ pdfBytes: new Uint8Array([1, 2, 3]), fileName: 'plan.pdf' });
      useMarkupStore.setState({ isDirty: true });
      expect(hasAnyUnsavedChanges()).toBe(true);
    });

    it('devuelve true si una pestaña en segundo plano tiene isDirty === true', () => {
      useDocumentTabsStore.setState({
        tabs: [
          {
            id: 'tab-1',
            fileName: 'arch_elevation.pdf',
            filePath: 'C:/arch_elevation.pdf',
            isDirty: true,
          } as any,
        ],
        activeTabId: null,
      });

      expect(hasAnyUnsavedChanges()).toBe(true);
    });
  });

  describe('requestAppClose', () => {
    it('devuelve false y no abre modal si todo está limpio', () => {
      const modalOpened = useUnsavedChangesStore.getState().requestAppClose();
      expect(modalOpened).toBe(false);
      expect(useUnsavedChangesStore.getState().pendingClose).toBeNull();
    });

    it('devuelve true y registra pendingClose app cuando hay cambios sin guardar', () => {
      useDocumentStore.setState({ pdfBytes: new Uint8Array([1]), fileName: 'takeoff.pdf' });
      useMarkupStore.setState({ isDirty: true });

      const modalOpened = useUnsavedChangesStore.getState().requestAppClose();
      expect(modalOpened).toBe(true);
      expect(useUnsavedChangesStore.getState().pendingClose).toEqual({
        type: 'app',
        fileName: 'takeoff.pdf',
      });
    });
  });

  describe('requestTabClose', () => {
    it('cierra la pestaña directamente sin modal si no tiene cambios pendientes', () => {
      const closeTabSpy = vi.spyOn(useDocumentTabsStore.getState(), 'closeTab');
      useDocumentTabsStore.setState({
        tabs: [
          {
            id: 'tab-clean',
            fileName: 'clean.pdf',
            filePath: 'C:/clean.pdf',
            isDirty: false,
          } as any,
        ],
        activeTabId: 'tab-clean',
      });

      const modalOpened = useUnsavedChangesStore.getState().requestTabClose('tab-clean');
      expect(modalOpened).toBe(false);
      expect(useUnsavedChangesStore.getState().pendingClose).toBeNull();
      expect(closeTabSpy).toHaveBeenCalledWith('tab-clean');
    });

    it('intercepta el cierre y abre modal si la pestaña tiene cambios pendientes', () => {
      useDocumentTabsStore.setState({
        tabs: [
          {
            id: 'tab-modified',
            fileName: 'modified.pdf',
            filePath: 'C:/modified.pdf',
            isDirty: true,
          } as any,
        ],
        activeTabId: 'tab-other',
      });

      const modalOpened = useUnsavedChangesStore.getState().requestTabClose('tab-modified');
      expect(modalOpened).toBe(true);
      expect(useUnsavedChangesStore.getState().pendingClose).toEqual({
        type: 'tab',
        tabId: 'tab-modified',
        fileName: 'modified.pdf',
      });
    });
  });

  describe('confirmDiscard y confirmSave', () => {
    it('confirmDiscard cierra la pestaña pendiente y limpia el estado', async () => {
      const closeSpy = vi.spyOn(useDocumentTabsStore.getState(), 'closeTab');
      useUnsavedChangesStore.setState({
        pendingClose: { type: 'tab', tabId: 'tab-x', fileName: 'draft.pdf' },
      });

      await useUnsavedChangesStore.getState().confirmDiscard();
      expect(closeSpy).toHaveBeenCalledWith('tab-x');
      expect(useUnsavedChangesStore.getState().pendingClose).toBeNull();
    });

    it('confirmSave no cierra si saveDocument devuelve false', async () => {
      vi.spyOn(documentSaveService, 'saveDocument').mockResolvedValue(false);
      const closeSpy = vi.spyOn(useDocumentTabsStore.getState(), 'closeTab');
      useUnsavedChangesStore.setState({
        pendingClose: { type: 'tab', tabId: 'tab-y', fileName: 'draft.pdf' },
      });

      const saved = await useUnsavedChangesStore.getState().confirmSave();
      expect(saved).toBe(false);
      expect(closeSpy).not.toHaveBeenCalled();
      expect(useUnsavedChangesStore.getState().pendingClose).not.toBeNull();
    });

    it('confirmSave cierra la pestaña si saveDocument devuelve true', async () => {
      vi.spyOn(documentSaveService, 'saveDocument').mockResolvedValue(true);
      const closeSpy = vi.spyOn(useDocumentTabsStore.getState(), 'closeTab');
      useUnsavedChangesStore.setState({
        pendingClose: { type: 'tab', tabId: 'tab-z', fileName: 'saved.pdf' },
      });

      const saved = await useUnsavedChangesStore.getState().confirmSave();
      expect(saved).toBe(true);
      expect(closeSpy).toHaveBeenCalledWith('tab-z');
      expect(useUnsavedChangesStore.getState().pendingClose).toBeNull();
    });

    it('al cerrar la app con múltiples pestañas sucias, confirmSave guarda y conmuta a la siguiente pestaña sucia', async () => {
      vi.spyOn(documentSaveService, 'saveDocument').mockResolvedValue(true);
      const switchTabSpy = vi.spyOn(useDocumentTabsStore.getState(), 'switchTab').mockImplementation(() => {});

      useDocumentTabsStore.setState({
        tabs: [
          { id: 'tab-1', fileName: 'doc1.pdf', isDirty: true } as any,
          { id: 'tab-2', fileName: 'doc2.pdf', isDirty: true } as any,
        ],
        activeTabId: 'tab-1',
      });

      useUnsavedChangesStore.setState({
        pendingClose: { type: 'app', fileName: 'doc1.pdf' },
      });

      await useUnsavedChangesStore.getState().confirmSave();

      expect(switchTabSpy).toHaveBeenCalledWith('tab-2');
      expect(useUnsavedChangesStore.getState().pendingClose).toEqual({
        type: 'app',
        fileName: 'doc2.pdf',
      });
    });
  });
});
