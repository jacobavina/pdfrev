import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { useToolChestStore } from '../../store/useToolChestStore';
import { useRightPanel } from '../../store/useUiStore';
import { ToolVectorThumbnail } from '../markup/ToolVectorThumbnail';
import { ToolChestTool, RecentTool } from '../../types/toolChest';

export interface ToolChestPanelProps {
  defaultCollapsed?: boolean;
}

export const ToolChestPanel: React.FC<ToolChestPanelProps> = ({
  defaultCollapsed = true,
}) => {
  const {
    palettes,
    activePaletteId,
    tools,
    recentTools,
    isPersistent,
    persistenceError,
    init,
    setActivePalette,
    createPalette,
    deletePalette,
    deleteTool,
    toggleToolMode,
    applyTool,
    clearRecent,
  } = useToolChestStore();

  const [isCollapsed, setIsCollapsed] = useRightPanel('toolchest', defaultCollapsed);
  const [isCreatingPalette, setIsCreatingPalette] = useState(false);
  const [newPaletteName, setNewPaletteName] = useState('');

  // Carga inicial de datos de IndexedDB
  useEffect(() => {
    init();
  }, [init]);

  const activePalette = palettes.find((p) => p.id === activePaletteId) || palettes[0];
  const activeTools = tools.filter((t) => t.paletteId === (activePalette?.id || activePaletteId));

  const handleCreatePaletteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaletteName.trim()) return;
    try {
      const created = await createPalette(newPaletteName.trim());
      setActivePalette(created.id);
      setNewPaletteName('');
      setIsCreatingPalette(false);
    } catch (err) {
      console.error('Error al crear paleta:', err);
    }
  };

  const handleDragStart = (
    e: React.DragEvent,
    tool: ToolChestTool | RecentTool
  ) => {
    e.dataTransfer.setData('application/rea-tool', JSON.stringify(tool));
    e.dataTransfer.effectAllowed = 'copy';
  };

  if (isCollapsed) {
    // Plegado: lo abre el riel derecho (ADR-0044)
    return <aside data-testid="tool-chest-panel" data-collapsed="true" hidden />;
  }

  return (
    <aside
      data-testid="tool-chest-panel"
      data-collapsed="false"
      className="w-[268px] bg-cad-panel border-l border-cad-border flex flex-col select-none z-10 transition-all duration-200 overflow-hidden text-[12px]"
    >
      {/* 1. Cabecera del Panel */}
      <div className="h-10 px-3 border-b border-cad-border flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1.5">
          <Briefcase size={14} className="text-gray-400" />
          <span className="ui-panel-title">Tool Chest</span>
          {/* Indicador de persistencia IndexedDB */}
          <span
            className={`w-2 h-2 rounded-full ml-1 ${
              isPersistent ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            }`}
            title={
              isPersistent
                ? 'Persistent IndexedDB connected'
                : `In-memory mode (${persistenceError?.error?.message || persistenceError?.reason || 'Persistence error'})`
            }
          />
        </div>

        <button
          onClick={() => setIsCollapsed(true)}
          className="ui-btn !h-7 !w-7 !p-0"
          title="Collapse Tool Chest"
          data-testid="collapse-tool-chest-btn"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Alerta de fallback si falla IndexedDB */}
      {!isPersistent && persistenceError && (
        <div
          data-testid="tool-chest-persistence-warning"
          className="px-3 py-1.5 bg-amber-500/10 border-b border-cad-border text-[11px] text-amber-600 dark:text-amber-300 flex items-center space-x-1.5"
        >
          <AlertCircle size={13} className="shrink-0 text-amber-400" />
          <span className="truncate">In-memory (data not saved to disk)</span>
        </div>
      )}

      {/* 2. Selector de Paleta Activa */}
      <div className="px-3 py-3 border-b border-cad-border">
        <div className="flex items-center justify-between mb-1.5">
          <label className="ui-section-title">
            Palette
          </label>
          <button
            onClick={() => setIsCreatingPalette(true)}
            className="p-0.5 text-gray-400 hover:text-cad-accent hover:bg-cad-hover rounded"
            title="Create new palette"
            data-testid="create-palette-btn"
          >
            <Plus size={13} />
          </button>
        </div>

        {isCreatingPalette ? (
          <form onSubmit={handleCreatePaletteSubmit} className="flex items-center space-x-1">
            <input
              type="text"
              autoFocus
              value={newPaletteName}
              onChange={(e) => setNewPaletteName(e.target.value)}
              placeholder="Palette name..."
              className="flex-1 ui-input"
              data-testid="new-palette-name-input"
            />
            <button
              type="submit"
              className="p-1 text-emerald-400 hover:bg-cad-hover rounded"
              title="Save palette"
              data-testid="save-palette-btn"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingPalette(false);
                setNewPaletteName('');
              }}
              className="p-1 text-gray-400 hover:bg-cad-hover rounded"
              title="Cancel"
            >
              <X size={13} />
            </button>
          </form>
        ) : (
          <div className="flex items-center space-x-1.5">
            <select
              value={activePalette?.id || ''}
              onChange={(e) => setActivePalette(e.target.value)}
              className="flex-1 ui-input cursor-pointer"
              data-testid="palette-select"
            >
              {palettes.map((p, idx) => (
                <option key={`${p.id}-${idx}`} value={p.id}>
                  {p.name} {p.isDefault ? '(Default)' : ''}
                </option>
              ))}
            </select>

            {activePalette && !activePalette.isDefault && (
              <button
                onClick={() => deletePalette(activePalette.id)}
                className="p-1 text-gray-500 hover:text-rose-400 hover:bg-cad-hover rounded transition-colors"
                title="Delete this palette"
                data-testid="delete-palette-btn"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. Lista de Herramientas de la Paleta Activa */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="ui-section-title mb-2 flex items-center justify-between">
          <span>Tools ({activeTools.length})</span>
        </div>

        {activeTools.length === 0 ? (
          <div className="p-4 text-center text-[12px] text-gray-500 border border-dashed border-cad-border rounded-lg my-2">
            <p className="font-medium text-gray-400 mb-1">Empty palette</p>
            <p className="text-[11px]">
              Right-click a markup in the list or drag to add tools here.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activeTools.map((tool) => (
              <div
                key={tool.id}
                draggable
                onDragStart={(e) => handleDragStart(e, tool)}
                onClick={() => applyTool(tool)}
                data-testid={`tool-item-${tool.id}`}
                data-tool-type={tool.type}
                data-tool-mode={tool.mode}
                className="group flex items-center justify-between p-1.5 rounded-md bg-cad-field hover:bg-cad-hover border border-transparent hover:border-cad-accent/40 cursor-pointer transition-all shadow-sm"
                title={`Haz clic para ${
                  tool.mode === 'properties' ? 'aplicar propiedades' : 'activar modo dibujo'
                }. Arrastra al lienzo para estampar.`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <ToolVectorThumbnail
                    type={tool.type}
                    style={tool.style}
                    mode={tool.mode}
                    size={34}
                    showModeBadge={false}
                  />
                  <div className="min-w-0">
                    <div className="text-xs text-gray-200 font-medium truncate">
                      {tool.name || tool.type}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate capitalize">
                      {tool.type}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  {/* Botón de alternancia de modo (P / D) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleToolMode(tool.id);
                    }}
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors uppercase ${
                      tool.mode === 'properties'
                        ? 'bg-amber-500 text-gray-950 hover:bg-amber-400'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
                    }`}
                    title={
                      tool.mode === 'properties'
                        ? 'Properties mode on (click to switch to Drawing)'
                        : 'Drawing mode on (click to switch to Properties)'
                    }
                    data-testid={`tool-mode-toggle-${tool.id}`}
                  >
                    {tool.mode === 'properties' ? 'P' : 'D'}
                  </button>

                  {/* Botón de eliminar herramienta */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTool(tool.id);
                    }}
                    className="p-1 text-gray-500 hover:text-rose-400 hover:bg-cad-dark rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete tool"
                    data-testid={`tool-delete-${tool.id}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 4. Sección Herramientas Recientes */}
        <div data-testid="recent-tools-section" className="mt-5 pt-3 border-t border-cad-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 ui-section-title">
              <Clock size={12} className="text-gray-400" />
              <span>Recent ({recentTools.length})</span>
            </div>

            {recentTools.length > 0 && (
              <button
                onClick={() => clearRecent()}
                className="ui-btn ui-btn-danger !h-6 !px-1.5 !text-[11px]"
                title="Clear recent tools"
                data-testid="clear-recent-tools-btn"
              >
                Clear
              </button>
            )}
          </div>

          {recentTools.length === 0 ? (
            <p className="text-[11px] text-gray-500 italic p-1">No recent tools</p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {recentTools.map((recent) => (
                <div
                  key={recent.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, recent)}
                  onClick={() => applyTool(recent)}
                  data-testid={`recent-tool-${recent.id}`}
                  data-tool-type={recent.type}
                  className="p-1 rounded-md bg-cad-field hover:bg-cad-hover border border-transparent hover:border-cad-accent/40 cursor-pointer flex items-center justify-center transition-all"
                  title={`${recent.text || recent.type} (drag onto the drawing or click)`}
                >
                  <ToolVectorThumbnail
                    type={recent.type}
                    style={recent.style}
                    mode={recent.mode}
                    size={28}
                    showModeBadge={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
