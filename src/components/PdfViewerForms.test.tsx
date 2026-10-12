import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { useAttachmentStore } from '../store/useAttachmentStore';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const openExternalUrl = vi.fn();
vi.mock('../services/linkService', async (orig) => {
  const actual = await orig<typeof import('../services/linkService')>();
  return {
    ...actual,
    openExternalUrl: (url: string) => openExternalUrl(url),
    pickAttachmentFile: vi.fn().mockResolvedValue({
      name: 'RFI-012.pdf',
      mime: 'application/pdf',
      bytes: new Uint8Array([37, 80, 68, 70]),
    }),
  };
});

const click = (svg: Element, x: number, y: number) => {
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
  });
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
  });
};

const renderViewer = async () => {
  await act(async () => {
    render(<PdfViewer />);
  });
};

describe('Hyperlink, File Attachment y Form (ADR-0027)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      numPages: 3,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as never,
    });
    useUiStore.setState({ hiddenLayers: [] });
    useAttachmentStore.getState().resetAttachments();
    useToolStore.setState({ activeTool: 'select', activeFieldType: 'text' });
    openExternalUrl.mockClear();
  });

  it('Form: los botones de opción seguidos forman un grupo y el doble clic elige uno y libera los demás', async () => {
    await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'formField', activeFieldType: 'radio' }));
    const svg = screen.getByTestId('markup-overlay-svg');
    click(svg, 100, 100);
    click(svg, 200, 100);
    const radios = useMarkupStore.getState().markups;
    expect(radios.map((m) => m.customFields?.fieldName)).toEqual(['Group1', 'Group1']);
    expect(radios.map((m) => m.customFields?.radioValue)).toEqual(['Choice1', 'Choice2']);

    act(() => useToolStore.setState({ activeTool: 'select' }));
    act(() => {
      fireEvent.doubleClick(svg, { clientX: 100, clientY: 100 });
    });
    expect(useMarkupStore.getState().markups.map((m) => m.customFields?.fieldValue)).toEqual(['Yes', 'Off']);
    act(() => {
      fireEvent.doubleClick(svg, { clientX: 200, clientY: 100 });
    });
    expect(useMarkupStore.getState().markups.map((m) => m.customFields?.fieldValue)).toEqual(['Off', 'Yes']);
  });

  it('Form: la casilla se crea con nombre automático y el doble clic la marca y desmarca (deshacible)', async () => {
    await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'formField', activeFieldType: 'checkbox' }));
    const svg = screen.getByTestId('markup-overlay-svg');
    click(svg, 300, 300);
    const [box] = useMarkupStore.getState().markups;
    expect(box.type).toBe('formField');
    expect(box.customFields).toMatchObject({ fieldType: 'checkbox', fieldName: 'Check1', fieldValue: 'Off' });
    act(() => useToolStore.setState({ activeTool: 'select' }));
    act(() => {
      fireEvent.doubleClick(svg, { clientX: 300, clientY: 300 });
    });
    expect(useMarkupStore.getState().markups[0].customFields?.fieldValue).toBe('Yes');
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].customFields?.fieldValue).toBe('Off');
  });

  it('Hyperlink: el recuadro abre el diálogo; con una URL crea el enlace y Ctrl+clic lo sigue', async () => {
    await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'link' }));
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => {
      fireEvent.mouseDown(svg, { button: 0, clientX: 100, clientY: 400 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 300, clientY: 440 });
    });
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 300, clientY: 440 });
    });
    const url = await screen.findByTestId('link-url');
    act(() => {
      fireEvent.change(url, { target: { value: 'example.com/specs' } });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('link-confirm'));
    });
    const [link] = useMarkupStore.getState().markups;
    expect(link.type).toBe('link');
    expect(link.customFields?.linkUri).toBe('https://example.com/specs');

    act(() => useToolStore.setState({ activeTool: 'select' }));
    act(() => {
      fireEvent.mouseDown(svg, { button: 0, clientX: 200, clientY: 420, ctrlKey: true });
    });
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/specs');
  });

  it('File Attachment: un clic pide el archivo, lo guarda en el documento y crea la marca con su nombre', async () => {
    await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'fileAttachment' }));
    click(screen.getByTestId('markup-overlay-svg'), 500, 200);
    // Elegir el archivo es asíncrono: la marca aparece al resolverse
    await waitFor(() => expect(useMarkupStore.getState().markups).toHaveLength(1));
    const [att] = useMarkupStore.getState().markups;
    expect(att.type).toBe('fileAttachment');
    expect(att.text).toBe('RFI-012.pdf');
    const stored = useAttachmentStore.getState().getAttachment(String(att.customFields?.attachmentKey));
    expect(stored?.bytes).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('enlaces propios del PDF: un clic con Seleccionar va a la página destino (índice de láminas)', async () => {
    const page = {
      rotate: 0,
      getViewport: () => ({
        width: 800,
        height: 600,
        // Conversión de coordenadas PDF (y hacia arriba) a la vista (y hacia abajo)
        convertToViewportRectangle: (r: number[]) => [r[0], 600 - r[1], r[2], 600 - r[3]],
      }),
      getAnnotations: async () => [{ subtype: 'Link', rect: [100, 500, 300, 540], dest: [{ num: 9, gen: 0 }, { name: 'Fit' }] }],
    };
    useDocumentStore.setState({
      pdfDoc: { getPage: async () => page, getPageIndex: async () => 2 } as never,
      numPages: 3,
    });
    await renderViewer();
    const area = await screen.findByTestId('pdf-link-0');
    expect(area.querySelector('title')?.textContent).toBe('Go to page 3');
    act(() => {
      fireEvent.mouseDown(screen.getByTestId('markup-overlay-svg'), { button: 0, clientX: 200, clientY: 80 });
    });
    expect(useDocumentStore.getState().currentPageIndex).toBe(2);
  });
});
