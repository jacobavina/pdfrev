import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Scissors,
  Copy,
  Clipboard,
  Trash2,
  SlidersHorizontal,
  Reply,
  CopyPlus,
  Lock,
  LockOpen,
  Eye,
  Check,
  ChevronRight,
  Layers,
  AlignLeft,
  FileText,
  Briefcase,
  Layers2,
  Crosshair,
} from 'lucide-react';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import { useToolStore } from '../../store/useToolStore';
import { useToolChestStore } from '../../store/useToolChestStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { MarkupStatus, VALID_MARKUP_STATUSES } from '../../types/markup';
import { markupTypeLabel } from '../../core/markup/typeLabels';
import {
  alignSelectedMarkups,
  distributeSelectedMarkups,
  flipSelectedMarkups,
} from '../../core/markup/transformTools';
import { PolygonCutoutIcon, EllipseCutoutIcon } from './customIcons';
import { showToast } from '../../services/toastService';
import { hasSnapshotInCache } from '../../services/snapshotService';

const STATUS_LABELS: Record<MarkupStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_DOT: Record<MarkupStatus, string> = {
  pending: 'bg-amber-400',
  accepted: 'bg-emerald-500',
  rejected: 'bg-rose-500',
  completed: 'bg-blue-500',
  cancelled: 'bg-zinc-400',
};

interface SubmenuItemDef {
  id: string;
  testId?: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separator?: boolean;
  action?: () => void;
}

/**
 * Menú contextual de marcas sobre el plano con paridad estructural Bluebeam Revu 21 (ADR-0017 / ADR-0081).
 * Incluye submenús flotantes con alineación, orden (Z-order), capas, estados, control points y Tool Chest.
 */
