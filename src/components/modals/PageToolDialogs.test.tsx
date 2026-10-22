import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { CropPagesDialog } from './CropPagesDialog';
import { NumberPagesDialog } from './NumberPagesDialog';
import { DocumentPropertiesDialog } from './DocumentPropertiesDialog';
import { MenuBar } from '../shell/MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useUiStore } from '../../store/useUiStore';
import { readPageGeometry, viewSize } from '../../core/pages/pageBoxes';
import { readDocumentProperties } from '../../core/pages/documentProperties';
import type { Markup } from '../../types/markup';

const toasts: string[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/pdfService', () => ({
  loadPdfDocument: vi.fn().mockImplementation(async (bytes: Uint8Array) => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { numPages: doc.getPageCount() } as never;
  }),
}));

const rect = (id: string, x: number): Markup =>
  ({ id, type: 'rectangle', pageIndex: 0, points: [{ x, y: 0.4 }, { x: x + 0.1, y: 0.6 }], style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending' }) as Markup;

const change = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const openDialog = (d: 'properties' | 'crop' | 'number') => act(() => useUiStore.setState({ pageToolDialog: d }));

let savedBytes: Uint8Array;

describe('Diálogos de Crop Pages, Number Pages y Document Properties (ADR-0113)', () => {
  beforeEach(async () => {
    toasts.length = 0;
    const doc = await PDFDocument.create();
    doc.setTitle('Plano original');
    doc.addPage([600, 400]);
    doc.addPage([600, 400]);
    const bytes = await doc.save();
    savedBytes = bytes;
    useDocumentStore.setState({ filePath: 'C:/planos/a.pdf', fileName: 'a.pdf', pdfBytes: bytes, numPages: 2, currentPageIndex: 0, scale: 1, rotation: 0, pdfDoc: { numPages: 2 } as never });
    useMarkupStore.setState({ markups: [rect('m', 0.3)], selectedMarkupIds: [] });
    useCalibrationStore.setState({ calibrations: {}, viewports: {} });
    useUiStore.setState({ pageToolDialog: null });
  });

  it('Document ▸ Crop Pages, Number Pages y Document Properties abren su diálogo y están desactivados sin documento', () => {
    useDocumentStore.setState({ pdfBytes: null, numPages: 0 });
    const { unmount } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    expect(screen.getByTestId('menu-crop-pages')).toBeDisabled();
    expect(screen.getByTestId('menu-document-properties')).toBeDisabled();
    unmount();
    useDocumentStore.setState({ pdfBytes: savedBytes, numPages: 2 });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    fireEvent.click(screen.getByTestId('menu-crop-pages'));
    expect(useUiStore.getState().pageToolDialog).toBe('crop');
    fireEvent.click(screen.getByTestId('menu-documento'));
    fireEvent.click(screen.getByTestId('menu-number-pages'));
    expect(useUiStore.getState().pageToolDialog).toBe('number');
    fireEvent.click(screen.getByTestId('menu-documento'));
    fireEvent.click(screen.getByTestId('menu-document-properties'));
    expect(useUiStore.getState().pageToolDialog).toBe('properties');
  });

  it('Crop: muestra el tamaño que tendrá la página, avisa si una marca no cabe y recorta con los márgenes elegidos', async () => {
    openDialog('crop');
    render(<CropPagesDialog />);
    change('crop-top', '0');
    change('crop-bottom', '0');
    change('crop-left', '10');
    change('crop-right', '10');
    // Página de 600×400 pt = 212×141 mm; con 10 mm a cada lado queda de 192×141 mm
    await waitFor(() => expect(screen.getByTestId('crop-result')).toHaveTextContent('192 × 141 mm'));
    expect(screen.getByTestId('crop-apply')).not.toBeDisabled();
    // Con 100 mm a la izquierda la marca (x=180 pt) quedaría fuera
    change('crop-left', '100');
    await waitFor(() => expect(screen.getByTestId('crop-problem')).toHaveTextContent('1 markup would fall outside the crop'));
    expect(screen.getByTestId('crop-apply')).toBeDisabled();
    change('crop-left', '10');
    await waitFor(() => expect(screen.getByTestId('crop-apply')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('crop-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    const [g] = await readPageGeometry(useDocumentStore.getState().pdfBytes!);
    expect(viewSize(g.transform).width).toBeCloseTo(600 - 2 * 10 * (72 / 25.4), 4);
    expect(toasts.at(-1)).toBe('1 page cropped.');
  });

  it('Crop: una lista de páginas no válida lo explica y las unidades cambian la conversión', async () => {
    openDialog('crop');
    render(<CropPagesDialog />);
    fireEvent.click(screen.getByTestId('crop-scope-range'));
    change('crop-range', '5-9');
    expect(screen.getByTestId('crop-problem')).toHaveTextContent('Type the pages like 1-3, 5, 8-10.');
    expect(screen.getByTestId('crop-apply')).toBeDisabled();
    change('crop-range', '1-2');
    change('crop-unit', 'pt');
    change('crop-top', '0');
    change('crop-bottom', '0');
    change('crop-left', '0');
    change('crop-right', '36');
    fireEvent.click(screen.getByTestId('crop-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(toasts.at(-1)).toBe('2 pages cropped.');
  });

  it('Number Pages: enseña cómo se leerá la primera página, rechaza datos no válidos y numera las páginas elegidas', async () => {
    openDialog('number');
    render(<NumberPagesDialog />);
    expect(screen.getByTestId('number-sample')).toHaveTextContent('Page 1 of 2');
    change('number-format', 'Hoja {n} / {total}');
    change('number-start', '10');
    expect(screen.getByTestId('number-sample')).toHaveTextContent('Hoja 10 / 11');
    change('number-size', '2');
    expect(screen.getByTestId('number-problem')).toHaveTextContent('between 4 and 72');
    expect(screen.getByTestId('number-apply')).toBeDisabled();
    change('number-size', '12');
    fireEvent.click(screen.getByTestId('number-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(toasts.at(-1)).toBe('Numbered 2 pages.');
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('Document Properties: muestra los datos del PDF, activa Apply al editar y guarda los cambios', async () => {
    openDialog('properties');
    render(<DocumentPropertiesDialog />);
    await waitFor(() => expect(screen.getByTestId('props-title')).toHaveValue('Plano original'));
    expect(screen.getByTestId('props-file')).toHaveTextContent('a.pdf');
    expect(screen.getByTestId('props-location')).toHaveTextContent('C:/planos/a.pdf');
    expect(screen.getByTestId('props-pages')).toHaveTextContent('2');
    expect(screen.getByTestId('props-page-size')).toHaveTextContent('212 × 141 mm');
    expect(screen.getByTestId('props-encrypted')).toHaveTextContent('No');
    expect(screen.getByTestId('props-apply')).toBeDisabled();
    change('props-title', 'Plano A-101');
    change('props-author', 'Estudio');
    expect(screen.getByTestId('props-apply')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('props-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    const p = await readDocumentProperties(useDocumentStore.getState().pdfBytes!);
    expect(p).toMatchObject({ title: 'Plano A-101', author: 'Estudio' });
    expect(toasts.at(-1)).toMatch(/Properties updated/);
  });

  it('Escape cierra cualquiera de los diálogos sin cambiar el documento', () => {
    const before = useDocumentStore.getState().pdfBytes;
    openDialog('crop');
    render(<CropPagesDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pageToolDialog).toBeNull();
    expect(useDocumentStore.getState().pdfBytes).toBe(before);
  });
});
