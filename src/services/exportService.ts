import type { PDFDocument } from 'pdf-lib';
import { Markup, BbxCustomColumn } from '../types/markup';
import { toCents } from '../core/measurements/takeoffCosts';
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
    'Page',
    'Type',
    'Comment',
    'Author',
    'Date',
    'Status',
    'Color',
    'Measurement',
    'Unit',
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

    if (markup.replies && markup.replies.length > 0) {
      for (const reply of markup.replies) {
        const replyBase = [
          pageNum,
          'Reply',
          reply.text ?? '',
          reply.author ?? '',
          reply.createdAt ?? '',
          '',
          '',
          '',
          '',
        ];
        const emptyCustom = customColumns.map(() => '');
        rows.push([...replyBase, ...emptyCustom].map(escapeCsvField).join(','));
      }
    }
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
    const key = keyExtractor(m) || 'Unspecified';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export interface PdfReportOptions {
  /** Bytes del documento PDF original si se desea anexar el informe o resolver enlaces remotos. */
  sourcePdfBytes?: Uint8Array;
  /** Si es true y se proporciona sourcePdfBytes, anexa las páginas del informe al PDF original. */
  appendSummary?: boolean;
  /** Si es false, desactiva la generación de anotaciones /Link. Por defecto es true. */
  includeHyperlinks?: boolean;
  /** Columnas personalizadas opcionales. */
  customColumns?: BbxCustomColumn[];
  /** Matriz de valores calculados opcionales. */
  evaluatedFields?: EvaluatedMatrixInput;
}

/**
 * Limpia y sanitiza texto para evitar caracteres incompatibles con fuentes WinAnsi en pdf-lib.
 */
function cleanPdfText(str: string): string {
  return str
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, '?');
}

/**
 * Genera un Reporte Resumen en formato PDF utilizando pdf-lib.
 * Incluye cabecera ejecutiva, métricas agrupadas por Estado, Autor, Tipo y Subject,
 * desglose de costes de takeoff si existen, tabla detallada con paginación automática
 * e hipervínculos navegables (/Subtype /Link con /Dest y /GoTo) en la columna de página.
 */
