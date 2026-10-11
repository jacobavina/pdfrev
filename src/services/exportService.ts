import { Markup, BbxCustomColumn } from '../types/markup';
import { isTauriEnvironment } from './bbxPersistenceService';
import { showToast } from './toastService';

/**
 * Mitigación rigurosa de inyección de fórmulas CSV (Formula Injection / DDE).
 * Si un campo inicia con `=`, `+`, `-`, `@`, `\t` o `\r`, se prefija con `'`
 * para desactivar su interpretación como fórmula en hojas de cálculo.
 */
export function sanitizeCsvCell(val: string): string {
  if (!val) return '';
  if (/^[=+\-@\t\r]/.test(val) || /^[=+\-@\t\r]/.test(val.trimStart())) {
    return `'${val}`;
  }
  return val;
}

/**
 * Escapa un valor individual de celda conforme a la especificación RFC 4180:
 * Aplica mitigación de fórmulas y envuelve entre comillas si contiene comas,
 * comillas dobles o saltos de línea, duplicando las comillas dobles internas.
 */
export function escapeCsvField(rawVal: string): string {
  const sanitized = sanitizeCsvCell(rawVal);
  if (/[",\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export type EvaluatedMatrixInput =
  | Map<string, Map<string, { ok: boolean; value?: unknown; message?: string }>>
  | Record<string, Record<string, string | number | null>>;

/**
 * Construye el contenido binario CSV (RFC 4180) con BOM UTF-8 y retornos CRLF.
 * Respeta el orden recibido, el filtrado y las columnas personalizadas.
 */
export function buildCsvContent(
  markups: Markup[],
  customColumns: BbxCustomColumn[] = [],
  evaluatedFields: EvaluatedMatrixInput = {}
): Uint8Array {
  // 1. Cabeceras base y columnas personalizadas
  const baseHeaders = [
    'Página',
    'Tipo',
    'Texto',
    'Autor',
    'Fecha',
    'Estado',
    'Color',
    'Medida',
    'Unidad',
  ];
  const customHeaders = customColumns.map((col) => col.nombre);
  const allHeaders = [...baseHeaders, ...customHeaders];

  const headerLine = allHeaders.map(escapeCsvField).join(',');

  // 2. Construcción de filas
  const rows: string[] = [headerLine];

  for (const markup of markups) {
    const pageNum = String((markup.pageIndex ?? 0) + 1);
    const typeStr = markup.type ?? '';
    const textStr = markup.text ?? '';
    const authorStr = markup.author ?? '';
    const dateStr = markup.createdAt ?? '';
    const statusStr = markup.status ?? 'pending';
    const colorStr = markup.style?.strokeColor ?? '';
    const measureStr = markup.measurement?.formatted ?? (markup.measurement?.value !== undefined ? String(markup.measurement.value) : '');
    const unitStr = markup.measurement?.unit ?? '';

    const baseValues = [
      pageNum,
      typeStr,
      textStr,
      authorStr,
      dateStr,
      statusStr,
      colorStr,
      measureStr,
      unitStr,
    ];

    const customValues = customColumns.map((col) => {
      let evaluatedVal: unknown;
      if (evaluatedFields instanceof Map) {
        const res = evaluatedFields.get(markup.id)?.get(col.id);
        if (res && typeof res === 'object' && 'ok' in res) {
          evaluatedVal = (res as { ok: boolean; value?: unknown }).ok
            ? (res as { ok: boolean; value?: unknown }).value
            : '';
        }
      } else if (evaluatedFields && typeof evaluatedFields === 'object') {
        evaluatedVal = (evaluatedFields as Record<string, Record<string, string | number | null>>)[
          markup.id
        ]?.[col.id];
      }

      if (evaluatedVal !== undefined && evaluatedVal !== null) {
        return String(evaluatedVal);
      }
      const rawVal = markup.customFields?.[col.id];
      if (rawVal !== undefined && rawVal !== null) {
        return String(rawVal);
      }
      return '';
    });

    const fullRow = [...baseValues, ...customValues].map(escapeCsvField).join(',');
    rows.push(fullRow);
  }

  // 3. Unir con retornos CRLF (\r\n) según RFC 4180
  const csvText = rows.join('\r\n') + '\r\n';

  // 4. Preceder con BOM UTF-8 (\uFEFF -> 0xEF, 0xBB, 0xBF)
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(csvText);
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);

  const output = new Uint8Array(bom.length + textBytes.length);
  output.set(bom, 0);
  output.set(textBytes, bom.length);

  return output;
}

/**
 * Agrupa marcas por una clave dada y cuenta ocurrencias
 */
function aggregateCounts<T extends string>(
  markups: Markup[],
  keyExtractor: (m: Markup) => T
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of markups) {
    const key = keyExtractor(m) || 'Sin especificar';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/**
 * Genera un Reporte Resumen en formato PDF utilizando pdf-lib.
 * Incluye cabecera ejecutiva, métricas agrupadas por Estado, Autor y Tipo,
 * y tabla detallada con paginación automática.
 */
export async function buildPdfReportContent(
  docTitle: string,
  markups: Markup[]
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Encabezado
  page.drawText('Reporte Resumen de Marcas de Revisión', {
    x: MARGIN,
    y: y - 18,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.2),
  });
  y -= 26;

  page.drawText(`Documento: ${docTitle}`, {
    x: MARGIN,
    y: y - 12,
    size: 11,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 16;

  const dateStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  page.drawText(`Fecha de emisión: ${dateStr}   |   Total de marcas analizadas: ${markups.length}`, {
    x: MARGIN,
    y: y - 10,
    size: 9,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 25;

  // Línea divisoria
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.85),
  });
  y -= 20;

  // Estadísticas agrupadas
  page.drawText('Resumen Estadístico', {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.3),
  });
  y -= 18;

  const statusCounts = aggregateCounts(markups, (m) => m.status || 'None');
  const typeCounts = aggregateCounts(markups, (m) => m.type);
  const authorCounts = aggregateCounts(markups, (m) => m.author || 'Anónimo');

  const statsLines: string[] = [
    `Estados: ` +
      Object.entries(statusCounts)
        .map(([k, v]) => `${k} (${v})`)
        .join('  •  '),
    `Tipos: ` +
      Object.entries(typeCounts)
        .map(([k, v]) => `${k} (${v})`)
        .join('  •  '),
    `Autores: ` +
      Object.entries(authorCounts)
        .map(([k, v]) => `${k} (${v})`)
        .join('  •  '),
  ];

  for (const line of statsLines) {
    page.drawText(line, {
      x: MARGIN + 10,
      y,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 14;
  }
  y -= 15;

  // Tabla Detallada
  page.drawText('Detalle de Marcas', {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.3),
  });
  y -= 18;

  // Cabecera de la tabla
  const colX = {
    idx: MARGIN,
    page: MARGIN + 25,
    type: MARGIN + 60,
    author: MARGIN + 160,
    status: MARGIN + 260,
    text: MARGIN + 350,
  };

  const drawTableHeader = (p: typeof page, currY: number) => {
    p.drawRectangle({
      x: MARGIN,
      y: currY - 4,
      width: CONTENT_WIDTH,
      height: 18,
      color: rgb(0.92, 0.94, 0.96),
    });
    p.drawText('#', { x: colX.idx, y: currY, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Pág', { x: colX.page, y: currY, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Tipo', { x: colX.type, y: currY, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Autor', { x: colX.author, y: currY, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Estado', { x: colX.status, y: currY, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Contenido / Nota', { x: colX.text, y: currY, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
  };

  drawTableHeader(page, y);
  y -= 20;

  // Filas de marcas
  let rowIndex = 1;
  for (const m of markups) {
    if (y < MARGIN + 30) {
      // Salto de página
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN - 10;
      drawTableHeader(page, y);
      y -= 20;
    }

    const pNum = String((m.pageIndex ?? 0) + 1);
    const mType = m.type || '';
    const mAuthor = (m.author || '').slice(0, 18);
    const mStatus = m.status || 'None';
    const mText = (m.text || '').replace(/[\r\n]+/g, ' ').slice(0, 32);

    page.drawText(String(rowIndex), { x: colX.idx, y, size: 8, font: fontRegular });
    page.drawText(pNum, { x: colX.page, y, size: 8, font: fontRegular });
    page.drawText(mType, { x: colX.type, y, size: 8, font: fontRegular });
    page.drawText(mAuthor, { x: colX.author, y, size: 8, font: fontRegular });
    page.drawText(mStatus, { x: colX.status, y, size: 8, font: fontRegular });
    page.drawText(mText, { x: colX.text, y, size: 8, font: fontRegular });

    y -= 14;
    rowIndex++;
  }

  return await pdfDoc.save();
}

/**
 * Guarda un archivo exportado mediante Tauri (comando Rust atómico save_export_file)
 * o descarga vía Blob en el navegador.
 */
export async function saveExportFileWithDialog(
  defaultName: string,
  extension: 'csv' | 'pdf',
  bytes: Uint8Array
): Promise<boolean> {
  const filterName = extension === 'csv' ? 'Archivo CSV (*.csv)' : 'Documento PDF (*.pdf)';

  try {
    if (isTauriEnvironment()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');

      const selectedPath = await save({
        defaultPath: defaultName,
        filters: [{ name: filterName, extensions: [extension] }],
      });

      if (!selectedPath || typeof selectedPath !== 'string') {
        return false; // Usuario canceló
      }

      await invoke('save_export_file', {
        filePath: selectedPath,
        bytes: Array.from(bytes),
      });

      showToast(`Exportación guardada: ${selectedPath}`);
      return true;
    } else {
      // Fallback navegador
      const mime = extension === 'csv' ? 'text/csv;charset=utf-8;' : 'application/pdf';
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = defaultName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Exportación descargada: ${defaultName}`);
      return true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Error al guardar exportación: ${msg}`);
    throw err;
  }
}
