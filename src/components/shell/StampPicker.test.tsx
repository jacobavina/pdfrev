import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Ribbon } from './Ribbon';
import { useToolStore } from '../../store/useToolStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';

describe('Selector de sellos por secciones (ADR-0045)', () => {
  beforeEach(() => {
    useToolStore.setState({ activeTool: 'select', activeStampId: 'approved' });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ numPages: 1, currentPageIndex: 0, scale: 1, pdfBytes: new Uint8Array([1]) });
  });

  it('muestra las secciones de Revu y Foxit con la miniatura real de cada sello y elige el sello', async () => {
    render(<Ribbon />);
    fireEvent.click(screen.getByTestId('ribbon-tab-insert'));
    // Carga diferida del selector (ADR-0045)
    fireEvent.click(await screen.findByTestId('ribbon-stamp-picker'));
    for (const g of ['review', 'dynamic', 'standard', 'sign-here', 'construction']) {
      expect(screen.getByTestId(`ribbon-stamp-picker-group-${g}`)).toBeInTheDocument();
    }
    const option = screen.getByTestId('ribbon-stamp-picker-option-std-reviewed');
    expect(option.querySelector('svg[data-stamp="std-reviewed"] text')).toHaveTextContent('REVIEWED');
    fireEvent.click(option);
    expect(useToolStore.getState()).toMatchObject({ activeStampId: 'std-reviewed', activeTool: 'stamp' });
    expect(screen.queryByTestId('ribbon-stamp-picker-list')).toBeNull();
    expect(screen.getByTestId('ribbon-stamp-picker')).toHaveAttribute('data-value', 'std-reviewed');
  });
});
