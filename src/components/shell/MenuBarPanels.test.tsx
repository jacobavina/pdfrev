import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MenuBar } from './MenuBar';
import { ThumbnailsSidebar } from '../ThumbnailsSidebar';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useUiStore } from '../../store/useUiStore';

vi.mock('../../services/pdfService', () => ({ renderThumbnail: vi.fn().mockResolvedValue(undefined) }));

describe('View ▸ Panels y etiquetas de miniatura (ADR-0112)', () => {
  beforeEach(() => {
    useDocumentStore.setState({ numPages: 2, currentPageIndex: 0, pdfBytes: new Uint8Array([1]), pdfDoc: { numPages: 2 } as never, pageLabels: null });
  });

  it('los paneles se agrupan en un submenú Panels y siguen abriéndose desde ahí', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    // Ya no cuelgan sueltos del menú View
    expect(screen.queryByRole('menuitem', { name: /Layers Panel/ })).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('menu-view-panels').parentElement!);
    for (const id of ['thumbnails', 'bookmarks', 'layers', 'properties', 'measurements']) expect(screen.getByTestId(`menu-panel-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId('menu-view-markups-list')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('menu-panel-layers'));
    expect(useUiStore.getState().leftTab).toBe('layers');
  });

  it('Markups List sigue en Panels con su atajo y su marca de activo', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.mouseEnter(screen.getByTestId('menu-view-panels').parentElement!);
    expect(screen.getByTestId('menu-view-markups-list')).toHaveTextContent('Alt+L');
  });

  it('la etiqueta "Page N" de una miniatura va en una sola línea, con elipsis y el texto entero en el título', () => {
    render(<ThumbnailsSidebar />);
    const label = screen.getByTestId('page-label-0');
    expect(label.className).toContain('truncate');
    expect(label.className).toContain('whitespace-nowrap');
    expect(label).toHaveAttribute('title', 'Page 1');
  });
});
