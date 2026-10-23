import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, FilePlus2, FolderOpen, Library, Plus, Trash2, X } from 'lucide-react';
import { PanelShell } from '../shell/PanelShell';
import { usePdfSetsStore } from '../../store/usePdfSetsStore';
import { useDocumentTabsStore } from '../../store/useDocumentTabsStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { isTauriEnvironment } from '../../services/bbxPersistenceService';
import { comparablePath } from '../../core/sets/pdfSets';

/**
 * Panel Sets (ADR-0119): conjuntos de documentos para abrir juntos (las hojas de un proyecto). Un conjunto guarda rutas
 * de archivos; solo funciona en la aplicación de escritorio, que es donde los documentos tienen ruta.
 */
export const SetsPanel: React.FC = () => {
  const desktop = isTauriEnvironment();
  const sets = usePdfSetsStore((s) => s.sets);
  const tabs = useDocumentTabsStore((s) => s.tabs);
  const activePath = useDocumentStore((s) => s.filePath);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<{ id: string; done: number; total: number } | null>(null);

  const openPaths = useMemo(() => new Set([...tabs.map((t) => t.filePath), activePath].filter((p): p is string => !!p).map(comparablePath)), [tabs, activePath]);

  if (!desktop) {
    return (
      <PanelShell title="Sets" testId="sets-panel">
        <div className="p-3 text-gray-500" data-testid="sets-desktop-only">
          Sets group the documents of a project so you can open them together. They keep file paths, so they work in the desktop app, where documents live on disk.
        </div>
      </PanelShell>
    );
  }

  const store = usePdfSetsStore.getState();
  const create = async (fromOpen: boolean) => {
    const name = newName.trim() || 'New set';
    const id = fromOpen ? (await import('../../services/setsService')).createSetFromOpenDocuments(name) : store.createSet(name);
    if (id) {
      setExpanded((e) => ({ ...e, [id]: true }));
      setNewName('');
    }
  };

  const openAll = async (id: string) => {
    const svc = await import('../../services/setsService');
    setBusy({ id, done: 0, total: 0 });
    try {
      await svc.openWholeSet(id, (done, total) => setBusy({ id, done, total }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PanelShell title="Sets" testId="sets-panel">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-cad-border">
        <input
          type="text"
          data-testid="sets-new-name"
          aria-label="Name of the new set"
          placeholder="New set"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create(false)}
          className="ui-input !h-6 flex-1 min-w-0"
        />
        <button type="button" data-testid="sets-create" onClick={() => void create(false)} title="Create an empty set" className="ui-btn !h-6 !px-1.5">
          <Plus size={16} />
        </button>
        <button type="button" data-testid="sets-create-open" onClick={() => void create(true)} title="Create a set with the open documents" className="ui-btn !h-6 !px-1.5">
          <Library size={16} />
        </button>
      </div>
      {sets.length === 0 && (
        <div className="p-3 text-gray-500" data-testid="sets-empty">
          No sets yet. Type a name and press + for an empty set, or the library button to start from the documents you have open.
        </div>
      )}
      {sets.map((s) => {
        const isOpen = expanded[s.id] ?? false;
        return (
          <section key={s.id} data-testid={`set-${s.id}`} className="border-b border-cad-border">
            <div className="flex items-center gap-1 px-1.5 py-1 hover:bg-cad-hover">
              <button type="button" onClick={() => setExpanded((e) => ({ ...e, [s.id]: !isOpen }))} aria-expanded={isOpen} aria-label={isOpen ? 'Collapse set' : 'Expand set'} className="p-0.5 rounded text-gray-400">
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <input
                type="text"
                data-testid={`set-name-${s.id}`}
                aria-label="Set name"
                defaultValue={s.name}
                key={s.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && usePdfSetsStore.getState().renameSet(s.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="ui-input !h-6 flex-1 min-w-0 !bg-transparent"
              />
              <span className="text-2xs text-gray-500 shrink-0" data-testid={`set-count-${s.id}`}>
                {s.files.length}
              </span>
              <button type="button" data-testid={`set-open-all-${s.id}`} disabled={s.files.length === 0 || busy !== null} onClick={() => void openAll(s.id)} title="Open every document of the set" className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle disabled:opacity-40">
                <FolderOpen size={16} />
              </button>
              <button type="button" data-testid={`set-delete-${s.id}`} onClick={() => usePdfSetsStore.getState().deleteSet(s.id)} title="Delete the set (the files are not touched)" className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle">
                <Trash2 size={16} />
              </button>
            </div>
            {busy?.id === s.id && (
              <div className="px-3 pb-1 text-2xs text-gray-400" data-testid="sets-progress">
                Opening {Math.min(busy.done + 1, busy.total || 1)} of {busy.total || s.files.length}…
              </div>
            )}
            {isOpen && (
              <ul>
                {s.files.map((f, i) => (
                  <li key={f.path} data-testid={`set-file-${s.id}-${i}`} className="group flex items-center gap-1 pl-6 pr-1.5 py-0.5 hover:bg-cad-hover">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${openPaths.has(comparablePath(f.path)) ? 'bg-cad-accent' : 'bg-transparent'}`} title={openPaths.has(comparablePath(f.path)) ? 'Open' : ''} />
                    <button type="button" onClick={() => void import('../../services/setsService').then((m) => m.openSetFile(f.path))} title={f.path} className="flex-1 min-w-0 truncate text-left">
                      {f.name}
                    </button>
                    <button type="button" data-testid={`set-file-up-${s.id}-${i}`} disabled={i === 0} onClick={() => usePdfSetsStore.getState().moveFile(s.id, i, i - 1)} title="Move up" className="p-0.5 rounded text-gray-400 hover:text-cad-strong disabled:opacity-30">
                      <ChevronUp size={16} />
                    </button>
                    <button type="button" data-testid={`set-file-down-${s.id}-${i}`} disabled={i === s.files.length - 1} onClick={() => usePdfSetsStore.getState().moveFile(s.id, i, i + 1)} title="Move down" className="p-0.5 rounded text-gray-400 hover:text-cad-strong disabled:opacity-30">
                      <ChevronDown size={16} />
                    </button>
                    <button type="button" data-testid={`set-file-remove-${s.id}-${i}`} onClick={() => usePdfSetsStore.getState().removeFile(s.id, f.path)} title="Remove from the set" className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle">
                      <X size={16} />
                    </button>
                  </li>
                ))}
                <li className="flex items-center gap-1.5 pl-6 pr-1.5 py-1">
                  <button type="button" data-testid={`set-add-files-${s.id}`} onClick={() => void import('../../services/setsService').then((m) => m.addFilesWithDialog(s.id))} className="ui-btn !h-6 !px-1.5 !text-2xs flex items-center gap-1">
                    <FilePlus2 size={16} /> Add files…
                  </button>
                  <button type="button" data-testid={`set-add-open-${s.id}`} onClick={() => void import('../../services/setsService').then((m) => m.addOpenDocuments(s.id))} className="ui-btn !h-6 !px-1.5 !text-2xs">
                    Add open
                  </button>
                </li>
              </ul>
            )}
          </section>
        );
      })}
    </PanelShell>
  );
};
