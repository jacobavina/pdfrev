/**
 * Color de la interfaz como referencia a un token de src/index.css (ADR-0065). Sirve en atributos SVG (`fill`,
 * `stroke`) y en estilos: el WebView resuelve `var()` en ambos. Así ningún componente lleva colores literales.
 */
export function tok(name: string, alpha?: number): string {
  return alpha === undefined ? `rgb(var(--${name}))` : `rgb(var(--${name}) / ${alpha})`;
}

/** Valor resuelto de un token para APIs que no entienden `var()` (canvas 2D). */
export function resolvedTok(name: string, fallback = 'white'): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v ? `rgb(${v})` : fallback;
}
