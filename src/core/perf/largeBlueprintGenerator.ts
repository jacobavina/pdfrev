/**
 * Generador determinista de planos arquitectónicos de gran formato E-Size (3600 x 2400 pt)
 * y distribución de 5 000 marcas sintéticas para el banco de pruebas de rendimiento (ADR-0088 / Hito D.1).
 */

import { Markup, MarkupType } from '../../types/markup';

export const E_SIZE_WIDTH_PT = 3600;
export const E_SIZE_HEIGHT_PT = 2400;
export const CHROMIUM_MAX_CANVAS_DIMENSION = 16384;
export const CHROMIUM_MAX_CANVAS_AREA = 268435456; // 16384 * 16384

export interface LargeBlueprintOptions {
  width?: number;
  height?: number;
  gridSpacingPt?: number;
  seed?: number;
}

export interface CanvasLimitCalculation {
  zoomLevel: number;
  dpr: number;
  widthPx: number;
  heightPx: number;
  totalMegaPixels: number;
  rawRgbaMemoryMb: number;
  exceedsMaxDimension: boolean;
  exceedsMaxArea: boolean;
  isSafeForUntiledCanvas: boolean;
}

/**
 * Generador PRNG determinista Mulberry32 (32 bits enteros, 100% reproducible entre plataformas).
 */
export function createPrng(seed = 42): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Genera un PDF binario con formato arquitectónico E-Size (3600 × 2400 pt)
 * conteniendo miles de trazos vectoriales (mallas estructurales, zapatas, cotas, cajetín).
 */
export async function generateLargeBlueprintPdf(options: LargeBlueprintOptions = {}): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const width = options.width ?? E_SIZE_WIDTH_PT;
  const height = options.height ?? E_SIZE_HEIGHT_PT;
  const gridSpacing = options.gridSpacingPt ?? 120;

  const pdfDoc = await PDFDocument.create();
  // Fechas fijas para generación binaria 100% determinista
  pdfDoc.setCreationDate(new Date('2026-10-17T12:00:00.000Z'));
  pdfDoc.setModificationDate(new Date('2026-10-17T12:00:00.000Z'));
  const page = pdfDoc.addPage([width, height]);

  // Colores CAD estándar
  const colorBorder = rgb(0.1, 0.1, 0.1);
  const colorGrid = rgb(0.75, 0.75, 0.78);
  const colorStructure = rgb(0.2, 0.2, 0.25);
  const colorWall = rgb(0.15, 0.15, 0.2);

  // 1. Marco exterior y zona de trazado
  page.drawRectangle({
    x: 40,
    y: 40,
    width: width - 80,
    height: height - 80,
    borderColor: colorBorder,
    borderWidth: 3,
  });
  page.drawRectangle({
    x: 55,
    y: 55,
    width: width - 110,
    height: height - 110,
    borderColor: colorBorder,
    borderWidth: 1,
  });

  // 2. Malla estructural (Grid lines horizontales y verticales con burbujas)
  const gridStartX = 180;
  const gridEndX = width - 450;
  const gridStartY = 180;
  const gridEndY = height - 180;

  // Líneas verticales (Columnas X)
  let colIndex = 1;
  for (let x = gridStartX; x <= gridEndX; x += gridSpacing) {
    page.drawLine({
      start: { x, y: gridStartY },
      end: { x, y: gridEndY },
      color: colorGrid,
      thickness: 0.75,
    });
    // Círculos de eje en extremos
    page.drawCircle({
      x,
      y: gridEndY + 20,
      size: 14,
      borderColor: colorBorder,
      borderWidth: 1,
    });
    page.drawCircle({
      x,
      y: gridStartY - 20,
      size: 14,
      borderColor: colorBorder,
      borderWidth: 1,
    });
    colIndex++;
  }

  // Líneas horizontales (Columnas Y)
  let rowIndex = 1;
  for (let y = gridStartY; y <= gridEndY; y += gridSpacing) {
    page.drawLine({
      start: { x: gridStartX, y },
      end: { x: gridEndX, y },
      color: colorGrid,
      thickness: 0.75,
    });
    // Círculos de eje en extremos
    page.drawCircle({
      x: gridStartX - 20,
      y,
      size: 14,
      borderColor: colorBorder,
      borderWidth: 1,
    });
    page.drawCircle({
      x: gridEndX + 20,
      y,
      size: 14,
      borderColor: colorBorder,
      borderWidth: 1,
    });
    rowIndex++;
  }

  // 3. Zapatas y columnas estructurales en las intersecciones (rectángulos y cruces)
  for (let x = gridStartX; x <= gridEndX; x += gridSpacing) {
    for (let y = gridStartY; y <= gridEndY; y += gridSpacing) {
      // Zapata 40x40 pt
      page.drawRectangle({
        x: x - 20,
        y: y - 20,
        width: 40,
        height: 40,
        borderColor: colorStructure,
        borderWidth: 1.25,
      });
      // Columna interior 16x16 pt
      page.drawRectangle({
        x: x - 8,
        y: y - 8,
        width: 16,
        height: 16,
        borderColor: colorBorder,
        borderWidth: 1.5,
      });
      // Aspa diagonal de columna
      page.drawLine({
        start: { x: x - 8, y: y - 8 },
        end: { x: x + 8, y: y + 8 },
        color: colorBorder,
        thickness: 0.75,
      });
      page.drawLine({
        start: { x: x - 8, y: y + 8 },
        end: { x: x + 8, y: y - 8 },
        color: colorBorder,
        thickness: 0.75,
      });
    }
  }

  // 4. Muros perimetrales e interiores (vigas y muros de carga)
  page.drawRectangle({
    x: gridStartX - 35,
    y: gridStartY - 35,
    width: (gridEndX - gridStartX) + 70,
    height: (gridEndY - gridStartY) + 70,
    borderColor: colorWall,
    borderWidth: 2,
  });

  // 5. Cajetín de plano (Title Block) en esquina inferior derecha
  const titleBlockX = width - 420;
  const titleBlockY = 55;
  const titleBlockW = 350;
  const titleBlockH = 220;

  page.drawRectangle({
    x: titleBlockX,
    y: titleBlockY,
    width: titleBlockW,
    height: titleBlockH,
    borderColor: colorBorder,
    borderWidth: 2,
  });
  // Subdivisiones de cajetín
  page.drawLine({
    start: { x: titleBlockX, y: titleBlockY + 160 },
    end: { x: titleBlockX + titleBlockW, y: titleBlockY + 160 },
    color: colorBorder,
    thickness: 1,
  });
  page.drawLine({
    start: { x: titleBlockX, y: titleBlockY + 80 },
    end: { x: titleBlockX + titleBlockW, y: titleBlockY + 80 },
    color: colorBorder,
    thickness: 1,
  });

  return pdfDoc.save();
}

