import React from 'react';
import { FolderOpen, Save, SaveAll, FileDown, Undo2, Redo2 } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { openPdfDialog } from '../../services/fileDialogService';
import { useAutoSave } from '../../hooks/useAutoSave';
import { exportFlattenedPdf } from './appActions';

/** Botón de icono compacto de la barra de acceso rápido. */
const QuickButton: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  children: React.ReactNode;
}> = ({ title, onClick, disabled, testId, children }) => (
  <button
    type="button"
    data-testid={testId}
    title={title}
    aria-label={title}
    onClick={onClick}
    disabled={disabled}
    className="relative w-[26px] h-[26px] rounded-md flex items-center justify-center text-gray-300 hover:text-cad-strong hover:bg-cad-hover transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);

const Divider = () => <span className="w-px h-4 bg-cad-border mx-1" aria-hidden="true" />;

/**
 * Barra de acceso rápido (ADR-0034), como la de Revu: abrir, guardar, guardar como, deshacer, rehacer y exportar
 * en iconos pequeños junto a los menús, en lugar de los botones grandes de la cinta. Un punto ámbar sobre Guardar
 * indica cambios pendientes.
 */
export const QuickAccessToolbar: React.FC = () => {
  const { filePath, pdfBytes } = useDocumentStore();
  const { canUndo, canRedo, undo, redo, isDirty } = useMarkupStore();
  const { saveNow } = useAutoSave(0);
  return (
    <div data-testid="quick-access-toolbar" className="flex items-center pl-2 ml-1 border-l border-cad-border shrink-0">
      <QuickButton title="Open a PDF file from disk (Ctrl+O)" onClick={openPdfDialog} testId="open-button">
        <FolderOpen size={16} />
      </QuickButton>
      <QuickButton
        testId="save-button"
        title={
          !filePath
            ? 'Save the document as a PDF with its markups (Ctrl+S / Ctrl+Shift+S)'
            : isDirty
            ? 'Save markups to the PDF (Ctrl+S). Autosave every 30 s only writes the .bbx.json recovery copy'
            : 'Save (no pending changes) · Save As: Ctrl+Shift+S'
        }
        onClick={() => saveNow()}
        disabled={!pdfBytes}
      >
        <Save size={16} />
        {isDirty && (
          <span data-testid="save-dirty-dot" className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
        )}
      </QuickButton>
      <QuickButton
        testId="save-as-button"
        title="Save a copy of the document with its markups as a new PDF (Ctrl+Shift+S)"
        onClick={() => void import('../../services/documentSaveService').then((m) => m.saveDocumentAs())}
        disabled={!pdfBytes}
      >
        <SaveAll size={16} />
      </QuickButton>
      <Divider />
      <QuickButton title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} testId="undo-button">
        <Undo2 size={16} />
      </QuickButton>
      <QuickButton title="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo} testId="redo-button">
        <Redo2 size={16} />
      </QuickButton>
      <Divider />
      <QuickButton
        title="Export a vector PDF with flattened markups"
        onClick={exportFlattenedPdf}
        disabled={!pdfBytes}
        testId="export-button"
      >
        <FileDown size={16} />
      </QuickButton>
    </div>
  );
};
