/**
 * Colores del documento (ADR-0065): los que se escriben en las marcas y acaban en el PDF. No son colores de la
 * interfaz (esos son tokens en src/index.css), por eso viven en el núcleo y no en los componentes.
 */

/** Paleta de color de línea de las marcas, como la de Revu: rojo, azul, verde, ámbar, violeta y casi negro. */
export const MARKUP_COLORS = ['#e02424', '#0284c7', '#16a34a', '#d97706', '#9333ea', '#111827'] as const;

/** Color por defecto de una marca nueva. */
export const DEFAULT_MARKUP_COLOR = '#e02424';
/** Adjunto de archivo (chincheta ámbar, como Acrobat). */
export const ATTACHMENT_COLOR = '#b45309';
/** Campo de formulario (borde gris pizarra). */
export const FORM_FIELD_COLOR = '#64748b';
/** Hipervínculo (azul de enlace; en el PDF el recuadro es invisible). */
export const LINK_COLOR = '#2563eb';
/** Fondo de los sellos. */
export const STAMP_FILL = '#ffffff';

/** Color CSS como #rrggbb para un selector de color (rgba() pierde la opacidad, que se elige aparte). */
export function colorHex(c: string): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000';
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}

/** Blanco (fondo neutro de los selectores de color). */
export const WHITE = '#ffffff';
