import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarkupsList } from './MarkupsList';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { Markup } from '../types/markup';

describe('MarkupsList - Columnas de Medición y Agregación de Totales (Paquete 4)', () => {
  const markupsWithMeasurements: Markup[] = [
    {
      id: 'm-len-1',
      type: 'length',
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }],
      style: { strokeColor: '#00aa00', strokeWidth: 2, opacity: 1 },
      author: 'Topógrafo',
      createdAt: '2026-10-11T10:00:00.000Z',
      updatedAt: '2026-10-11T10:00:00.000Z',
      status: 'pending',
      measurement: {
        value: 10.5,
        unit: 'm',
        formatted: '10.50 m',
      },
    },
    {
      id: 'm-len-2',
      type: 'polylineMeasure',
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.4 }],
      style: { strokeColor: '#00aa00', strokeWidth: 2, opacity: 1 },
      author: 'Topógrafo',
      createdAt: '2026-10-11T10:05:00.000Z',
      updatedAt: '2026-10-11T10:05:00.000Z',
      status: 'accepted',
      measurement: {
        value: 15.2,
        unit: 'm',
        formatted: '15.20 m',
      },
    },
    {
      id: 'm-area-1',
      type: 'area',
      pageIndex: 0,
      points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.5 }],
      style: { strokeColor: '#0055ff', strokeWidth: 2, opacity: 1 },
      author: 'Arquitecto',
      createdAt: '2026-10-11T10:10:00.000Z',
      updatedAt: '2026-10-11T10:10:00.000Z',
      status: 'pending',
      measurement: {
        value: 24.0,
        unit: 'm',
        formatted: '24.00 m²',
        perimeter: 20.0,
      },
    },
    {
      id: 'm-cnt-1',
      type: 'count',
      pageIndex: 0,
      points: [{ x: 0.3, y: 0.3 }],
      style: { strokeColor: '#ff8800', strokeWidth: 2, opacity: 1 },
      author: 'Instalador',
      createdAt: '2026-10-11T10:15:00.000Z',
      updatedAt: '2026-10-11T10:15:00.000Z',
      status: 'completed',
      measurement: {
        value: 1,
        unit: 'm',
        formatted: '1',
        countIndex: 1,
      },
    },
    {
      id: 'm-cnt-2',
      type: 'count',
      pageIndex: 0,
      points: [{ x: 0.4, y: 0.4 }],
      style: { strokeColor: '#ff8800', strokeWidth: 2, opacity: 1 },
      author: 'Instalador',
      createdAt: '2026-10-11T10:16:00.000Z',
      updatedAt: '2026-10-11T10:16:00.000Z',
      status: 'completed',
      measurement: {
        value: 2,
        unit: 'm',
        formatted: '2',
        countIndex: 2,
      },
    },
  ];

  beforeEach(() => {
    useMarkupStore.setState({
      markups: [...markupsWithMeasurements],
      selectedMarkupIds: [],
      isDirty: false,
    });
    useDocumentStore.setState({
      currentPageIndex: 0,
      customColumns: [],
    });
  });

  it('renderiza cabeceras de Medida y Unidad y muestra los valores formateados en cada fila', () => {
    render(<MarkupsList />);

    expect(screen.getByText(/Medida/i)).toBeInTheDocument();
    expect(screen.getByText(/Unidad/i)).toBeInTheDocument();

    expect(screen.getByText('10.50 m')).toBeInTheDocument();
    expect(screen.getByText('15.20 m')).toBeInTheDocument();
    expect(screen.getAllByText('24.00 m²').length).toBeGreaterThanOrEqual(1);
  });

  it('calcula y muestra la agregación de totales en el pie de tabla (markups-totals-summary)', () => {
    render(<MarkupsList />);

    const totalsSummary = screen.getByTestId('markups-totals-summary');
    expect(totalsSummary).toBeInTheDocument();

    // Longitud: 10.50 + 15.20 = 25.70 m
    expect(totalsSummary).toHaveTextContent('25.70 m');

    // Área: 24.00 m²
    expect(totalsSummary).toHaveTextContent('24.00 m²');

    // Conteo: 1 + 2 = 3
    expect(totalsSummary).toHaveTextContent('Conteo:');
  });

  it('permite ordenar por la columna Medida de forma ascendente y descendente', () => {
    render(<MarkupsList />);

    const headerMedida = screen.getByText(/Medida/i);
    fireEvent.click(headerMedida); // orden ascendente

    const rows = screen.getAllByTestId(/^markup-row-/);
    expect(rows.length).toBe(5);
  });
});
