import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { saveDocument, saveDocumentAs } from './documentSaveService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';

const savePdfIncremental = vi.fn();
vi.mock('./pdfPersistenceService', () => ({
  savePdfIncremental: (...args: unknown[]) => savePdfIncremental(...args),
}));
const saveBbxForPdf = vi.fn().mockResolvedValue(true);
vi.mock('./bbxPersistenceService', () => ({
  saveBbxForPdf: (...args: unknown[]) => saveBbxForPdf(...args),
}));
const dialogSave = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: (...args: unknown[]) => dialogSave(...args) }));

describe('Guardar y Guardar como (ADR-0028)', () => {
  beforeEach(() => {
    savePdfIncremental.mockReset().mockResolvedValue({ success: true, bytes: new Uint8Array([37, 80, 68, 70]) });
    saveBbxForPdf.mockClear();
    dialogSave.mockReset();
    useDocumentStore.setState({ pdfBytes: new Uint8Array([1, 2]), filePath: null, fileName: 'plano-A1.pdf' });
    useMarkupStore.setState({ isDirty: true });
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('en el navegador, Guardar como genera el PDF con las marcas y lo descarga con el nombre del documento', async () => {
    const created: HTMLAnchorElement[] = [];
    const origCreate = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        created.push(el as HTMLAnchorElement);
        (el as HTMLAnchorElement).click = vi.fn();
      }
      return el;
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    expect(await saveDocumentAs()).toBe(true);
    spy.mockRestore();
    expect(created[0].download).toBe('plano-A1.pdf');
    expect(created[0].click).toHaveBeenCalled();
    expect(useMarkupStore.getState().isDirty).toBe(false);
  });

  it('en la app nativa, Guardar como escribe en la ruta elegida (añade .pdf) y el documento pasa a ser ese archivo', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    dialogSave.mockResolvedValue('C:\\\\obra\\\\plano-A1-revisado');
    expect(await saveDocumentAs()).toBe(true);
    expect(savePdfIncremental.mock.calls[0][0]).toBe('C:\\\\obra\\\\plano-A1-revisado.pdf');
    expect(saveBbxForPdf.mock.calls[0][0]).toBe('C:\\\\obra\\\\plano-A1-revisado.pdf');
    expect(useDocumentStore.getState().filePath).toBe('C:\\\\obra\\\\plano-A1-revisado.pdf');
    expect(useDocumentStore.getState().fileName).toBe('plano-A1-revisado.pdf');
    expect(useMarkupStore.getState().isDirty).toBe(false);
  });

  it('Guardar sin archivo pide la ruta (Guardar como); cancelar no guarda ni marca como guardado', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    dialogSave.mockResolvedValue(null);
    expect(await saveDocument()).toBe(false);
    expect(dialogSave).toHaveBeenCalledTimes(1);
    expect(savePdfIncremental).not.toHaveBeenCalled();
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('si falla la escritura del PDF, el documento sigue con cambios sin guardar', async () => {
    useDocumentStore.setState({ filePath: 'C:\\\\obra\\\\plano.pdf' });
    savePdfIncremental.mockResolvedValue({ success: false });
    expect(await saveDocument()).toBe(false);
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('MenuBar y QuickAccessToolbar cargan documentSaveService de forma diferida sin import estático en el chunk principal (ADR-0070)', () => {
    const root = path.resolve(__dirname, '../..');
    const menuSrc = fs.readFileSync(path.join(root, 'src/components/shell/MenuBar.tsx'), 'utf8');
    const qatSrc = fs.readFileSync(path.join(root, 'src/components/shell/QuickAccessToolbar.tsx'), 'utf8');
    expect(menuSrc).not.toMatch(/import\s+\{[^}]*saveDocumentAs[^}]*\}\s+from\s+['"][^'"]*documentSaveService['"]/);
    expect(qatSrc).not.toMatch(/import\s+\{[^}]*saveDocumentAs[^}]*\}\s+from\s+['"][^'"]*documentSaveService['"]/);
    expect(menuSrc).toMatch(/import\(['"]\.\.\/\.\.\/services\/documentSaveService['"]\)/);
    expect(qatSrc).toMatch(/import\(['"]\.\.\/\.\.\/services\/documentSaveService['"]\)/);
  });
});

