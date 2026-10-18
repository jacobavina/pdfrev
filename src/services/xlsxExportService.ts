import { Markup, BbxCustomColumn } from '../types/markup';
import { countItems } from '../core/markup/countSymbols';
import { markupTypeLabel } from '../core/markup/typeLabels';
import { toCents, fromCents, computeItemCostCents } from '../core/measurements/takeoffCosts';
import type { EvaluatedMatrixInput } from './exportService';
import { parsePdfDateToIso } from '../utils/dateUtils';

export interface XlsxExportOptions {
  /** Símbolo de moneda para formatos de celda (por defecto '$') */
  currency?: string;
  /** Catálogo opcional de precios unitarios por Subject */
  catalog?: Record<string, number>;
  /** Columnas personalizadas opcionales de REA */
  customColumns?: BbxCustomColumn[];
  /** Valores evaluados de columnas calculadas */
  evaluatedFields?: EvaluatedMatrixInput;
}

/**
 * Obtiene la cantidad numérica cruda de una marca para cálculos en hojas de cálculo.
 */
function extractRawQuantity(m: Markup): number {
  if (m.type === 'count') {
    const ptsCount = countItems(m);
    return ptsCount > 0 ? ptsCount : (m.measurement?.value ?? 1);
  }
  if (m.measurement?.value != null && Number.isFinite(m.measurement.value)) {
    return m.measurement.value;
  }
  if (m.cost != null && m.unitPrice != null && m.unitPrice > 0) {
    return Math.round((m.cost / m.unitPrice) * 100) / 100;
  }
  return 1;
}

/**
 * Obtiene la unidad de medición de la marca.
 */
function extractUnit(m: Markup): string {
  if (m.type === 'count') return 'ea';
  if (m.measurement?.unit) return m.measurement.unit;
  return '';
}

/**
 * Genera un archivo Excel (.xlsx) con partidas de medición agrupadas por Subject,
 * celdas numéricas tipadas y fórmulas vivas SUM y producto (ADR-0080).
 * Carga `exceljs` bajo demanda mediante importación dinámica para preservar
 * el presupuesto estricto del bundle principal.
 */