export const CanvasContextMenu: React.FC<{
  x: number;
  y: number;
  hitCutoutIndex?: number | null;
  onClose: () => void;
}> = ({ x, y, hitCutoutIndex, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [menuHeight, setMenuHeight] = useState(560);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  const { markups, selectedMarkupIds, updateMarkupStatus } = useMarkupStore();
  const selected = markups.filter((m) => selectedMarkupIds.includes(m.id));
  const first = selected[0];
  const allLocked = selected.length > 0 && selected.every((m) => m.locked);
  const isMeasure = first && (first.type === 'area' || first.type === 'volume');
  const unitKeys = new Set(selected.map((m) => (m.groupId ? `g:${m.groupId}` : `i:${m.id}`)));
  const canAlign = unitKeys.size >= 2 && !allLocked;
  const canDistribute = unitKeys.size >= 3 && !allLocked;

  const palettes = useToolChestStore((s) => s.palettes) ?? [];
  const docLayers = Array.from(new Set(markups.map((m) => m.layer).filter((l): l is string => Boolean(l))));

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight;
    if (h && Math.abs(h - menuHeight) > 1) setMenuHeight(h);
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!first) return null;

  // Mantener el menú dentro de la ventana (ADR-0092): la altura real se mide tras pintar, porque el menú de Revu 21
  // es más alto que cualquier cifra fija y sus últimas entradas quedaban fuera de la ventana
  const left = Math.min(x, typeof window !== 'undefined' ? window.innerWidth - 240 : x);
  const top = Math.max(8, Math.min(y, typeof window !== 'undefined' ? window.innerHeight - menuHeight - 8 : y));
  const openLeft = typeof window !== 'undefined' && left > window.innerWidth - 440;

  const item = (
    testId: string,
    icon: React.ReactNode,
    label: string,
    action?: () => void,
    opts: {
      danger?: boolean;
      disabled?: boolean;
      shortcut?: string;
      hasSubmenu?: boolean;
      submenuId?: string;
      submenuItems?: SubmenuItemDef[];
      alignBottom?: boolean;
    } = {}
  ) => {
    if (opts.hasSubmenu && opts.submenuItems) {
      const isSubOpen = activeSubmenu === opts.submenuId;
      return (
        <div
          key={testId}
          className="relative group/sub"
          onMouseEnter={() => setActiveSubmenu(opts.submenuId || null)}
          onMouseLeave={() => {
            if (activeSubmenu === opts.submenuId) setActiveSubmenu(null);
          }}
        >
          <button
            type="button"
            data-testid={testId}
            disabled={opts.disabled}
            onClick={() => setActiveSubmenu((curr) => curr === opts.submenuId ? null : (opts.submenuId || null))}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left disabled:opacity-35 transition-colors rounded ${
              opts.danger
                ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                : 'text-gray-200 hover:bg-cad-hover'
            }`}
          >
            <span className="w-4 flex justify-center shrink-0">{icon}</span>
            <span className="flex-1 truncate">{label}</span>
            {opts.shortcut && <span className="text-2xs text-gray-500 ml-auto pl-2 shrink-0">{opts.shortcut}</span>}
            <ChevronRight size={16} className="text-gray-400 ml-1 shrink-0" />
          </button>
          <div
            role="menu"
            className={`absolute ${opts.alignBottom ? 'bottom-0' : 'top-0'} ${
              openLeft ? 'right-full mr-0.5' : 'left-full ml-0.5'
            } z-50 min-w-[190px] max-h-72 overflow-y-auto bg-cad-panel border border-cad-border rounded-lg shadow-float p-1 text-xs select-none ${
              isSubOpen ? 'block' : 'hidden group-hover/sub:block'
            }`}
          >
            {(() => {
              const hasAnyIcon = opts.submenuItems.some((s) => Boolean(s.icon));
              return opts.submenuItems.map((sub, i) => {
                if (sub.separator) {
                  return <div key={`sep-${i}`} className="my-1 border-t border-cad-border" />;
                }
                return (
                  <button
                    key={sub.id}
                    type="button"
                    data-testid={sub.testId}
                    disabled={sub.disabled}
                    onClick={() => {
                      if (sub.action) sub.action();
                      onClose();
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left disabled:opacity-35 transition-colors rounded ${
                      sub.danger
                        ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                        : 'text-gray-200 hover:bg-cad-hover'
                    }`}
                  >
                    {hasAnyIcon && (
                      <span className="w-4 flex justify-center shrink-0">{sub.icon ?? null}</span>
                    )}
                    <span className="flex-1 truncate">{sub.label}</span>
                    {sub.checked && <Check size={16} className="text-cad-accent shrink-0 ml-1" />}
                    {sub.shortcut && <span className="text-2xs text-gray-500 ml-auto pl-2 shrink-0">{sub.shortcut}</span>}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      );
    }

    return (
      <button
        key={testId}
        type="button"
        data-testid={testId}
        disabled={opts.disabled}
        onClick={() => {
          if (action) {
            action();
            onClose();
          }
        }}
        onMouseEnter={() => setActiveSubmenu(null)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left disabled:opacity-35 transition-colors rounded ${
          opts.danger
            ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
            : 'text-gray-200 hover:bg-cad-hover'
        }`}
      >
        <span className="w-4 flex justify-center shrink-0">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {opts.shortcut && <span className="text-2xs text-gray-500 ml-auto pl-2 shrink-0">{opts.shortcut}</span>}
      </button>
    );
  };

  const separator = () => <div className="my-1 border-t border-cad-border" />;

  // Definición de submenús
  const controlPointItems: SubmenuItemDef[] = [
    {
      id: 'cp-add',
      label: 'Add Control Point',
      icon: <Crosshair size={16} />,
      action: () => showToast('Click on a polygon edge to insert a control point.'),
      disabled: allLocked,
    },
    {
      id: 'cp-subtract',
      label: 'Subtract Control Point',
      icon: <Crosshair size={16} />,
      action: () => showToast('Click on a control point to delete it.'),
      disabled: allLocked,
    },
    {
      id: 'cp-curve',
      label: 'Convert Control Point to Curve',
      disabled: true,
    },
  ];

  const currentLayer = first.layer ?? '';
  const targetIds = selected.map((m) => m.id);
  const layerItems: SubmenuItemDef[] = [
    {
      id: 'layer-none',
      label: 'No Layer',
      checked: !currentLayer,
      action: () => useMarkupStore.getState().applyPropertiesToMarkups(targetIds, { layer: undefined }),
    },
    ...docLayers.map((lay) => ({
      id: `lay-${lay}`,
      label: lay,
      checked: currentLayer === lay,
      action: () => useMarkupStore.getState().applyPropertiesToMarkups(targetIds, { layer: lay }),
    })),
    {
      id: 'layer-new',
      label: 'New Layer…',
      action: () => {
        const name = window.prompt('New Layer Name:');
        if (name && name.trim()) {
          useMarkupStore.getState().applyPropertiesToMarkups(targetIds, { layer: name.trim() });
          showToast(`Assigned ${targetIds.length > 1 ? `${targetIds.length} markups` : 'markup'} to new layer "${name.trim()}".`);
        }
      },
    },
  ];

  const orderItems: SubmenuItemDef[] = [
    {
      id: 'order-front',
      label: 'Bring to Front',
      shortcut: 'Ctrl+Shift+]',
      disabled: allLocked,
      action: () => useMarkupStore.getState().reorderSelectedMarkups('front'),
    },
    {
      id: 'order-forward',
      label: 'Bring Forward',
      shortcut: 'Ctrl+]',
      disabled: allLocked,
      action: () => useMarkupStore.getState().reorderSelectedMarkups('forward'),
    },
    {
      id: 'order-backward',
      label: 'Send Backward',
      shortcut: 'Ctrl+[',
      disabled: allLocked,
      action: () => useMarkupStore.getState().reorderSelectedMarkups('backward'),
    },
    {
      id: 'order-back',
      label: 'Send to Back',
      shortcut: 'Ctrl+Shift+[',
      disabled: allLocked,
      action: () => useMarkupStore.getState().reorderSelectedMarkups('back'),
    },
  ];

  const alignmentItems: SubmenuItemDef[] = [
    { id: 'al-left', testId: 'canvas-menu-align-left', label: 'Align Left', disabled: !canAlign, action: () => alignSelectedMarkups('left') },
    { id: 'al-center', testId: 'canvas-menu-align-center', label: 'Align Center', disabled: !canAlign, action: () => alignSelectedMarkups('center') },
    { id: 'al-right', testId: 'canvas-menu-align-right', label: 'Align Right', disabled: !canAlign, action: () => alignSelectedMarkups('right') },
    { id: 'al-top', testId: 'canvas-menu-align-top', label: 'Align Top', disabled: !canAlign, action: () => alignSelectedMarkups('top') },
    { id: 'al-middle', testId: 'canvas-menu-align-middle', label: 'Align Middle', disabled: !canAlign, action: () => alignSelectedMarkups('middle') },
    { id: 'al-bottom', testId: 'canvas-menu-align-bottom', label: 'Align Bottom', disabled: !canAlign, action: () => alignSelectedMarkups('bottom') },
    { id: 'sep-align', separator: true, label: '' },
    { id: 'dist-h', testId: 'canvas-menu-distribute-horizontal', label: 'Distribute Horizontally', disabled: !canDistribute, action: () => distributeSelectedMarkups('horizontal') },
    { id: 'dist-v', testId: 'canvas-menu-distribute-vertical', label: 'Distribute Vertically', disabled: !canDistribute, action: () => distributeSelectedMarkups('vertical') },
    { id: 'sep-flip', separator: true, label: '' },
    { id: 'flip-h', testId: 'canvas-menu-flip-horizontal', label: 'Flip Horizontal', disabled: allLocked, action: () => flipSelectedMarkups('horizontal') },
    { id: 'flip-v', testId: 'canvas-menu-flip-vertical', label: 'Flip Vertical', disabled: allLocked, action: () => flipSelectedMarkups('vertical') },
  ];

  const statusItems: SubmenuItemDef[] = VALID_MARKUP_STATUSES.map((status) => ({
    id: `st-${status}`,
    testId: `canvas-menu-status-${status}`,
    label: STATUS_LABELS[status],
    checked: first.status === status,
    icon: <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />,
    action: () => updateMarkupStatus(first.id, status),
  }));

  const toolChestItems: SubmenuItemDef[] = [
    ...palettes.map((p) => ({
      id: `tc-${p.id}`,
      label: p.name,
      action: () => {
        void useToolChestStore.getState().createToolFromMarkup(p.id, first);
        showToast(`Added markup to "${p.name}".`);
      },
    })),
    {
      id: 'tc-new-palette',
      label: 'New Tool Set…',
      action: async () => {
        const name = window.prompt('New Tool Set Name:');
        if (name && name.trim()) {
          const newPalette = await useToolChestStore.getState().createPalette(name.trim());
          void useToolChestStore.getState().createToolFromMarkup(newPalette.id, first);
          showToast(`Created tool set "${name.trim()}" and added markup.`);
        }
      },
    },
  ];

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="canvas-context-menu"
      className="fixed z-50 w-60 bg-cad-panel border border-cad-border rounded-lg shadow-float p-1 text-xs select-none"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1 text-2xs uppercase tracking-wider text-gray-500 truncate border-b border-cad-border/50 mb-1">
        {selected.length > 1 ? `${selected.length} Markups Selected` : markupTypeLabel(first.type)}
      </div>

      {/* 1. Edición y Portapapeles (Revu 21) */}
      {item(
        'canvas-menu-cut',
        <Scissors size={16} />,
        'Cut',
        () => {
          useMarkupStore.getState().copySelectedMarkups();
          useMarkupStore.getState().deleteSelectedMarkups();
        },
        {
          shortcut: 'Ctrl+X',
          disabled: allLocked,
        }
      )}
      {item('canvas-menu-copy', <Copy size={16} />, 'Copy', () => useMarkupStore.getState().copySelectedMarkups(), {
        shortcut: 'Ctrl+C',
      })}
      {item('canvas-menu-paste', <Clipboard size={16} />, 'Paste', () => useMarkupStore.getState().pasteMarkups(), {
        shortcut: 'Ctrl+V',
        disabled: allLocked || (useMarkupStore.getState().clipboardMarkups.length === 0 && !hasSnapshotInCache()),
      })}
      {item('canvas-menu-offset', <CopyPlus size={16} />, 'Offset…', () => useUiStore.getState().setCopyToolDialog('offset'), {
        shortcut: 'O',
        disabled: allLocked,
      })}
      {item('canvas-menu-multiply', <CopyPlus size={16} />, 'Multiply…', () => useUiStore.getState().setCopyToolDialog('multiply'), {
        shortcut: 'Ctrl+M',
        disabled: allLocked,
      })}
      {item('canvas-menu-duplicate', <CopyPlus size={16} />, 'Duplicate', () => useMarkupStore.getState().duplicateSelectedMarkups(), {
        shortcut: 'Ctrl+D',
      })}
      {item('canvas-menu-delete', <Trash2 size={16} />, 'Delete', () => useMarkupStore.getState().deleteSelectedMarkups(), {
        shortcut: 'Del',
        danger: true,
        disabled: allLocked,
      })}

      {separator()}

      {/* 2. Notas y Comentarios */}
      {item('canvas-menu-popup-note', <FileText size={16} />, 'Open Pop-Up Note', () =>
        useUiStore.getState().requestReply(first.id)
      )}

      {separator()}

      {/* 3. Geometría, Control Points y Cutouts */}
      {item('canvas-menu-control-point', <Crosshair size={16} />, 'Control Point', undefined, {
        hasSubmenu: true,
        submenuId: 'controlPoint',
        submenuItems: controlPointItems,
      })}
      {item('canvas-menu-arc-segment', null, 'Arc Segment', undefined, { disabled: true })}
      {item('canvas-menu-round-corners', null, 'Round All Corners', undefined, { disabled: true })}

      {/* Herramientas de recorte para Area y Volume */}
      {isMeasure && (
        <>
          {item(
            'canvas-menu-add-cutout',
            <PolygonCutoutIcon size={16} />,
            'Polygon Cutout',
            () => {
              useUiStore.getState().startCutout(first.id);
              useToolStore.getState().setActiveTool('polygonCutout');
            },
            { shortcut: 'Shift+Alt+K', disabled: Boolean(first.locked) }
          )}
          {item(
            'canvas-menu-ellipse-cutout',
            <EllipseCutoutIcon size={16} />,
            'Ellipse Cutout',
            () => {
              useUiStore.getState().startCutout(first.id);
              useToolStore.getState().setActiveTool('ellipseCutout');
            },
            { disabled: Boolean(first.locked) }
          )}
        </>
      )}

      {/* Delete Cutout: activo si se hace clic exactamente sobre la ranura (Revu 21) */}
      {item(
        'canvas-menu-delete-cutout',
        <Trash2 size={16} />,
        'Delete Cutout',
        () => {
          if (hitCutoutIndex !== undefined && hitCutoutIndex !== null && hitCutoutIndex >= 0) {
            const dims = useUiStore.getState().pageDimensionsPt ?? { width: 612, height: 792 };
            const cal = useCalibrationStore.getState().getEffectiveCalibration(first.pageIndex, first.points);
            useMarkupStore.getState().deleteCutout(first.id, hitCutoutIndex, dims, cal);
          }
        },
        {
          danger: true,
          disabled:
            allLocked ||
            hitCutoutIndex === undefined ||
            hitCutoutIndex === null ||
            hitCutoutIndex < 0 ||
            !first.cutouts ||
            hitCutoutIndex >= first.cutouts.length,
        }
      )}

      {first.cutouts && first.cutouts.length > 0 && (
        item(
          'canvas-menu-clear-cutouts',
          <Trash2 size={16} />,
          `Clear Cutouts (${first.cutouts.length})`,
          () => {
            const dims = useUiStore.getState().pageDimensionsPt ?? { width: 612, height: 792 };
            const cal = useCalibrationStore.getState().getEffectiveCalibration(first.pageIndex, first.points);
            useMarkupStore.getState().clearCutouts(first.id, dims, cal);
          },
          { danger: true, disabled: Boolean(first.locked) }
        )
      )}

      {item('canvas-menu-reset-caption', null, 'Reset Caption Position', undefined, { disabled: true })}

      {separator()}

      {/* 4. Organización: Capa, Orden, Alineación, Bloqueo */}
      {item('canvas-menu-layer', <Layers size={16} />, 'Layer', undefined, {
        hasSubmenu: true,
        submenuId: 'layer',
        submenuItems: layerItems,
      })}
      {item('canvas-menu-order', <Layers2 size={16} />, 'Order', undefined, {
        hasSubmenu: true,
        submenuId: 'order',
        submenuItems: orderItems,
      })}
      {item('canvas-menu-alignment', <AlignLeft size={16} />, 'Alignment', undefined, {
        hasSubmenu: true,
        submenuId: 'alignment',
        submenuItems: alignmentItems,
      })}
      {item('canvas-menu-flatten', null, 'Flatten', undefined, { disabled: true })}
      {item(
        'canvas-menu-lock',
        allLocked ? <LockOpen size={16} /> : <Lock size={16} />,
        allLocked ? 'Unlock' : 'Lock',
        () => useMarkupStore.getState().toggleLockSelectedMarkups(),
        { shortcut: 'Ctrl+Shift+L' }
      )}
      {item('canvas-menu-hide', <Eye size={16} />, 'Hide', () => {
        showToast('Hide markup feature (mark as hidden)');
      }, { disabled: true })}

      {separator()}

      {/* 5. Colaboración y Estado */}
      {item(
        'canvas-menu-reply',
        <Reply size={16} />,
        'Reply…',
        () => useUiStore.getState().requestReply(first.id),
        { disabled: Boolean(first.locked) }
      )}
      {item('canvas-menu-status', <Check size={16} />, 'Set Status', undefined, {
        hasSubmenu: true,
        submenuId: 'status',
        submenuItems: statusItems,
        alignBottom: true,
      })}
      {item('canvas-menu-check', <Check size={16} />, 'Check', () => {
        const nextStatus = first.status === 'accepted' ? 'pending' : 'accepted';
        updateMarkupStatus(first.id, nextStatus);
      })}

      {separator()}

      {/* 6. Tool Chest */}
      {item('canvas-menu-toolchest', <Briefcase size={16} />, 'Add to Tool Chest', undefined, {
        hasSubmenu: true,
        submenuId: 'toolchest',
        submenuItems: toolChestItems,
        alignBottom: true,
      })}

      {separator()}

      {/* 7. Propiedades */}
      {item('canvas-menu-default', null, 'Set as Default', undefined, { disabled: true })}
      {item('canvas-menu-apply-pages', null, 'Apply to Pages…', undefined, { disabled: true })}
      {item('canvas-menu-properties', <SlidersHorizontal size={16} />, 'Properties', () =>
        useUiStore.getState().requestPropertiesPanel()
      )}
    </div>
  );
};
