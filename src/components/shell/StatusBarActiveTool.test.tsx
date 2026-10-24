import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StatusBar } from './StatusBar';
import { useToolStore } from '../../store/useToolStore';

describe('Herramienta activa en la barra de estado (ADR-0134)', () => {
  beforeEach(() => {
    act(() => useToolStore.setState({ activeTool: 'select' }));
  });

  it('muestra el nombre corto de la herramienta de la cinta y cambia con ella', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('active-tool')).toHaveTextContent('Tool:Select');
    act(() => useToolStore.setState({ activeTool: 'rectangle' }));
    expect(screen.getByTestId('active-tool')).toHaveTextContent('Tool:Rectangle');
    expect(screen.getByTestId('active-tool')).toHaveAttribute('title', expect.stringContaining('Rectangle'));
  });

  it('las herramientas que no están en la cinta tienen nombre propio', () => {
    render(<StatusBar />);
    act(() => useToolStore.setState({ activeTool: 'link' }));
    expect(screen.getByTestId('active-tool')).toHaveTextContent('Tool:Hyperlink');
  });
});
