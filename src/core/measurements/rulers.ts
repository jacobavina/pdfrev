/**
 * Reglas del visor (ADR-0029, View ▸ Rulers como en Revu): marcas en las unidades de la escala de la página, con
 * el cero en la esquina superior izquierda de la hoja. Puro: sin React ni DOM.
 */

/** Grosor de cada regla en px. */
export const RULER_SIZE = 20;

export interface RulerTick {
  /** Posición en píxeles a lo largo de la regla (0 = inicio de la regla). */
  pos: number;
  major: boolean;
  /** Solo las marcas principales llevan número. */
  label?: string;
}

/** Paso "redondo" (1, 2 o 5 × 10^k) mayor o igual que `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  for (const m of [1, 2, 5, 10]) {
    if (m * base >= raw * (1 - 1e-9)) return m * base;
  }
  return 10 * base;
}

function formatTickValue(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const v = Math.abs(value) < step / 1000 ? 0 : value;
  return v.toFixed(decimals);
}

/**
 * Marcas de una regla de `lengthPx` píxeles. `originPx` es dónde cae el cero (borde de la hoja) medido desde el
 * inicio de la regla; `unitsPerPx`, cuántas unidades reales mide un píxel con el zoom actual. Las principales
 * quedan al menos a `minMajorPx` píxeles entre sí.
 */
export function rulerTicks(opts: {
  originPx: number;
  lengthPx: number;
  unitsPerPx: number;
  minMajorPx?: number;
}): RulerTick[] {
  const { originPx, lengthPx, unitsPerPx } = opts;
  const minMajorPx = opts.minMajorPx ?? 64;
  if (!(lengthPx > 0) || !(unitsPerPx > 0) || !Number.isFinite(unitsPerPx) || !Number.isFinite(originPx)) return [];
  const step = niceStep(minMajorPx * unitsPerPx);
  const mantissa = Math.round(step / 10 ** Math.floor(Math.log10(step) + 1e-9));
  const divisions = mantissa === 2 ? 4 : 5;
  const minor = step / divisions;
  const v0 = (0 - originPx) * unitsPerPx;
  const v1 = (lengthPx - originPx) * unitsPerPx;
  const first = Math.ceil(v0 / minor - 1e-9);
  const last = Math.floor(v1 / minor + 1e-9);
  const ticks: RulerTick[] = [];
  // Límite de seguridad: nunca más marcas que píxeles
  if (last - first > lengthPx + 2) return [];
  for (let k = first; k <= last; k++) {
    const value = k * minor;
    const pos = originPx + value / unitsPerPx;
    const major = k % divisions === 0;
    ticks.push(major ? { pos, major, label: formatTickValue(value, step) } : { pos, major });
  }
  return ticks;
}
