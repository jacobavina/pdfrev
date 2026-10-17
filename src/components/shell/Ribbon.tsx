import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { Stamp as StampIcon, Link2, Paperclip } from 'lucide-react';
import { stampById } from '../../core/markup/stamps';
import { FIELD_TYPES, fieldTypeDef } from '../../core/markup/formFields';
import { fieldTypeIcon } from './fieldIcons';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useToolStore, ToolType } from '../../store/useToolStore';
import { useUiStore, RibbonTabId } from '../../store/useUiStore';
import { showToast } from '../../services/toastService';
import { TOOL_GROUPS, TEXT_LAYER_TOOLS, ToolDefinition } from './toolDefinitions';
import { IconPicker } from './IconPicker';

// Selector de sellos con sus miniaturas: solo se carga al abrir la pestaña Insert (presupuesto del bundle, ADR-0045)
const StampPicker = lazy(() => import('./StampPicker').then((m) => ({ default: m.StampPicker })));

/** Pestañas de la cinta (ADR-0044), como las de Revu: cada una agrupa las herramientas de una tarea. */
const RIBBON_TABS: { id: RibbonTabId; label: string }[] = [
  { id: 'markup', label: 'Markup' },
  { id: 'measure', label: 'Measure' },
  { id: 'insert', label: 'Insert' },
];
const INSERT_TOOLS: ToolType[] = ['stamp', 'link', 'fileAttachment', 'formField'];

/** Pestaña en la que está una herramienta (Select y Pan están siempre a la vista). */
function tabOfTool(tool: ToolType): RibbonTabId | null {
  if (INSERT_TOOLS.includes(tool)) return 'insert';
  const group = TOOL_GROUPS.find((g) => g.tools.some((t) => t.type === tool));
  if (!group || group.id === 'select') return null;
  return group.id === 'measure' ? 'measure' : 'markup';
}

/** Grupo de la cinta: herramientas arriba y rótulo abajo (ADR-0044). */
const RibbonGroup: React.FC<{ label: string; children: React.ReactNode; testId?: string }> = ({
  label,
  children,
  testId,
}) => (
  <section data-testid={testId} className="ribbon-group">
    <div className="flex-1 flex items-center gap-0.5">{children}</div>
    <div className="ribbon-group-label">{label}</div>
  </section>
);

/** Herramienta: icono sobre su nombre, como en Revu (ADR-0044). */
const ToolButton: React.FC<{
  testId: string;
  title: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ testId, title, label, icon, active, disabled, onClick }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    title={title}
    aria-pressed={active}
    disabled={disabled}
    className="ribbon-tool"
  >
    {icon}
    <span className="ribbon-tool-label">{label}</span>
  </button>
);

/**
 * Cinta de herramientas (ADR-0017). Sustituye a la antigua barra plana de iconos: herramientas agrupadas por
 * tarea con rótulo, en dos filas compactas. Se desplaza horizontalmente por dentro si la ventana es estrecha,
 * sin ensanchar el diseño (ver test E2E de regresión de desborde).
 */
/**
 * Pestañas de la cinta y herramienta activa (ADR-0064). En la aplicación van en la misma fila que los menús, para que
 * no compitan dos filas de pestañas; la cinta las muestra por sí sola cuando se usa aislada.
 */
