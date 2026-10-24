import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useUnsavedChangesStore } from '../../services/unsavedChangesService';

export const UnsavedChangesDialog: React.FC = () => {
  const pendingClose = useUnsavedChangesStore((s) => s.pendingClose);
  const cancelClose = useUnsavedChangesStore((s) => s.cancelClose);
  const confirmDiscard = useUnsavedChangesStore((s) => s.confirmDiscard);
  const confirmSave = useUnsavedChangesStore((s) => s.confirmSave);

  useEffect(() => {
    if (!pendingClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingClose, cancelClose]);

  if (!pendingClose) return null;

  const targetName = pendingClose.fileName || 'current document';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unsaved Changes"
      data-testid="unsaved-changes-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none"
    >
      <div className="bg-cad-panel border border-cad-border rounded-lg shadow-float w-full max-w-sm overflow-hidden text-xs flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-cad-border bg-cad-panel/60">
          <AlertCircle size={16} className="text-amber-400" />
          <span className="font-semibold text-cad-strong text-sm">Save Changes</span>
          <button
            type="button"
            onClick={cancelClose}
            title="Close"
            aria-label="Close"
            className="ml-auto p-1 rounded hover:bg-cad-hover text-gray-400 hover:text-gray-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mensaje */}
        <div className="p-4 space-y-2">
          <p className="text-gray-200 text-xs leading-relaxed">
            Do you want to save changes to <span className="font-semibold text-cad-strong">"{targetName}"</span> before closing?
          </p>
          <p className="text-gray-400 text-2xs">
            If you close without saving, any modifications will be permanently lost.
          </p>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-cad-border bg-cad-panel/40">
          <button
            type="button"
            data-testid="unsaved-save-btn"
            onClick={() => void confirmSave()}
            className="ui-btn ui-btn-primary !px-3"
          >
            Save
          </button>
          <button
            type="button"
            data-testid="unsaved-discard-btn"
            onClick={() => void confirmDiscard()}
            className="px-3 py-1.5 rounded text-xs font-medium border border-cad-border bg-cad-subtle hover:bg-red-500/20 hover:text-red-300 text-gray-300 transition-colors"
          >
            Don't Save
          </button>
          <button
            type="button"
            data-testid="unsaved-cancel-btn"
            onClick={cancelClose}
            className="ui-btn !px-3"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
