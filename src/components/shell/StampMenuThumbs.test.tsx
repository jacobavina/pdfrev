import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MenuBar } from './MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useToolStore } from '../../store/useToolStore';

describe('Menú Tools ▸ Stamp con miniaturas y filas compactas (ADR-0136)', () => {
  beforeEach(() => {
    act(() => {
      useDocumentStore.setState({ pdfBytes: new Uint8Array([1]), numPages: 1 });
      useToolStore.setState({ activeTool: 'select' });
    });
  });

  const openStamps = () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-herramientas'));
    fireEvent.mouseEnter(screen.getByTestId('menu-tools-stamp').parentElement!);
  };

  it('cada sello muestra su dibujo real en una miniatura que no se encoge al tamaño de un ícono', () => {
    openStamps();
    const item = screen.getByTestId('menu-stamp-rv-approved');
    const thumb = item.querySelector('svg[data-stamp="rv-approved"]') as SVGElement;
    expect(thumb).not.toBeNull();
    // El tamaño va en línea: la regla de íconos del menú (16 px) no lo pisa
    expect(parseFloat(thumb.style.width)).toBeGreaterThan(40);
    expect(parseFloat(thumb.style.width)).toBeLessThanOrEqual(76);
    expect(thumb.style.height).toBe('22px');
  });

  it('el nombre va sin el sufijo del grupo y el grupo aparece a la derecha; elegir un sello activa la herramienta', () => {
    openStamps();
    const item = screen.getByTestId('menu-stamp-rv-approved');
    expect(item).toHaveTextContent('APPROVED');
    expect(item).toHaveTextContent('Revu');
    expect(item).not.toHaveTextContent('APPROVED · Revu');
    fireEvent.click(item);
    expect(useToolStore.getState().activeTool).toBe('stamp');
    expect(useToolStore.getState().activeStampId).toBe('rv-approved');
  });

  it('las filas de los menús son compactas: relleno vertical mínimo y texto de 12 px', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-archivo'));
    const row = screen.getByTestId('menu-batch');
    expect(row.className).toContain('py-[2px]');
    expect(row.className).toContain('text-xs');
    expect(row.className).not.toContain('py-1.5');
  });
});