export async function exportTakeoffToXlsx(
  docTitle: string,
  markups: readonly Markup[],
  options: XlsxExportOptions = {}
): Promise<Uint8Array> {
  const { currency = '$', catalog = {}, customColumns = [], evaluatedFields = {} } = options;

  // Importación dinámica aislada para no engordar el bundle principal
  const excelModule = await import('exceljs');
  const ExcelJS = (excelModule as unknown as { default?: typeof import('exceljs') }).default ?? excelModule;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'REA Takeoff Engine';
  workbook.lastModifiedBy = 'REA Takeoff Engine';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Formato contable con moneda
  const currencyFormat = currency === '€' ? '#,##0.00 "€"' : '"$"#,##0.00';
  const quantityFormat = '#,##0.00';

  // --------------------------------------------------------------------------
  // HOJA 1: "Takeoff Schedule" (Partidas agrupadas por Subject con fórmulas vivas)
  // --------------------------------------------------------------------------
  const sheet = workbook.addWorksheet('Takeoff Schedule', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'landscape' },
  });

  // Configuración de anchos de columna
  sheet.columns = [
    { key: 'item', width: 8 },
    { key: 'page', width: 8 },
    { key: 'subject', width: 28 },
    { key: 'layer', width: 18 },
    { key: 'type', width: 16 },
    { key: 'description', width: 32 },
    { key: 'quantity', width: 14 },
    { key: 'unit', width: 10 },
    { key: 'unitPrice', width: 14 },
    { key: 'totalCost', width: 16 },
  ];

  // 1. Título ejecutivo del reporte
  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Takeoff Schedule — ${docTitle || 'Document'}`;
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 28;

  // 2. Metadatos (Fecha, total marcas)
  sheet.mergeCells('A2:J2');
  const metaCell = sheet.getCell('A2');
  metaCell.value = `Exported: ${new Date().toLocaleString()} | Total Markups: ${markups.length}`;
  metaCell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(2).height = 18;

  // Fila 3 en blanco para separación visual
  sheet.getRow(3).height = 8;

  // 4. Cabeceras de tabla (Fila 4)
  const headerRow = sheet.getRow(4);
  headerRow.height = 24;
  const headers = [
    'Item',
    'Page',
    'Subject',
    'Layer',
    'Type',
    'Description',
    'Quantity',
    'Unit',
    'Unit Price',
    'Total Cost',
  ];
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: idx === 0 || idx === 1 || idx === 7 ? 'center' : idx >= 6 ? 'right' : 'left',
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
    };
  });

  // Agrupar marcas por Subject
  const groups = new Map<string, Markup[]>();
  for (const m of markups) {
    const subj = m.subject?.trim() || markupTypeLabel(m.type);
    const list = groups.get(subj) ?? [];
    list.push(m);
    groups.set(subj, list);
  }

  let currentRow = 4;
  let itemCounter = 0;
  let grandTotalCostAccumCents = 0;
  const subtotalCostCellRefs: string[] = [];

  // Recorrer cada grupo por Subject
  for (const [subject, groupMarkups] of groups.entries()) {
    const groupStartRow = currentRow + 1;
    let groupQtyAccum = 0;
    let groupCostAccumCents = 0;
    const uniformUnit = groupMarkups[0] ? extractUnit(groupMarkups[0]) : '';
    let isUniformUnit = true;

    for (const m of groupMarkups) {
      currentRow++;
      itemCounter++;
      const row = sheet.getRow(currentRow);
      row.height = 20;

      const qty = extractRawQuantity(m);
      const unit = extractUnit(m);
      if (unit !== uniformUnit) isUniformUnit = false;

      const unitPrice = m.unitPrice ?? (catalog[subject] ?? 0);
      const itemCostCents =
        m.cost != null ? toCents(m.cost) : computeItemCostCents(qty, toCents(unitPrice));
      const calculatedCost = fromCents(itemCostCents);

      groupQtyAccum += qty;
      groupCostAccumCents += itemCostCents;

      // Col A: Item
      const cA = row.getCell(1);
      cA.value = itemCounter;
      cA.alignment = { horizontal: 'center' };

      // Col B: Page
      const cB = row.getCell(2);
      cB.value = (m.pageIndex ?? 0) + 1;
      cB.alignment = { horizontal: 'center' };

      // Col C: Subject
      const cC = row.getCell(3);
      cC.value = subject;

      // Col D: Layer
      const cD = row.getCell(4);
      cD.value = m.layer?.trim() || '';

      // Col E: Type
      const cE = row.getCell(5);
      cE.value = markupTypeLabel(m.type);

      // Col F: Description
      const cF = row.getCell(6);
      cF.value = m.text || '';

      // Col G: Quantity (Numérico)
      const cG = row.getCell(7);
      cG.value = qty;
      cG.numFmt = m.type === 'count' ? '0' : quantityFormat;
      cG.alignment = { horizontal: 'right' };

      // Col H: Unit
      const cH = row.getCell(8);
      cH.value = unit;
      cH.alignment = { horizontal: 'center' };

      // Col I: Unit Price (Numérico)
      const cI = row.getCell(9);
      cI.value = unitPrice;
      cI.numFmt = currencyFormat;
      cI.alignment = { horizontal: 'right' };

      // Col J: Total Cost (FÓRMULA VIVA: =G{row}*I{row})
      const cJ = row.getCell(10);
      cJ.value = {
        formula: `G${currentRow}*I${currentRow}`,
        result: calculatedCost,
      };
      cJ.numFmt = currencyFormat;
      cJ.alignment = { horizontal: 'right' };

      // Bordes tenues entre filas
      for (let c = 1; c <= 10; c++) {
        row.getCell(c).border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        row.getCell(c).font = { name: 'Segoe UI', size: 9 };
      }
    }

    const groupEndRow = currentRow;

    // Fila de Subtotal por Subject con fórmula SUM
    currentRow++;
    const subtotalRow = sheet.getRow(currentRow);
    subtotalRow.height = 22;

    const subC = subtotalRow.getCell(3);
    subC.value = `Subtotal — ${subject}`;
    subC.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E293B' } };

    // Si las unidades del grupo son consistentes, sumamos la columna Quantity con =SUM(...)
    if (isUniformUnit && groupMarkups.length > 0) {
      const subG = subtotalRow.getCell(7);
      subG.value = {
        formula: `SUM(G${groupStartRow}:G${groupEndRow})`,
        result: groupQtyAccum,
      };
      subG.numFmt = groupMarkups[0]?.type === 'count' ? '0' : quantityFormat;
      subG.font = { name: 'Segoe UI', size: 9, bold: true };
      subG.alignment = { horizontal: 'right' };

      const subH = subtotalRow.getCell(8);
      subH.value = uniformUnit;
      subH.font = { name: 'Segoe UI', size: 9, bold: true };
      subH.alignment = { horizontal: 'center' };
    }

    // Subtotal de Coste con fórmula =SUM(J{start}:J{end})
    const subJ = subtotalRow.getCell(10);
    subJ.value = {
      formula: `SUM(J${groupStartRow}:J${groupEndRow})`,
      result: fromCents(groupCostAccumCents),
    };
    subJ.numFmt = currencyFormat;
    subJ.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF0F172A' } };
    subJ.alignment = { horizontal: 'right' };

    grandTotalCostAccumCents += groupCostAccumCents;
    subtotalCostCellRefs.push(`J${currentRow}`);

    // Estilo de la fila de subtotal
    for (let c = 1; c <= 10; c++) {
      const cell = subtotalRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
      };
    }
  }

  // --------------------------------------------------------------------------
  // Fila de TOTAL GENERAL (Grand Total) con fórmula SUM viva
  // --------------------------------------------------------------------------
  currentRow++;
  const grandTotalRow = sheet.getRow(currentRow);
  grandTotalRow.height = 26;

  const totalLabelCell = grandTotalRow.getCell(3);
  totalLabelCell.value = 'TOTAL TAKEOFF';
  totalLabelCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };

  // Fórmula de suma de los subtotales de coste
  const grandTotalCostCell = grandTotalRow.getCell(10);
  let totalFormula = '0';

  if (subtotalCostCellRefs.length > 1) {
    totalFormula = `SUM(${subtotalCostCellRefs.join(',')})`;
  } else if (subtotalCostCellRefs.length === 1) {
    totalFormula = `SUM(${subtotalCostCellRefs[0]}:${subtotalCostCellRefs[0]})`;
  }

  grandTotalCostCell.value = {
    formula: totalFormula,
    result: fromCents(grandTotalCostAccumCents),
  };
  grandTotalCostCell.numFmt = currencyFormat;
  grandTotalCostCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  grandTotalCostCell.alignment = { horizontal: 'right' };

  for (let c = 1; c <= 10; c++) {
    const cell = grandTotalRow.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF64748B' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
    };
  }

  // --------------------------------------------------------------------------
  // HOJA 2: "All Markups" (Detalle tabular completo con columnas personalizadas)
  // --------------------------------------------------------------------------
  if (markups.length > 0 || customColumns.length > 0) {
    const detailSheet = workbook.addWorksheet('All Markups', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const baseHeaders = ['#', 'Page', 'Subject', 'Layer', 'Type', 'Author', 'Date', 'Status', 'Measurement', 'Unit', 'Unit Price', 'Cost', 'Comments'];
    const customHeaderNames = customColumns.map((c) => c.nombre);
    const allDetailHeaders = [...baseHeaders, ...customHeaderNames];

    const dHeaderRow = detailSheet.getRow(1);
    dHeaderRow.height = 22;
    allDetailHeaders.forEach((name, i) => {
      const cell = dHeaderRow.getCell(i + 1);
      cell.value = name;
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    markups.forEach((m, idx) => {
      const row = detailSheet.getRow(idx + 2);
      row.height = 18;
      const baseValues = [
        idx + 1,
        (m.pageIndex ?? 0) + 1,
        m.subject?.trim() || markupTypeLabel(m.type),
        m.layer?.trim() || '',
        markupTypeLabel(m.type),
        m.author || '',
        m.createdAt ? parsePdfDateToIso(m.createdAt, '').slice(0, 10) : '',
        m.status || '',
        m.measurement?.formatted || (m.measurement?.value != null ? String(m.measurement.value) : ''),
        extractUnit(m),
        m.unitPrice != null ? m.unitPrice : '',
        m.cost != null ? m.cost : '',
        m.text || '',
      ];

      baseValues.forEach((val, colIdx) => {
        row.getCell(colIdx + 1).value = val;
      });

      // Añadir columnas personalizadas si existen
      customColumns.forEach((col, cIdx) => {
        let val: unknown;
        if (evaluatedFields instanceof Map) {
          const res = evaluatedFields.get(m.id)?.get(col.id);
          if (res && typeof res === 'object' && 'ok' in res) {
            val = (res as { ok: boolean; value?: unknown }).ok
              ? (res as { ok: boolean; value?: unknown }).value
              : '';
          }
        } else if (evaluatedFields && typeof evaluatedFields === 'object') {
          val = (evaluatedFields as Record<string, Record<string, string | number | null>>)[m.id]?.[col.id];
        }

        if (val === undefined || val === null || val === '') {
          val = m.customFields?.[col.id] ?? m.customFields?.[col.nombre] ?? '';
        }
        row.getCell(baseValues.length + cIdx + 1).value = (val as string | number) ?? '';
      });
    });
  }

  // Escribir a búfer binario
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
