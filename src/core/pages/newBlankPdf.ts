import { PDFDocument, rgb } from 'pdf-lib';

export type PageUnit = 'cm' | 'mm' | 'in' | 'pt';
export type PageOrientation = 'portrait' | 'landscape';
export type BlankPageStyle = 'blank' | 'grid' | 'lined' | 'dotted';

export interface PageTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: PageUnit;
}

export const NEW_PDF_TEMPLATES: PageTemplate[] = [
  { id: 'custom', name: '<Custom>', width: 21.0, height: 29.7, unit: 'cm' },
  { id: 'ansi-a', name: 'ANSI A (Letter)', width: 8.5, height: 11.0, unit: 'in' },
  { id: 'ansi-b', name: 'ANSI B (Tabloid)', width: 11.0, height: 17.0, unit: 'in' },
  { id: 'ansi-c', name: 'ANSI C', width: 17.0, height: 22.0, unit: 'in' },
  { id: 'ansi-d', name: 'ANSI D', width: 22.0, height: 34.0, unit: 'in' },
  { id: 'ansi-e', name: 'ANSI E', width: 34.0, height: 44.0, unit: 'in' },
  { id: 'arch-d', name: 'ARCH D', width: 24.0, height: 36.0, unit: 'in' },
  { id: 'arch-e', name: 'ARCH E', width: 36.0, height: 48.0, unit: 'in' },
  { id: 'iso-a4', name: 'ISO A4', width: 21.0, height: 29.7, unit: 'cm' },
  { id: 'iso-a3', name: 'ISO A3', width: 29.7, height: 42.0, unit: 'cm' },
  { id: 'iso-a2', name: 'ISO A2', width: 42.0, height: 59.4, unit: 'cm' },
  { id: 'iso-a1', name: 'ISO A1', width: 59.4, height: 84.1, unit: 'cm' },
  { id: 'iso-a0', name: 'ISO A0', width: 84.1, height: 118.9, unit: 'cm' },
  { id: 'legal', name: 'Legal', width: 8.5, height: 14.0, unit: 'in' },
];

export function toPoints(value: number, unit: PageUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  switch (unit) {
    case 'pt':
      return value;
    case 'in':
      return value * 72;
    case 'cm':
      return (value * 72) / 2.54;
    case 'mm':
      return (value * 72) / 25.4;
  }
}

export function fromPoints(points: number, unit: PageUnit): number {
  if (!Number.isFinite(points) || points <= 0) return 0;
  switch (unit) {
    case 'pt':
      return Math.round(points * 100) / 100;
    case 'in':
      return Math.round((points / 72) * 1000) / 1000;
    case 'cm':
      return Math.round(((points * 2.54) / 72) * 100) / 100;
    case 'mm':
      return Math.round(((points * 25.4) / 72) * 10) / 10;
  }
}

export function convertUnit(value: number, from: PageUnit, to: PageUnit): number {
  if (from === to) return value;
  const pts = toPoints(value, from);
  return fromPoints(pts, to);
}

export interface NewPdfOptions {
  width: number;
  height: number;
  widthUnit: PageUnit;
  heightUnit: PageUnit;
  orientation: PageOrientation;
  style: BlankPageStyle;
  pageCount: number;
}

export interface NewPdfSettings extends NewPdfOptions {
  templateId: string;
}

const DEFAULT_NEW_PDF_SETTINGS: NewPdfSettings = {
  templateId: 'iso-a4',
  width: 21.0,
  height: 29.7,
  widthUnit: 'cm',
  heightUnit: 'cm',
  orientation: 'portrait',
  style: 'blank',
  pageCount: 1,
};

export const NEW_PDF_DEFAULT_STORAGE_KEY = 'rea-new-pdf-default';

export function loadDefaultNewPdfSettings(): NewPdfSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_NEW_PDF_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(NEW_PDF_DEFAULT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NEW_PDF_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : 'iso-a4',
      width: Number(parsed.width) > 0 ? Number(parsed.width) : 21.0,
      height: Number(parsed.height) > 0 ? Number(parsed.height) : 29.7,
      widthUnit: ['cm', 'mm', 'in', 'pt'].includes(parsed.widthUnit) ? parsed.widthUnit : 'cm',
      heightUnit: ['cm', 'mm', 'in', 'pt'].includes(parsed.heightUnit) ? parsed.heightUnit : 'cm',
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      style: ['blank', 'grid', 'lined', 'dotted'].includes(parsed.style) ? parsed.style : 'blank',
      pageCount: Math.max(1, Math.min(500, Number(parsed.pageCount) || 1)),
    };
  } catch {
    return { ...DEFAULT_NEW_PDF_SETTINGS };
  }
}

export function saveDefaultNewPdfSettings(settings: NewPdfSettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NEW_PDF_DEFAULT_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[NewPdf] Failed to persist default settings to localStorage:', err);
  }
}

/**
 * Genera un nuevo documento PDF en memoria utilizando pdf-lib con las dimensiones,
 * estilo vectorial de fondo y cantidad de páginas especificadas.
 */
export async function createNewBlankPdf(options: NewPdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const wPoints = toPoints(options.width, options.widthUnit);
  const hPoints = toPoints(options.height, options.heightUnit);

  let finalWidth: number;
  let finalHeight: number;

  if (options.orientation === 'landscape') {
    finalWidth = Math.max(wPoints, hPoints);
    finalHeight = Math.min(wPoints, hPoints);
  } else {
    finalWidth = Math.min(wPoints, hPoints);
    finalHeight = Math.max(wPoints, hPoints);
  }

  const count = Math.max(1, Math.min(500, Math.round(options.pageCount || 1)));

  for (let i = 0; i < count; i++) {
    const page = doc.addPage([finalWidth, finalHeight]);

    if (options.style === 'grid') {
      // Retícula técnica de 5 mm en gris-cian tenue
      const step = (5 * 72) / 25.4; // 5 mm en puntos
      const gridColor = rgb(0.88, 0.91, 0.95);
      for (let x = step; x < finalWidth; x += step) {
        page.drawLine({
          start: { x, y: 0 },
          end: { x, y: finalHeight },
          thickness: 0.5,
          color: gridColor,
        });
      }
      for (let y = step; y < finalHeight; y += step) {
        page.drawLine({
          start: { x: 0, y },
          end: { x: finalWidth, y },
          thickness: 0.5,
          color: gridColor,
        });
      }
    } else if (options.style === 'lined') {
      // Líneas horizontales cada 8 mm con márgenes superior e inferior
      const step = (8 * 72) / 25.4; // 8 mm
      const topMargin = (25 * 72) / 25.4; // 25 mm
      const bottomMargin = (20 * 72) / 25.4;
      const lineColor = rgb(0.86, 0.89, 0.93);
      for (let y = bottomMargin; y <= finalHeight - topMargin; y += step) {
        page.drawLine({
          start: { x: (20 * 72) / 25.4, y },
          end: { x: finalWidth - (20 * 72) / 25.4, y },
          thickness: 0.5,
          color: lineColor,
        });
      }
    } else if (options.style === 'dotted') {
      // Puntos técnicos cada 5 mm
      const step = (5 * 72) / 25.4;
      const dotColor = rgb(0.78, 0.82, 0.88);
      for (let x = step; x < finalWidth; x += step) {
        for (let y = step; y < finalHeight; y += step) {
          page.drawCircle({
            x,
            y,
            size: 0.75,
            color: dotColor,
          });
        }
      }
    }
  }

  return await doc.save();
}