export const RibbonTabs: React.FC = () => {
  const tab = useUiStore((s) => s.ribbonTab);
  const setTab = useUiStore((s) => s.setRibbonTab);
  const activeTool = useToolStore((s) => s.activeTool);
  const activeDef = TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.type === activeTool);
  return (
    <div data-testid="ribbon-tabs" className="flex items-stretch min-w-0">
      <div role="tablist" aria-label="Ribbon" className="flex items-stretch">
        {RIBBON_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-testid={`ribbon-tab-${t.id}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="ribbon-tab"
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeDef && activeDef.type !== 'select' && (
        <div className="flex items-center gap-1.5 text-2xs text-gray-400 pl-2" data-testid="ribbon-active-tool">
          <span className="text-gray-300">{activeDef.short}</span>
          {activeDef.shortcut && (
            <kbd className="px-1 rounded border border-cad-border text-2xs font-sans text-gray-400">{activeDef.shortcut}</kbd>
          )}
        </div>
      )}
    </div>
  );
};

export const Ribbon: React.FC<{ showTabs?: boolean }> = ({ showTabs = true }) => {
  const { pdfBytes, pageHasText, currentPageIndex } = useDocumentStore();
  const { activeTool, setActiveTool, activeStampId, setActiveStampId, activeFieldType, setActiveFieldType } = useToolStore();

  // Pestaña visible: la de la herramienta activa (un atajo de teclado cambia de pestaña, como en Revu)
  const tab = useUiStore((s) => s.ribbonTab);
  const setTab = useUiStore((s) => s.setRibbonTab);
  // Al montar, la de la herramienta activa (Markup si es Select o Pan); después, la de cada herramienta que se elija
  const mounted = useRef(false);
  useEffect(() => {
    const t = tabOfTool(activeTool);
    if (t) setTab(t);
    else if (!mounted.current) setTab('markup');
    mounted.current = true;
  }, [activeTool, setTab]);

  const selectTool = (tool: ToolDefinition) => {
    if (TEXT_LAYER_TOOLS.includes(tool.type) && pageHasText[currentPageIndex] === false) {
      showToast('This page has no selectable text layer. You can draw the markup manually.');
    }
    setActiveTool(tool.type);
  };

  const toolsOf = (groupId: string) => TOOL_GROUPS.find((g) => g.id === groupId)!;
  const renderGroup = (groupId: string) => {
    const group = toolsOf(groupId);
    return (
      <RibbonGroup key={group.id} label={group.label} testId={`ribbon-group-${group.id}`}>
        {group.tools.map((tool) => (
          <ToolButton
            key={tool.type}
            testId={tool.testId || `tool-${tool.type}`}
            title={tool.label}
            label={tool.short}
            icon={tool.icon}
            active={activeTool === tool.type}
            onClick={() => selectTool(tool)}
          />
        ))}
      </RibbonGroup>
    );
  };

  return (
    <div data-testid="ribbon" className="shrink-0 min-w-0 bg-cad-ribbon border-b border-cad-border select-none z-20">
      {showTabs && (
        <div className="h-[28px] flex items-stretch px-2 border-b border-cad-border">
          <RibbonTabs />
        </div>
      )}

      {/* Herramientas: Select y Pan siempre a la vista; el resto según la pestaña */}
      <div data-testid="ribbon-tools" className="h-[48px] flex items-stretch overflow-x-auto overflow-y-hidden thin-scroll px-1">
        {renderGroup('select')}
        {tab === 'markup' && (
          <>
            {renderGroup('text')}
            {renderGroup('draw')}
          </>
        )}
        {tab === 'measure' && renderGroup('measure')}
        {tab === 'insert' && (
          <>
            <RibbonGroup label="Stamp" testId="ribbon-group-stamp">
              <ToolButton
                testId="tool-stamp"
                title={`Stamp: ${stampById(activeStampId).label} (click on the drawing to place it, drag to size it)`}
                label="Stamp"
                icon={<StampIcon />}
                active={activeTool === 'stamp'}
                disabled={!pdfBytes}
                onClick={() => setActiveTool('stamp')}
              />
              <div className="pl-1">
                <Suspense fallback={<span className="block w-[88px] h-[30px] rounded-md border border-cad-border" />}>
                  <StampPicker
                    testId="ribbon-stamp-picker"
                    value={activeStampId}
                    onChange={(id) => {
                      setActiveStampId(id);
                      setActiveTool('stamp');
                    }}
                  />
                </Suspense>
              </div>
            </RibbonGroup>
            <RibbonGroup label="Link & Form" testId="ribbon-group-insert">
              <ToolButton
                testId="tool-link"
                title="Hyperlink: drag the link area, then choose a web address or page"
                label="Link"
                icon={<Link2 />}
                active={activeTool === 'link'}
                disabled={!pdfBytes}
                onClick={() => setActiveTool('link')}
              />
              <ToolButton
                testId="tool-fileAttachment"
                title="File Attachment: click to attach a file"
                label="Attach"
                icon={<Paperclip />}
                active={activeTool === 'fileAttachment'}
                disabled={!pdfBytes}
                onClick={() => setActiveTool('fileAttachment')}
              />
              <ToolButton
                testId="tool-formField"
                title={`Form field: ${fieldTypeDef(activeFieldType).label}`}
                label="Field"
                icon={fieldTypeIcon(activeFieldType, 20)}
                active={activeTool === 'formField'}
                disabled={!pdfBytes}
                onClick={() => setActiveTool('formField')}
              />
              <div className="pl-1">
                <IconPicker
                  compact
                  testId="ribbon-field-type"
                  title="Form field type"
                  value={activeFieldType}
                  options={FIELD_TYPES.map((f) => ({ value: f.id, label: f.label }))}
                  renderIcon={(id) => (
                    <span className="flex items-center gap-1 text-2xs">
                      {fieldTypeIcon(id, 16)}
                      <span className="whitespace-nowrap">{fieldTypeDef(id).label}</span>
                    </span>
                  )}
                  onChange={(id) => {
                    setActiveFieldType(id);
                    setActiveTool('formField');
                  }}
                />
              </div>
            </RibbonGroup>
          </>
        )}
      </div>

    </div>
  );
};