/**
 * Genera 5 000 marcas sintéticas realistas y deterministas (ADR-0088 / Hito D.1)
 * distribuidas a lo largo de toda la superficie de la hoja E-Size con coordenadas normalizadas.
 */
export function generateSyntheticMarkups(
  count = 5000,
  options: { seed?: number; pageIndex?: number } = {}
): Markup[] {
  const prng = createPrng(options.seed ?? 42);
  const pageIndex = options.pageIndex ?? 0;
  const markups: Markup[] = [];

  const types: { type: MarkupType; weight: number }[] = [
    { type: 'length', weight: 0.15 },
    { type: 'area', weight: 0.15 },
    { type: 'rectangle', weight: 0.15 },
    { type: 'cloud', weight: 0.10 },
    { type: 'cloudPlus', weight: 0.05 },
    { type: 'callout', weight: 0.15 },
    { type: 'text', weight: 0.10 },
    { type: 'count', weight: 0.05 },
    { type: 'polyLine', weight: 0.05 },
    { type: 'circle', weight: 0.05 },
  ];

  // Acumulador de pesos para muestreo
  let cumulative = 0;
  const distribution = types.map((t) => {
    cumulative += t.weight;
    return { type: t.type, limit: cumulative };
  });

  for (let i = 0; i < count; i++) {
    const roll = prng();
    const chosenType = distribution.find((d) => roll <= d.limit)?.type ?? 'rectangle';

    // Generar coordenadas base normalizadas en rango [0.06, 0.94]
    const baseX = 0.06 + prng() * 0.82;
    const baseY = 0.06 + prng() * 0.82;
    const w = 0.015 + prng() * 0.04;
    const h = 0.015 + prng() * 0.04;

    const id = `synth-markup-${i + 1}`;
    const createdAt = '2026-10-17T12:00:00.000Z';
    const author = i % 2 === 0 ? 'Lead Structural Engineer' : 'Takeoff Estimator';

    // ~5% de marcas comparten un groupId (ej. nubes con notas de llamada)
    const groupId = (i % 20 === 0) ? `synth-group-${Math.floor(i / 20)}` : undefined;

    let points: { x: number; y: number }[] = [];
    let measurement: Markup['measurement'] = undefined;
    let text: string | undefined = undefined;

    switch (chosenType) {
      case 'length': {
        points = [
          { x: baseX, y: baseY },
          { x: baseX + w, y: baseY + (prng() > 0.5 ? h : -h) },
        ];
        const val = +(5.0 + prng() * 25.0).toFixed(2);
        measurement = { value: val, unit: 'm', formatted: `${val} m` };
        break;
      }
      case 'area': {
        points = [
          { x: baseX, y: baseY },
          { x: baseX + w, y: baseY },
          { x: baseX + w, y: baseY + h },
          { x: baseX, y: baseY + h },
        ];
        const val = +(20.0 + prng() * 150.0).toFixed(2);
        measurement = { value: val, unit: 'm', formatted: `${val} m²`, perimeter: +(2 * (w + h) * 100).toFixed(2) };
        break;
      }
      case 'rectangle': {
        points = [
          { x: baseX, y: baseY },
          { x: baseX + w, y: baseY + h },
        ];
        break;
      }
      case 'cloud':
      case 'cloudPlus': {
        const segments = 6;
        points = [];
        for (let s = 0; s < segments; s++) {
          const angle = (s / segments) * 2 * Math.PI;
          const rX = (w / 2) * (0.8 + prng() * 0.4);
          const rY = (h / 2) * (0.8 + prng() * 0.4);
          points.push({
            x: baseX + w / 2 + Math.cos(angle) * rX,
            y: baseY + h / 2 + Math.sin(angle) * rY,
          });
        }
        if (chosenType === 'cloudPlus') {
          text = `Rev.Note #${i + 1}`;
        }
        break;
      }
      case 'callout': {
        points = [
          { x: baseX, y: baseY },
          { x: baseX + w, y: baseY - h },
          { x: baseX + w + 0.03, y: baseY - h },
        ];
        text = `Detail Ref C-${(i % 100) + 1}`;
        break;
      }
      case 'text': {
        points = [
          { x: baseX, y: baseY },
          { x: baseX + w, y: baseY + h },
        ];
        text = `ROOM ${100 + (i % 800)}`;
        break;
      }
      case 'count': {
        points = [{ x: baseX, y: baseY }];
        measurement = { value: (i % 50) + 1, unit: 'm', formatted: `${(i % 50) + 1}`, countIndex: (i % 50) + 1 };
        break;
      }
      case 'circle': {
        points = [
          { x: baseX, y: baseY },
          { x: baseX + w, y: baseY + w },
        ];
        break;
      }
      case 'polyLine':
      default: {
        points = [
          { x: baseX, y: baseY },
          { x: baseX + w * 0.5, y: baseY + h * 0.8 },
          { x: baseX + w, y: baseY + h },
        ];
        break;
      }
    }

    markups.push({
      id,
      type: chosenType,
      pageIndex,
      points,
      text,
      measurement,
      style: {
        strokeColor: i % 3 === 0 ? '#ff0000' : (i % 3 === 1 ? '#0066cc' : '#228b22'),
        strokeWidth: 1.5,
        opacity: 0.9,
        fillColor: chosenType === 'area' ? 'rgba(255, 0, 0, 0.25)' : undefined,
      },
      author,
      createdAt,
      updatedAt: createdAt,
      status: 'pending',
      groupId,
      subject: chosenType === 'length' || chosenType === 'area' ? 'Takeoff Civil' : 'Architectural Review',
    });
  }

  return markups;
}

