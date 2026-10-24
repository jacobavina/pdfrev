import React, { useEffect, useState } from 'react';
import { FilePlus2, X } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useDocumentTabsStore } from '../../store/useDocumentTabsStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { showToast } from '../../services/toastService';
import { loadPdfData } from '../../services/fileDialogService';
import {
  NEW_PDF_TEMPLATES,
  PageUnit,
  PageOrientation,
  BlankPageStyle,
  fromPoints,
  convertUnit,
  loadDefaultNewPdfSettings,
  saveDefaultNewPdfSettings,
  createNewBlankPdf,
} from '../../core/pages/newBlankPdf';

export const NewPdfDialog: React.FC = () => {
  const open = useUiStore((s) => s.pageToolDialog === 'newPdf');
  const close = useUiStore((s) => s.setPageToolDialog);

  const pdfBytes = useDocumentStore((s) => s.pdfBytes);
  const currentPageIndex = useDocumentStore((s) => s.currentPageIndex);
  const pageDimensions = useDocumentStore((s) => s.pageDimensions);

  const [templateId, setTemplateId] = useState('iso-a4');
  const [width, setWidth] = useState<number>(21.0);
  const [height, setHeight] = useState<number>(29.7);
  const [widthUnit, setWidthUnit] = useState<PageUnit>('cm');
  const [heightUnit, setHeightUnit] = useState<PageUnit>('cm');
  const [orientation, setOrientation] = useState<PageOrientation>('portrait');
  const [style, setStyle] = useState<BlankPageStyle>('blank');
  const [pageCount, setPageCount] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const def = loadDefaultNewPdfSettings();
    setTemplateId(def.templateId);
    setWidth(def.width);
    setHeight(def.height);
    setWidthUnit(def.widthUnit);
    setHeightUnit(def.heightUnit);
    setOrientation(def.orientation);
    setStyle(def.style);
    setPageCount(def.pageCount);
    setBusy(false);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    setTemplateId(nextId);
    if (nextId === 'custom') return;

    const t = NEW_PDF_TEMPLATES.find((tpl) => tpl.id === nextId);
    if (!t) return;

    let w = t.width;
    let h = t.height;
    if (orientation === 'landscape' && w < h) {
      const temp = w;
      w = h;
      h = temp;
    } else if (orientation === 'portrait' && w > h) {
      const temp = w;
      w = h;
      h = temp;
    }

    setWidth(w);
    setHeight(h);
    setWidthUnit(t.unit);
    setHeightUnit(t.unit);
  };

  const handleWidthChange = (val: number) => {
    setWidth(val);
    setTemplateId('custom');
  };

  const handleHeightChange = (val: number) => {
    setHeight(val);
    setTemplateId('custom');
  };

  const handleWidthUnitChange = (nextUnit: PageUnit) => {
    const converted = convertUnit(width, widthUnit, nextUnit);
    setWidth(converted);
    setWidthUnit(nextUnit);
    setTemplateId('custom');
  };

  const handleHeightUnitChange = (nextUnit: PageUnit) => {
    const converted = convertUnit(height, heightUnit, nextUnit);
    setHeight(converted);
    setHeightUnit(nextUnit);
    setTemplateId('custom');
  };

  const handleOrientationChange = (nextOrientation: PageOrientation) => {
    if (nextOrientation === orientation) return;
    setOrientation(nextOrientation);
    // Intercambiar dimensiones
    const tempW = width;
    const tempWUnit = widthUnit;
    setWidth(height);
    setWidthUnit(heightUnit);
    setHeight(tempW);
    setHeightUnit(tempWUnit);
    setTemplateId('custom');
  };

  const handleCurrentPage = () => {
    if (!pdfBytes) return;
    const dim = pageDimensions[currentPageIndex];
    if (!dim || dim.width <= 0 || dim.height <= 0) return;

    const w = fromPoints(dim.width, widthUnit);
    const h = fromPoints(dim.height, heightUnit);
    setWidth(w);
    setHeight(h);
    setOrientation(dim.width > dim.height ? 'landscape' : 'portrait');
    setTemplateId('custom');
    showToast(`Dimensions copied from page ${currentPageIndex + 1}.`);
  };

  const handleSetAsDefault = () => {
    saveDefaultNewPdfSettings({
      templateId,
      width,
      height,
      widthUnit,
      heightUnit,
      orientation,
      style,
      pageCount,
    });
    showToast('Default page setup saved.');
  };

  const handleCreate = async () => {
    if (width <= 0 || height <= 0 || pageCount < 1) {
      showToast('Please specify valid page dimensions and page count.');
      return;
    }

    setBusy(true);
    try {
      const bytes = await createNewBlankPdf({
        width,
        height,
        widthUnit,
        heightUnit,
        orientation,
        style,
        pageCount,
      });

      // Calcular nombre único para documento no guardado
      const tabs = useDocumentTabsStore.getState().tabs;
      let newName = 'Untitled.pdf';
      let index = 2;
      while (tabs.some((t) => t.fileName === newName)) {
        newName = `Untitled-${index}.pdf`;
        index++;
      }

      await loadPdfData(null, newName, bytes);
      useMarkupStore.setState({ isDirty: true });
      useDocumentTabsStore.getState().markActiveTabDirty();
      close(null);
      showToast(`Created new document: ${newName}`);
    } catch (err) {
      console.error('[NewPdfDialog] Failed to generate blank PDF:', err);
      showToast(`Failed to create new PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New PDF"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none"
    >
      <div className="bg-cad-panel border border-cad-border rounded-lg shadow-float w-full max-w-md overflow-hidden text-xs flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-cad-border bg-cad-panel/60">
          <FilePlus2 size={16} className="text-cad-accent" />
          <span className="font-semibold text-cad-strong text-sm">New</span>
          <button
            type="button"
            onClick={() => close(null)}
            title="Close"
            aria-label="Close"
            className="ml-auto p-1 rounded hover:bg-cad-hover text-gray-400 hover:text-gray-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo del formulario */}
        <div className="p-4 space-y-4">
          <fieldset className="border border-cad-border rounded-lg p-3 pt-1 space-y-3">
            <legend className="px-1.5 text-xs text-cad-strong font-medium">Page</legend>

            {/* Template */}
            <div className="flex items-center gap-2">
              <label htmlFor="new-pdf-template" className="w-20 text-gray-300 font-medium shrink-0">
                Template:
              </label>
              <select
                id="new-pdf-template"
                data-testid="new-pdf-template"
                value={templateId}
                onChange={handleTemplateChange}
                className="ui-input flex-1 py-1"
              >
                {NEW_PDF_TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Width & Height con botón Current Page al lado */}
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                {/* Width */}
                <div className="flex items-center gap-2">
                  <label htmlFor="new-pdf-width" className="w-16 text-gray-300 font-medium shrink-0">
                    Width:
                  </label>
                  <input
                    id="new-pdf-width"
                    type="number"
                    step="any"
                    min="0.1"
                    data-testid="new-pdf-width"
                    value={width}
                    onChange={(e) => handleWidthChange(parseFloat(e.target.value) || 0)}
                    className="ui-input w-24 py-1"
                  />
                  <select
                    data-testid="new-pdf-width-unit"
                    value={widthUnit}
                    onChange={(e) => handleWidthUnitChange(e.target.value as PageUnit)}
                    className="ui-input py-1 text-2xs"
                  >
                    <option value="cm">Centimeters</option>
                    <option value="mm">Millimeters</option>
                    <option value="in">Inches</option>
                    <option value="pt">Points</option>
                  </select>
                </div>

                {/* Height */}
                <div className="flex items-center gap-2">
                  <label htmlFor="new-pdf-height" className="w-16 text-gray-300 font-medium shrink-0">
                    Height:
                  </label>
                  <input
                    id="new-pdf-height"
                    type="number"
                    step="any"
                    min="0.1"
                    data-testid="new-pdf-height"
                    value={height}
                    onChange={(e) => handleHeightChange(parseFloat(e.target.value) || 0)}
                    className="ui-input w-24 py-1"
                  />
                  <select
                    data-testid="new-pdf-height-unit"
                    value={heightUnit}
                    onChange={(e) => handleHeightUnitChange(e.target.value as PageUnit)}
                    className="ui-input py-1 text-2xs"
                  >
                    <option value="cm">Centimeters</option>
                    <option value="mm">Millimeters</option>
                    <option value="in">Inches</option>
                    <option value="pt">Points</option>
                  </select>
                </div>
              </div>

              {/* Botón Current Page */}
              <button
                type="button"
                data-testid="new-pdf-current-page"
                disabled={!pdfBytes}
                onClick={handleCurrentPage}
                title={pdfBytes ? 'Copy dimensions from current page' : 'No document currently open'}
                className="px-2.5 py-3 rounded border border-cad-border bg-cad-subtle hover:bg-cad-hover text-2xs font-medium text-cad-strong disabled:opacity-40 disabled:hover:bg-cad-subtle self-stretch flex items-center justify-center text-center max-w-[5.5rem] leading-tight"
              >
                Current Page
              </button>
            </div>

            {/* Orientation */}
            <div className="flex items-center gap-3 pt-1">
              <span className="w-20 text-gray-300 font-medium shrink-0">Orientation:</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer text-gray-200">
                  <input
                    type="radio"
                    name="new-pdf-orientation"
                    data-testid="new-pdf-portrait"
                    value="portrait"
                    checked={orientation === 'portrait'}
                    onChange={() => handleOrientationChange('portrait')}
                    className="accent-cad-accent cursor-pointer"
                  />
                  Portrait
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-gray-200">
                  <input
                    type="radio"
                    name="new-pdf-orientation"
                    data-testid="new-pdf-landscape"
                    value="landscape"
                    checked={orientation === 'landscape'}
                    onChange={() => handleOrientationChange('landscape')}
                    className="accent-cad-accent cursor-pointer"
                  />
                  Landscape
                </label>
              </div>
            </div>

            {/* Style */}
            <div className="flex items-center gap-2">
              <label htmlFor="new-pdf-style" className="w-20 text-gray-300 font-medium shrink-0">
                Style:
              </label>
              <select
                id="new-pdf-style"
                data-testid="new-pdf-style"
                value={style}
                onChange={(e) => setStyle(e.target.value as BlankPageStyle)}
                className="ui-input flex-1 py-1"
              >
                <option value="blank">Blank</option>
                <option value="grid">Grid</option>
                <option value="lined">Lined</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>

            {/* Page Count */}
            <div className="flex items-center gap-2">
              <label htmlFor="new-pdf-page-count" className="w-20 text-gray-300 font-medium shrink-0">
                Page Count:
              </label>
              <input
                id="new-pdf-page-count"
                type="number"
                min="1"
                max="500"
                data-testid="new-pdf-page-count"
                value={pageCount}
                onChange={(e) => setPageCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                className="ui-input w-24 py-1"
              />
            </div>
          </fieldset>
        </div>

        {/* Pie de diálogo */}
        <div className="flex items-center justify-between px-4 h-12 border-t border-cad-border bg-cad-panel/40">
          <button
            type="button"
            data-testid="new-pdf-set-default"
            onClick={handleSetAsDefault}
            className="px-3 py-1.5 rounded text-xs font-medium border border-cad-border bg-cad-subtle hover:bg-cad-hover text-gray-300 transition-colors"
          >
            Set as Default
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="new-pdf-cancel"
              onClick={() => close(null)}
              className="ui-btn !px-4"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="new-pdf-ok"
              disabled={busy}
              onClick={() => void handleCreate()}
              className="ui-btn ui-btn-primary !px-4"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