export async function buildPdfReportContent(
  docTitle: string,
  markups: Markup[],
  options?: PdfReportOptions
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, PDFName, PDFArray, PDFString } = await import('pdf-lib');

  const appendMode = Boolean(options?.appendSummary && options?.sourcePdfBytes);
  let pdfDoc: PDFDocument;
  let sourcePageCount = 0;

  if (appendMode && options?.sourcePdfBytes) {
    pdfDoc = await PDFDocument.load(options.sourcePdfBytes);
    sourcePageCount = pdfDoc.getPageCount();
  } else {
    pdfDoc = await PDFDocument.create();
  }

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Encabezado
  const reportTitle = markups.some((m) => m.measurement || m.cost !== undefined)
    ? 'Takeoff & Markup Summary Report'
    : 'Markup Summary Report';

  page.drawText(reportTitle, {
    x: MARGIN,
    y: y - 18,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.2),
  });
  y -= 26;

  page.drawText(`Document: ${cleanPdfText(docTitle)}`, {
    x: MARGIN,
    y: y - 12,
    size: 11,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 16;

  const dateStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  page.drawText(`Issued: ${dateStr}   |   Markups analyzed: ${markups.length}`, {
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
  page.drawText('Summary', {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.3),
  });
  y -= 18;

  const statusCounts = aggregateCounts(markups, (m) => m.status || 'None');
  const typeCounts = aggregateCounts(markups, (m) => m.type);
  const authorCounts = aggregateCounts(markups, (m) => m.author || 'Anonymous');
  const subjectCounts = aggregateCounts(markups, (m) => m.subject || '');

  const statsLines: string[] = [
    `Statuses: ` +
      Object.entries(statusCounts)
        .map(([k, v]) => `${cleanPdfText(k)} (${v})`)
        .join('  •  '),
    `Types: ` +
      Object.entries(typeCounts)
        .map(([k, v]) => `${cleanPdfText(k)} (${v})`)
        .join('  •  '),
    `Authors: ` +
      Object.entries(authorCounts)
        .map(([k, v]) => `${cleanPdfText(k)} (${v})`)
        .join('  •  '),
  ];

  const validSubjects = Object.entries(subjectCounts).filter(([k]) => k && k !== 'Unspecified');
  if (validSubjects.length > 0) {
    statsLines.push(
      `Subjects: ` + validSubjects.map(([k, v]) => `${cleanPdfText(k)} (${v})`).join('  •  ')
    );
  }

  const totalCostCents = markups.reduce(
    (acc, m) => acc + (typeof m.cost === 'number' ? toCents(m.cost) : 0),
    0
  );
  if (totalCostCents > 0) {
    statsLines.push(`Total Takeoff Cost: $${(totalCostCents / 100).toFixed(2)}`);
  }

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
  page.drawText('Markup Details', {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.3),
  });
  y -= 18;

  // Cabecera de la tabla con columnas de Takeoff
  const colX = {
    idx: MARGIN,
    page: MARGIN + 22,
    subject: MARGIN + 58,
    type: MARGIN + 148,
    measure: MARGIN + 218,
    cost: MARGIN + 295,
    status: MARGIN + 355,
    text: MARGIN + 418,
  };

  const drawTableHeader = (p: typeof page, currY: number) => {
    p.drawRectangle({
      x: MARGIN,
      y: currY - 4,
      width: CONTENT_WIDTH,
      height: 18,
      color: rgb(0.92, 0.94, 0.96),
    });
    p.drawText('#', { x: colX.idx, y: currY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Page', { x: colX.page, y: currY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Subject', { x: colX.subject, y: currY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Type', { x: colX.type, y: currY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Measurement', { x: colX.measure, y: currY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Cost', { x: colX.cost, y: currY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Status', { x: colX.status, y: currY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
    p.drawText('Comment', { x: colX.text, y: currY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
  };

  drawTableHeader(page, y);
  y -= 20;

  // Filas de marcas
  let rowIndex = 1;
  const linkColor = rgb(0.04, 0.41, 0.85); // Azul hipervínculo estándar #0969da

  for (const m of markups) {
    if (y < MARGIN + 30) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN - 10;
      drawTableHeader(page, y);
      y -= 20;
    }

    const pIndex = m.pageIndex ?? 0;
    const pNum = String(pIndex + 1);
    const mSubject = cleanPdfText(m.subject || '-').slice(0, 15);
    const mType = cleanPdfText(m.type || '').slice(0, 11);
    const mMeas = cleanPdfText(
      m.measurement?.formatted ||
        (m.measurement?.value !== undefined ? `${m.measurement.value} ${m.measurement.unit || ''}` : '-')
    ).slice(0, 14);
    const mCost =
      typeof m.cost === 'number'
        ? `$${m.cost.toFixed(2)}`
        : typeof m.unitPrice === 'number'
          ? `@$${m.unitPrice.toFixed(2)}`
          : '-';
    const mStatus = cleanPdfText(m.status || 'None').slice(0, 10);
    const mAuthor = cleanPdfText(m.author || '').slice(0, 12);
    const mComment = cleanPdfText(m.text || mAuthor || '').slice(0, 26);

    // 1. Número de índice
    page.drawText(String(rowIndex), { x: colX.idx, y, size: 8, font: fontRegular });

    // 2. Columna Página con estilo visual de enlace (azul + subrayado)
    page.drawText(pNum, { x: colX.page, y, size: 8, font: fontRegular, color: linkColor });
    const pTextWidth = fontRegular.widthOfTextAtSize(pNum, 8);
    page.drawLine({
      start: { x: colX.page, y: y - 1 },
      end: { x: colX.page + pTextWidth, y: y - 1 },
      thickness: 0.6,
      color: linkColor,
    });

    // 3. Demás celdas
    page.drawText(mSubject, { x: colX.subject, y, size: 8, font: fontRegular });
    page.drawText(mType, { x: colX.type, y, size: 8, font: fontRegular });
    page.drawText(mMeas, { x: colX.measure, y, size: 8, font: fontRegular });
    page.drawText(mCost, { x: colX.cost, y, size: 8, font: fontRegular });
    page.drawText(mStatus, { x: colX.status, y, size: 8, font: fontRegular });
    page.drawText(mComment, { x: colX.text, y, size: 8, font: fontRegular });

    // 4. Anotación /Subtype /Link navegable
    if (options?.includeHyperlinks !== false) {
      const linkRect = [colX.idx - 2, y - 2, colX.page + Math.max(pTextWidth, 18) + 4, y + 10];
      let linkAnnot: unknown;

      if (appendMode && pIndex >= 0 && pIndex < sourcePageCount) {
        // Enlace intra-documento apuntando a la página física de la marca en el plano
        const targetPage = pdfDoc.getPage(pIndex);
        linkAnnot = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: linkRect,
          Border: [0, 0, 0],
          H: 'I',
          Dest: [targetPage.ref, 'Fit'],
          A: {
            Type: 'Action',
            S: 'GoTo',
            D: [targetPage.ref, 'Fit'],
          },
        });
      } else {
        // Informe independiente: Remote Go-To hacia el archivo del plano conforme a ISO 32000-1 §12.6.4.3
        linkAnnot = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: linkRect,
          Border: [0, 0, 0],
          H: 'I',
          A: {
            Type: 'Action',
            S: 'GoToR',
            F: PDFString.of(cleanPdfText(docTitle)),
            D: [pIndex, 'Fit'],
          },
        });
      }

      const linkRef = pdfDoc.context.register(linkAnnot as never);
      const annots = page.node.Annots();
      if (annots instanceof PDFArray) {
        annots.push(linkRef);
      } else {
        page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkRef]));
      }
    }

    y -= 14;
    rowIndex++;

    if (m.replies && m.replies.length > 0) {
      for (const reply of m.replies) {
        if (y < MARGIN + 30) {
          page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = PAGE_HEIGHT - MARGIN - 10;
          drawTableHeader(page, y);
          y -= 20;
        }
        const rAuthor = cleanPdfText(reply.author || '').slice(0, 16);
        const rText = cleanPdfText(reply.text || '').slice(0, 36);
        page.drawText('  Reply', {
          x: colX.subject,
          y,
          size: 7.5,
          font: fontRegular,
          color: rgb(0.35, 0.35, 0.45),
        });
        page.drawText(rAuthor, {
          x: colX.type,
          y,
          size: 7.5,
          font: fontRegular,
          color: rgb(0.35, 0.35, 0.45),
        });
        page.drawText(rText, {
          x: colX.text,
          y,
          size: 7.5,
          font: fontRegular,
          color: rgb(0.25, 0.25, 0.35),
        });
        y -= 12;
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Genera un Reporte Resumen en formato PDF anexado al final del documento fuente,
 * con hipervínculos internos (/Link con /Dest y /GoTo) que saltan directamente a la página
 * de cada marca en el plano.
 */
export async function appendPdfSummaryReport(
  sourcePdfBytes: Uint8Array,
  docTitle: string,
  markups: Markup[],
  options?: Omit<PdfReportOptions, 'sourcePdfBytes' | 'appendSummary'>
): Promise<Uint8Array> {
  return buildPdfReportContent(docTitle, markups, {
    ...options,
    sourcePdfBytes,
    appendSummary: true,
  });
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
  const filterName = extension === 'csv' ? 'CSV file (*.csv)' : 'PDF document (*.pdf)';

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

      showToast(`Export saved: ${selectedPath}`);
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
      showToast(`Export downloaded: ${defaultName}`);
      return true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Error saving export: ${msg}`);
    throw err;
  }
}