/**
 * Calcula las dimensiones y requerimientos de memoria del canvas para una hoja E-Size
 * a diferentes niveles de zoom y densidades de píxeles (DPR), evaluando el límite de Chromium (16 384 px).
 */
export function calculateCanvasDimensions(
  zoomLevel: number,
  dpr = 1.0,
  widthPt = E_SIZE_WIDTH_PT,
  heightPt = E_SIZE_HEIGHT_PT
): CanvasLimitCalculation {
  const widthPx = Math.round(widthPt * zoomLevel * dpr);
  const heightPx = Math.round(heightPt * zoomLevel * dpr);
  const totalPixels = widthPx * heightPx;
  const totalMegaPixels = +(totalPixels / 1_000_000).toFixed(2);
  const rawRgbaMemoryMb = +( (totalPixels * 4) / (1024 * 1024) ).toFixed(2);

  const exceedsMaxDimension = widthPx > CHROMIUM_MAX_CANVAS_DIMENSION || heightPx > CHROMIUM_MAX_CANVAS_DIMENSION;
  const exceedsMaxArea = totalPixels > CHROMIUM_MAX_CANVAS_AREA;
  const isSafeForUntiledCanvas = !exceedsMaxDimension && !exceedsMaxArea;

  return {
    zoomLevel,
    dpr,
    widthPx,
    heightPx,
    totalMegaPixels,
    rawRgbaMemoryMb,
    exceedsMaxDimension,
    exceedsMaxArea,
    isSafeForUntiledCanvas,
  };
}
