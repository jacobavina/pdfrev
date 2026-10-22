import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureGuideDialog } from './FeatureGuideDialog';
import { useUiStore } from '../../store/useUiStore';

describe('Diálogo de la guía de funciones (ADR-0100)', () => {
  beforeEach(() => useUiStore.setState({ featureGuideOpen: true }));

  it('muestra las secciones, filtra al buscar y se cierra con Escape', () => {
    render(<FeatureGuideDialog />);
    expect(screen.getByTestId('feature-guide')).toBeInTheDocument();
    // La primera sección se ve entera; otra se abre desde la lista
    expect(screen.getByTestId('feature-guide-entry-open')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('feature-guide-section-measure'));
    expect(screen.getByTestId('feature-guide-entry-dynamic-fill')).toHaveTextContent('Dynamic Fill');
    expect(screen.queryByTestId('feature-guide-entry-open')).toBeNull();
    // Al buscar se cruzan todas las secciones
    fireEvent.change(screen.getByTestId('feature-guide-search'), { target: { value: 'unflatten' } });
    expect(screen.getByTestId('feature-guide-entry-flatten')).toBeInTheDocument();
    expect(screen.queryByTestId('feature-guide-entry-dynamic-fill')).toBeNull();
    fireEvent.change(screen.getByTestId('feature-guide-search'), { target: { value: 'zzzz-no-existe' } });
    expect(screen.getByTestId('feature-guide-results')).toHaveTextContent('Nothing matches');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().featureGuideOpen).toBe(false);
  });
});
