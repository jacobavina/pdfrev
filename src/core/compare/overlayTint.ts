/**
 * Overlay Pages (ADR-0038), como el de Revu: dos versiones de una página se tiñen cada una de un color y se
 * combinan multiplicando. Lo común (tinta en ambas) queda oscuro; lo que solo está en una sale en su color.
 * Puro: trabaja sobre los píxeles RGBA de dos imágenes del mismo tamaño.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const DEFAULT_BASE_COLOR = '#e02424'; // página actual
export const DEFAULT_OTHER_COLOR = '#1d4ed8'; // página comparada

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** Cuánta "tinta" hay en un píxel: 0 en blanco o transparente, 1 en negro opaco. */
function inkOf(data: Uint8ClampedArray, i: number): number {
  const a = data[i + 3] / 255;
  if (a === 0) return 0;
  const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  return (1 - lum) * a;
}

/**
 * Combina las dos páginas: cada una es una capa del color indicado con opacidad igual a su tinta, y las capas se
 * multiplican sobre blanco. `base` u `other` en null equivalen a una página en blanco (capa oculta).
 */
export function tintOverlay(
  width: number,
  height: number,
  base: Uint8ClampedArray | null,
  other: Uint8ClampedArray | null,
  baseColor: Rgb,
  otherColor: Rgb
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const ka = [1 - baseColor.r / 255, 1 - baseColor.g / 255, 1 - baseColor.b / 255];
  const kb = [1 - otherColor.r / 255, 1 - otherColor.g / 255, 1 - otherColor.b / 255];
  for (let i = 0; i < out.length; i += 4) {
    const da = base ? inkOf(base, i) : 0;
    const db = other ? inkOf(other, i) : 0;
    for (let c = 0; c < 3; c++) {
      out[i + c] = 255 * (1 - da * ka[c]) * (1 - db * kb[c]);
    }
    out[i + 3] = 255;
  }
  return out;
}

/** Proporción de píxeles con tinta solo en una de las dos páginas (indicador de cuánto cambió). */
export function changedRatio(base: Uint8ClampedArray, other: Uint8ClampedArray, threshold = 0.35): number {
  let changed = 0;
  let inked = 0;
  for (let i = 0; i < base.length; i += 4) {
    const a = inkOf(base, i) > threshold;
    const b = inkOf(other, i) > threshold;
    if (a || b) inked++;
    if (a !== b) changed++;
  }
  return inked === 0 ? 0 : changed / inked;
}
