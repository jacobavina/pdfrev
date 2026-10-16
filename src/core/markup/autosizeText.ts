import { wrapCalloutText } from './render';

/**
 * Autosize Text de Revu (ADR-0061): con la opción activa, el texto de un callout o de un cuadro de texto toma el
 * mayor tamaño con el que, envuelto por palabras, cabe en su caja; al redimensionar la caja, el texto crece o encoge
 * con ella. Puro: la misma cuenta sirve para la pantalla, el /AP y el /DA.
 */

export const AUTOSIZE_MIN_PT = 4;
export const AUTOSIZE_MAX_PT = 144;

/** Márgenes y separación entre líneas con que se escribe cada caja (iguales en pantalla y en el /AP). */
export const TEXT_LAYOUT = {
  callout: { wrapInset: 16, padTop: 4, padBottom: 4, lineGap: 3 },
  text: { wrapInset: 12, padTop: 4, padBottom: 4, lineGap: 2 },
} as const;

export type TextBoxKind = keyof typeof TEXT_LAYOUT;

export function isAutosizeText(markup: { customFields?: Record<string, string | number> }): boolean {
  const v = markup.customFields?.autoSizeText;
  return v === 1 || v === '1';
}

/** ¿Cabe el texto con tamaño `size` en una caja de `w`×`h` pt? */
function fits(text: string, size: number, w: number, h: number, kind: TextBoxKind): boolean {
  const L = TEXT_LAYOUT[kind];
  const avail = w - L.wrapInset;
  if (avail <= 0) return false;
  const lines = wrapCalloutText(text, avail, size);
  const n = Math.max(1, lines.length);
  const height = L.padTop + size + (n - 1) * (size + L.lineGap) + L.padBottom;
  return height <= h;
}

/**
 * Mayor tamaño (en pasos de 0.5 pt, entre 4 y 144) con el que el texto cabe en la caja. Si ni el mínimo cabe, el
 * mínimo. Sin texto, el que cabría con una línea.
 */
export function autosizeFontSize(text: string, boxWidthPt: number, boxHeightPt: number, kind: TextBoxKind): number {
  const t = text && text.trim() ? text : 'M';
  let lo = AUTOSIZE_MIN_PT * 2;
  let hi = AUTOSIZE_MAX_PT * 2;
  if (!fits(t, AUTOSIZE_MIN_PT, boxWidthPt, boxHeightPt, kind)) return AUTOSIZE_MIN_PT;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(t, mid / 2, boxWidthPt, boxHeightPt, kind)) lo = mid;
    else hi = mid - 1;
  }
  return lo / 2;
}

/** Tamaño con que se escribe el texto: el ajustado a la caja con Autosize Text, o el elegido. */
export function effectiveTextSize(
  markup: { text?: string; customFields?: Record<string, string | number> },
  chosenSize: number,
  boxWidthPt: number,
  boxHeightPt: number,
  kind: TextBoxKind
): number {
  return isAutosizeText(markup) ? autosizeFontSize(markup.text || '', boxWidthPt, boxHeightPt, kind) : chosenSize;
}
