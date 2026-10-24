import React, { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { parseExpression } from '../../core/columns/parser';
import {
  BbxCustomColumn,
  BbxCustomColumnType,
  CANONICAL_CUSTOM_COLUMN_TYPES,
} from '../../types/markup';

export interface CustomColumnsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddColumn: (col: BbxCustomColumn) => void;
  columnToDelete: BbxCustomColumn | null;
  onCancelDelete: () => void;
  onConfirmDelete: (colId: string) => void;
  existingColumns?: BbxCustomColumn[];
}

export const CustomColumnsDialog: React.FC<CustomColumnsDialogProps> = ({
  isOpen,
  onClose,
  onAddColumn,
  columnToDelete,
  onCancelDelete,
  onConfirmDelete,
  existingColumns = [],
}) => {
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<BbxCustomColumnType>('text');
  const [newColOptions, setNewColOptions] = useState('');
  const [newColExpr, setNewColExpr] = useState('');

  const formulaValidation = useMemo(() => {
    if (newColType !== 'formula') return { ok: true, message: '' };
    const trimmed = newColExpr.trim();
    if (!trimmed) {
      return { ok: false, message: 'Expression cannot be empty' };
    }
    const res = parseExpression(trimmed);
    if (!res.ok) {
      return { ok: false, message: res.message };
    }
    return { ok: true, message: 'Expression is syntactically valid' };
  }, [newColType, newColExpr]);

  const handleCreateColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newColName.trim();
    if (!trimmedName) return;

    if (newColType === 'formula' && !formulaValidation.ok) {
      return;
    }

    const slug =
      trimmedName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 30) || 'col';

    const baseId = slug;
    let id = baseId;
    let counter = 1;
    while (existingColumns.some((c) => c.id === id)) {
      counter++;
      id = `${baseId}_${counter}`;
    }

    let opciones: string[] | undefined;
    if (newColType === 'choice') {
      opciones = newColOptions
        .split(',')
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);
    }

    const newCol: BbxCustomColumn = {
      id,
      nombre: trimmedName,
      tipo: newColType,
      opciones: opciones && opciones.length > 0 ? opciones : undefined,
      expresion: newColType === 'formula' ? newColExpr.trim() : undefined,
    };

    onAddColumn(newCol);
    onClose();
    setNewColName('');
    setNewColType('text');
    setNewColOptions('');
    setNewColExpr('');
  };

  const handleClose = () => {
    onClose();
    setNewColName('');
    setNewColType('text');
    setNewColOptions('');
    setNewColExpr('');
  };

  return (
    <>
      {/* Modal para Crear Columna Personalizada (P2-C.3) */}
      {isOpen && (
        <div
          data-testid="add-column-modal"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <div
            className="bg-cad-panel border border-cad-border rounded-xl shadow-float w-full max-w-md p-5 text-xs text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-cad-strong mb-3">
              Create Custom Column
            </h3>
            <form onSubmit={handleCreateColumn} className="space-y-3">
              <div>
                <label className="block text-gray-400 mb-1 font-medium">
                  Column name
                </label>
                <input
                  type="text"
                  data-testid="column-name-input"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. Length, Estimated cost, Category..."
                  required
                  className="w-full ui-input"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">
                  Column type
                </label>
                <select
                  data-testid="column-type-select"
                  value={newColType}
                  onChange={(e) =>
                    setNewColType(e.target.value as BbxCustomColumnType)
                  }
                  className="w-full ui-input"
                >
                  {CANONICAL_CUSTOM_COLUMN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'text' && 'Text (text)'}
                      {t === 'number' && 'Number (number)'}
                      {t === 'choice' && 'Choice / Dropdown (choice)'}
                      {t === 'formula' && 'Calculated / Formula (formula)'}
                    </option>
                  ))}
                </select>
              </div>

              {newColType === 'choice' && (
                <div>
                  <label className="block text-gray-400 mb-1 font-medium">
                    Opciones (separadas por comas)
                  </label>
                  <input
                    type="text"
                    data-testid="column-options-input"
                    value={newColOptions}
                    onChange={(e) => setNewColOptions(e.target.value)}
                    placeholder="ej. Alta, Media, Baja"
                    className="w-full ui-input"
                  />
                </div>
              )}

              {newColType === 'formula' && (
                <div>
                  <label className="block text-gray-400 mb-1 font-medium">
                    Math expression
                  </label>
                  <input
                    type="text"
                    data-testid="column-expression-input"
                    value={newColExpr}
                    onChange={(e) => setNewColExpr(e.target.value)}
                    placeholder="ej. strokeWidth * 2.5 + {otra_columna}"
                    className="w-full ui-input ui-data"
                  />
                  {!formulaValidation.ok && newColExpr.trim().length > 0 && (
                    <p
                      data-testid="formula-syntax-error"
                      className="text-rose-400 text-2xs mt-1 flex items-center space-x-1"
                    >
                      <AlertTriangle size={16} className="inline mr-1" />
                      <span>{formulaValidation.message}</span>
                    </p>
                  )}
                  {formulaValidation.ok && newColExpr.trim().length > 0 && (
                    <p className="text-emerald-400 text-2xs mt-1">
                      ✓ Valid expression
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-cad-border">
                <button
                  type="button"
                  data-testid="cancel-column-button"
                  onClick={handleClose}
                  className="ui-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-column-button"
                  disabled={
                    !newColName.trim() ||
                    (newColType === 'formula' && !formulaValidation.ok)
                  }
                  className="ui-btn ui-btn-primary"
                >
                  Save Column
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación de Columna */}
      {columnToDelete && (
        <div
          data-testid="delete-column-confirmation-modal"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onCancelDelete}
        >
          <div
            className="bg-cad-panel border border-cad-border rounded-xl shadow-float w-full max-w-sm p-5 text-xs text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-rose-300 mb-2 flex items-center space-x-1.5">
              <AlertTriangle size={16} className="text-rose-400" />
              <span>Delete Custom Column</span>
            </h3>
            <p className="text-gray-300 mb-4 leading-relaxed">
              Are you sure you want to delete the column{' '}
              <strong className="text-cad-strong">"{columnToDelete.nombre}"</strong>?
              All values stored in this column for the document's markups will also be deleted.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                data-testid="cancel-delete-column-btn"
                onClick={onCancelDelete}
                className="ui-btn"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-delete-column-btn"
                onClick={() => {
                  onConfirmDelete(columnToDelete.id);
                  onCancelDelete();
                }}
                className="ui-btn !bg-rose-600 !text-white hover:!bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
