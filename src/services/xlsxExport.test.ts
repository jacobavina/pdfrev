import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Markup, BbxCustomColumn } from '../types/markup';
import { buildXlsxTakeoffContent } from './exportService';
import { exportTakeoffToXlsx } from './xlsxExportService';

describe('xlsxExportService — Exportación Takeoff a Excel (.xlsx) con Fórmulas Vivas (ADR-0080)', () => {
  const defaultStyle = { strokeColor: '#0055ff', strokeWidth: 2, opacity: 1 };

  const sampleMarkups: Markup[] = [
    {
      id: 'm-drywall-1',
      type: 'area',
      pageIndex: 0,
      subject: 'Drywall Partition',
      layer: 'Arquitectura',
      author: 'Architect A',
      createdAt: '2026-10-17T08:00:00Z',
      updatedAt: '2026-10-17T08:00:00Z',
      status: 'accepted',
      style: defaultStyle,
      measurement: {
        value: 120.5,
        unit: 'ft',
        formatted: '120.50 sq ft',
      },
      unitPrice: 15.0,
      cost: 1807.5,
      text: 'Type A partition wall',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 12 },
        { x: 0, y: 12 },
      ],
    },
    {
      id: 'm-drywall-2',
      type: 'area',
      pageIndex: 0,
      subject: 'Drywall Partition',
      layer: 'Arquitectura',
      author: 'Architect A',
      createdAt: '2026-10-17T08:05:00Z',
      updatedAt: '2026-10-17T08:05:00Z',
      status: 'accepted',
      style: defaultStyle,
      measurement: {
        value: 80.0,
        unit: 'ft',
        formatted: '80.00 sq ft',
      },
      unitPrice: 15.0,
      cost: 1200.0,
      text: 'Type B corridor wall',
      points: [
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 8 },
        { x: 20, y: 8 },
      ],
    },
    {
      id: 'm-flooring-1',
      type: 'area',
      pageIndex: 1,
      subject: 'Tile Flooring',
      layer: 'Acabados',
      author: 'Estimator B',
      createdAt: '2026-10-17T08:10:00Z',
      updatedAt: '2026-10-17T08:10:00Z',
      status: 'accepted',
      style: defaultStyle,
      measurement: {
        value: 250.25,
        unit: 'ft',
        formatted: '250.25 sq ft',
      },
      unitPrice: 42.5,
      cost: 10635.63,
      text: 'Porcelain tile 60x60',
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 5 },
        { x: 0, y: 5 },
      ],
    },
    {
      id: 'm-door-1',
      type: 'count',
      pageIndex: 0,
      subject: 'Fire Doors',
      layer: 'Carpintería',
      author: 'Estimator B',
      createdAt: '2026-10-17T08:15:00Z',
      updatedAt: '2026-10-17T08:15:00Z',
      status: 'accepted',
      style: defaultStyle,
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ],
      measurement: {
        value: 3,
        unit: 'ft',
        formatted: '3',
      },
      unitPrice: 450.0,
      cost: 1350.0,
      text: 'Double fire door 90min',
    },
  ];

  it('genera un archivo .xlsx válido con partidas por Subject y fórmulas SUM y producto verificadas en el XML de la hoja', async () => {
    // 1. Generar los bytes del archivo .xlsx a través del servicio exportService
    const bytes = await buildXlsxTakeoffContent('Commercial Center Level 1', sampleMarkups, {
      currency: '$',
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);

    // 2. Cargar el libro con ExcelJS para validar modelo y propiedades
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheet = workbook.getWorksheet('Takeoff Schedule');
    expect(sheet).toBeDefined();

    // Validar cabeceras en fila 4
    const row4 = sheet!.getRow(4);
    expect(row4.getCell(1).value).toBe('Item');
    expect(row4.getCell(3).value).toBe('Subject');
    expect(row4.getCell(7).value).toBe('Quantity');
    expect(row4.getCell(9).value).toBe('Unit Price');
    expect(row4.getCell(10).value).toBe('Total Cost');

    // Buscar celdas con fórmulas en la hoja
    const productFormulas: string[] = [];
    const sumFormulas: string[] = [];

    sheet!.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.type === ExcelJS.ValueType.Formula) {
          const formulaStr = cell.formula;
          if (/^G\d+\*I\d+$/.test(formulaStr)) {
            productFormulas.push(formulaStr);
          } else if (formulaStr.startsWith('SUM(')) {
            sumFormulas.push(formulaStr);
          }
        }
      });
    });

    // Debe contener fórmulas de producto para cada una de las 4 partidas
    expect(productFormulas.length).toBe(4);
    expect(productFormulas[0]).toBe('G5*I5');
    expect(productFormulas[1]).toBe('G6*I6');

    // Debe contener fórmulas SUM para los subtotales de cada Subject y para el total general
    expect(sumFormulas.length).toBeGreaterThanOrEqual(3);
    const hasRangeSum = sumFormulas.some((f) => /^SUM\(J\d+:J\d+\)$/.test(f));
    expect(hasRangeSum).toBe(true);

    // Verificar que la marca de conteo tiene unidad 'ea'
    let countUnit = '';
    sheet!.eachRow((row) => {
      if (row.getCell(3).value === 'Fire Doors' && row.getCell(5).value === 'Count') {
        countUnit = String(row.getCell(8).value);
      }
    });
    expect(countUnit).toBe('ea');

    // 3. Inspeccionar directamente el XML dentro del archivo ZIP (.xlsx)
    const zip = await JSZip.loadAsync(bytes);
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('text');

    // El XML de la hoja debe contener etiquetas de fórmula <f> con multiplicación y con SUM
    expect(sheetXml).toContain('<f>G5*I5</f>');
    expect(sheetXml).toMatch(/<f>SUM\(J\d+:J\d+\)<\/f>/);
    expect(sheetXml).toMatch(/<f>SUM\(J\d+(,J\d+)*\)<\/f>/);
  });

  it('respalda catálogo de precios por Subject y añade hoja All Markups con columnas personalizadas', async () => {
    const markupsWithoutPrices: Markup[] = [
      {
        id: 'm-unpriced-1',
        type: 'area',
        pageIndex: 0,
        subject: 'Acoustic Ceiling',
        author: 'Architect A',
        createdAt: '2026-10-17T08:00:00Z',
        updatedAt: '2026-10-17T08:00:00Z',
        status: 'accepted',
        style: defaultStyle,
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        measurement: { value: 50.0, unit: 'm', formatted: '50.00 m²' },
        customFields: { 'col-1': 'C-101' },
      },
    ];

    const customCols: BbxCustomColumn[] = [
      { id: 'col-1', nombre: 'Code', tipo: 'text' },
      { id: 'col-2', nombre: 'Calculated Cost', tipo: 'formula' },
    ];

    const evaluated = new Map<string, Map<string, { ok: boolean; value?: unknown }>>();
    const rowMap = new Map<string, { ok: boolean; value?: unknown }>();
    rowMap.set('col-2', { ok: true, value: 1425 });
    evaluated.set('m-unpriced-1', rowMap);

    const bytes = await exportTakeoffToXlsx('Test Ceiling', markupsWithoutPrices, {
      currency: '€',
      catalog: { 'Acoustic Ceiling': 28.5 },
      customColumns: customCols,
      evaluatedFields: evaluated,
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0]);

    const takeoffSheet = wb.getWorksheet('Takeoff Schedule')!;
    const itemRow = takeoffSheet.getRow(5);
    // Precio unitario tomado del catálogo
    expect(itemRow.getCell(9).value).toBe(28.5);
    // Fórmula de coste vivo
    expect(itemRow.getCell(10).value).toEqual({
      formula: 'G5*I5',
      result: 1425,
    });

    // Hoja All Markups
    const detailSheet = wb.getWorksheet('All Markups');
    expect(detailSheet).toBeDefined();
    const dHeader = detailSheet!.getRow(1);
    expect(dHeader.getCell(14).value).toBe('Code');
    expect(dHeader.getCell(15).value).toBe('Calculated Cost');
    const dRow = detailSheet!.getRow(2);
    expect(dRow.getCell(14).value).toBe('C-101');
    expect(dRow.getCell(15).value).toBe(1425);
  });

  it('genera un archivo válido cuando la lista de marcas está vacía', async () => {
    const bytes = await exportTakeoffToXlsx('Empty Project', []);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const sheet = wb.getWorksheet('Takeoff Schedule');
    expect(sheet).toBeDefined();
    // Cabecera en fila 4 y gran total en fila 5
    expect(sheet!.getRow(4).getCell(1).value).toBe('Item');
    const totalRow = sheet!.getRow(5);
    const cellVal = totalRow.getCell(10).value as { formula?: string; result?: number };
    expect(cellVal.formula).toBe('0');
  });
});
