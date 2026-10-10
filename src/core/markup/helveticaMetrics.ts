/**
 * Tabla de anchos AFM (Adobe Font Metrics) estándar para la fuente Helvetica (WinAnsi / ASCII).
 * Los valores representan el ancho del glifo en milésimas de em (1 em = 1000 unidades).
 * Corresponden exactamente a las métricas nativas de Helvetica en pdf-lib (StandardFonts.Helvetica).
 */
export const HELVETICA_AFM_WIDTHS: Record<string, number> = {
  // ASCII 32..126
  ' ': 278,
  '!': 278,
  '"': 355,
  '#': 556,
  '$': 556,
  '%': 889,
  '&': 667,
  "'": 191,
  '(': 333,
  ')': 333,
  '*': 389,
  '+': 584,
  ',': 278,
  '-': 333,
  '.': 278,
  '/': 278,
  '0': 556,
  '1': 556,
  '2': 556,
  '3': 556,
  '4': 556,
  '5': 556,
  '6': 556,
  '7': 556,
  '8': 556,
  '9': 556,
  ':': 278,
  ';': 278,
  '<': 584,
  '=': 584,
  '>': 584,
  '?': 556,
  '@': 1015,
  'A': 667,
  'B': 667,
  'C': 722,
  'D': 722,
  'E': 667,
  'F': 611,
  'G': 778,
  'H': 722,
  'I': 278,
  'J': 500,
  'K': 667,
  'L': 556,
  'M': 833,
  'N': 722,
  'O': 778,
  'P': 667,
  'Q': 778,
  'R': 722,
  'S': 667,
  'T': 611,
  'U': 722,
  'V': 667,
  'W': 944,
  'X': 667,
  'Y': 667,
  'Z': 611,
  '[': 278,
  '\\': 278,
  ']': 278,
  '^': 469,
  '_': 556,
  '`': 333,
  'a': 556,
  'b': 556,
  'c': 500,
  'd': 556,
  'e': 556,
  'f': 278,
  'g': 556,
  'h': 556,
  'i': 222,
  'j': 222,
  'k': 500,
  'l': 222,
  'm': 833,
  'n': 556,
  'o': 556,
  'p': 556,
  'q': 556,
  'r': 333,
  's': 500,
  't': 278,
  'u': 556,
  'v': 500,
  'w': 722,
  'x': 500,
  'y': 500,
  'z': 500,
  '{': 334,
  '|': 260,
  '}': 334,
  '~': 584,
  // Caracteres comunes en español / ingeniería (WinAnsi)
  'Á': 667,
  'É': 667,
  'Í': 278,
  'Ó': 778,
  'Ú': 722,
  'Ü': 722,
  'Ñ': 722,
  'á': 556,
  'é': 556,
  'í': 278,
  'ó': 556,
  'ú': 556,
  'ü': 556,
  'ñ': 556,
  '¿': 611,
  '¡': 333,
  '°': 400,
  '±': 584,
  'Ø': 778,
  '²': 333,
  '³': 333,
};

/**
 * Retorna el ancho en puntos (pt) de un carácter individual para la fuente Helvetica.
 * Para caracteres fuera de la tabla, utiliza 600 milésimas (0.6 em) como fallback seguro.
 */
export function getHelveticaCharWidth(char: string, fontSizePt = 10): number {
  const unitsPerThousand = HELVETICA_AFM_WIDTHS[char] ?? 600;
  return (unitsPerThousand / 1000) * fontSizePt;
}

/**
 * Calcula la longitud métrica total en puntos (pt) de una cadena de texto en Helvetica.
 */
export function getHelveticaTextWidth(text: string, fontSizePt = 10): number {
  if (!text) return 0;
  let totalWidth = 0;
  for (let i = 0; i < text.length; i++) {
    totalWidth += getHelveticaCharWidth(text[i], fontSizePt);
  }
  return totalWidth;
}
