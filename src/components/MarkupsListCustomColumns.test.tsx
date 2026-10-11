import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MarkupsList } from './MarkupsList';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { Markup, BbxCustomColumn } from '../types/markup';

describe('MarkupsList - Gestión y Edición de Columnas Personalizadas (P2-C.3)', () => {
  const sampleMarkup: Markup = {
    id: 'm-test-1',
    type: 'rectangle',
    pageIndex: 0,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.4 },
    ],
    style: { strokeColor: '#ff0000', strokeWidth: 3, opacity: 0.8 },
    author: 'Revisor CAD',
    createdAt: '2026-10-10T12:00:00.000Z',
    updatedAt: '2026-10-10T12:00:00.000Z',
    status: 'pending',
    customFields: {
      largo: 15,
      material: 'Acero',
    },
  };

  const initialColumns: BbxCustomColumn[] = [
    { id: 'largo', nombre: 'Largo', tipo: 'number' },
    { id: 'material', nombre: 'Material', tipo: 'choice', opciones: ['Acero', 'Hormigón', 'Madera'] },
    {
      id: 'area_calc',
      nombre: 'Área Calc',
      tipo: 'formula',
      expresion: '{largo} * strokeWidth',
    },
    {
      id: 'div_zero',
      nombre: 'Div Zero',
      tipo: 'formula',
      expresion: '100 / ({largo} - 15)', // 15 - 15 = 0 => DIV0
    },
  ];

  beforeEach(() => {
    useMarkupStore.setState({
      markups: [sampleMarkup],
      selectedMarkupIds: [],
      isDirty: false,
    });
    useDocumentStore.setState({
      currentPageIndex: 0,
      customColumns: [...initialColumns],
    });
  });

  it('renderiza cabeceras de columnas personalizadas y sus celdas correspondientes', () => {
    render(<MarkupsList />);

    // Cabeceras
    expect(screen.getByTestId('custom-column-header-largo')).toBeDefined();
    expect(screen.getByTestId('custom-column-header-material')).toBeDefined();
    expect(screen.getByTestId('custom-column-header-area_calc')).toBeDefined();
    expect(screen.getByTestId('custom-column-header-div_zero')).toBeDefined();

    // Celdas
    const largoCell = screen.getByTestId('custom-column-cell-m-test-1-largo');
    expect(largoCell).toBeDefined();
    const largoInput = largoCell.querySelector('input') as HTMLInputElement;
    expect(largoInput.value).toBe('15');

    const materialCell = screen.getByTestId('custom-column-cell-m-test-1-material');
    const materialSelect = materialCell.querySelector('select') as HTMLSelectElement;
    expect(materialSelect.value).toBe('Acero');

    // Celda de fórmula calculada: 15 * 3 = 45
    const areaCell = screen.getByTestId('custom-column-cell-m-test-1-area_calc');
    expect(areaCell.textContent).toContain('45');

    // Celda con error DIV0
    const divZeroCell = screen.getByTestId('custom-column-cell-m-test-1-div_zero');
    expect(divZeroCell.textContent).toContain('#DIV0!');
  });

  it('permite abrir el modal de nueva columna y valida expresiones en tiempo real', () => {
    render(<MarkupsList />);

    const addBtn = screen.getByTestId('add-custom-column-button');
    fireEvent.click(addBtn);

    expect(screen.getByTestId('add-column-modal')).toBeDefined();

    const nameInput = screen.getByTestId('column-name-input');
    const typeSelect = screen.getByTestId('column-type-select');

    fireEvent.change(nameInput, { target: { value: 'Superficie Estimada' } });
    fireEvent.change(typeSelect, { target: { value: 'formula' } });

    const exprInput = screen.getByTestId('column-expression-input');

    // Expresión inválida con sintaxis rota
    fireEvent.change(exprInput, { target: { value: '10 + * 5' } });
    expect(screen.getByTestId('formula-syntax-error')).toBeDefined();

    const saveBtn = screen.getByTestId('save-column-button') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    // Corregir a expresión válida
    fireEvent.change(exprInput, { target: { value: '{largo} * 2' } });
    expect(screen.queryByTestId('formula-syntax-error')).toBeNull();
    expect(saveBtn.disabled).toBe(false);

    // Guardar
    fireEvent.click(saveBtn);
    expect(screen.queryByTestId('add-column-modal')).toBeNull();

    // La nueva columna debe estar en el store
    const cols = useDocumentStore.getState().customColumns;
    expect(cols?.some((c) => c.nombre === 'Superficie Estimada')).toBe(true);
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('edita el valor de una celda numérica y registra el cambio con soporte undo', () => {
    render(<MarkupsList />);

    const largoCell = screen.getByTestId('custom-column-cell-m-test-1-largo');
    const largoInput = largoCell.querySelector('input') as HTMLInputElement;

    fireEvent.change(largoInput, { target: { value: '30' } });

    const currentMarkups = useMarkupStore.getState().markups;
    expect(currentMarkups[0].customFields?.largo).toBe(30);
    expect(useMarkupStore.getState().canUndo).toBe(true);

    // Deshacer cambio
    act(() => {
      useMarkupStore.getState().undo();
    });
    expect(useMarkupStore.getState().markups[0].customFields?.largo).toBe(15);
  });

  it('elimina una columna con confirmación y limpia sus valores de las marcas', () => {
    render(<MarkupsList />);

    const deleteBtn = screen.getByTestId('delete-column-btn-largo');
    fireEvent.click(deleteBtn);

    expect(screen.getByTestId('delete-column-confirmation-modal')).toBeDefined();

    const confirmBtn = screen.getByTestId('confirm-delete-column-btn');
    act(() => {
      fireEvent.click(confirmBtn);
    });

    expect(screen.queryByTestId('delete-column-confirmation-modal')).toBeNull();

    const cols = useDocumentStore.getState().customColumns;
    expect(cols?.some((c) => c.id === 'largo')).toBe(false);

    // Verificar que el campo se limpió de la marca
    const markup = useMarkupStore.getState().markups[0];
    expect(markup.customFields?.largo).toBeUndefined();
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });
});
