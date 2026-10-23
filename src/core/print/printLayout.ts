/**
 * Diseño de la impresión (Print, ADR-0115). Puro: calcula la resolución con que se rasteriza cada página y la hoja de
 * estilos que la imprime. La impresión es una lista de imágenes, una por página, dentro de un contenedor que solo
 * existe al imprimir.
 */

export const PRINT_DPIS = [100, 150, 200, 300] as const;
export type PrintDpi = (typeof PRINT_DPIS)[number];
export const DEFAULT_PRINT_DPI: PrintDpi = 150;

/** Lado máximo de una imagen de página: más allá, el navegador falla al crear el lienzo. */
export const MAX_PRINT_SIDE_PX = 9000;
/** Área máxima de una imagen de página, para no agotar la memoria con un plano muy grande. */
export const MAX_PRINT_PIXELS = 50_000_000;
/** Por encima de esta cantidad de páginas el diálogo avisa de que será lento. */
export const LARGE_PRINT_JOB_PAGES = 60;

export type PrintScale = 'fit' | 'actual';

export interface PrintPageSize {
  widthPt: number;
  heightPt: number;
}

/** Resolución real: la pedida, bajada si la página sería demasiado grande para rasterizarla. */
export function effectiveDpi(page: PrintPageSize, dpi: number): number {
  const wIn = page.widthPt / 72;
  const hIn = page.heightPt / 72;
  let d = dpi;
  d = Math.min(d, MAX_PRINT_SIDE_PX / Math.max(wIn, hIn));
  d = Math.min(d, Math.sqrt(MAX_PRINT_PIXELS / (wIn * hIn)));
  return Math.max(36, Math.floor(d));
}

/** Tamaño en píxeles de la imagen de una página. */
export function printPixels(page: PrintPageSize, dpi: number): { width: number; height: number; dpi: number } {
  const d = effectiveDpi(page, dpi);
  return { width: Math.max(1, Math.round((page.widthPt / 72) * d)), height: Math.max(1, Math.round((page.heightPt / 72) * d)), dpi: d };
}

const pt = (n: number) => `${Math.round(n * 100) / 100}pt`;

/**
 * Hoja de estilos de impresión. Cada página es una sección con su propia página con nombre (`p0`, `p1`…):
 * - **actual**: la hoja mide lo que la página del PDF y la imagen ocupa su tamaño físico.
 * - **fit**: la hoja es la del papel elegido en el diálogo de impresión (solo se indica la orientación de cada página) y
 *   la imagen se ajusta dentro, sin deformarse.
 */
export function buildPrintCss(pages: PrintPageSize[], scale: PrintScale, grayscale: boolean): string {
  const rules: string[] = [
    '@media screen { #rea-print-root { display: none !important; } }',
    '@media print {',
    '  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }',
    '  body > *:not(#rea-print-root) { display: none !important; }',
    '  #rea-print-root { display: block !important; }',
    `  #rea-print-root img { display: block; ${grayscale ? 'filter: grayscale(1); ' : ''}}`,
    '  .rea-print-page { break-after: page; break-inside: avoid; overflow: hidden; }',
    '  .rea-print-page:last-child { break-after: auto; }',
  ];
  if (scale === 'actual') {
    rules.push('  .rea-print-page img { width: 100%; height: 100%; }');
  } else {
    rules.push('  .rea-print-page { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }');
    rules.push('  .rea-print-page img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }');
  }
  pages.forEach((p, i) => {
    rules.push(`  .rea-print-p${i} { page: p${i}; ${scale === 'actual' ? `width: ${pt(p.widthPt)}; height: ${pt(p.heightPt)};` : ''} }`);
  });
  rules.push('}');
  // Las páginas con nombre se declaran fuera de @media print, como exige CSS
  pages.forEach((p, i) => {
    const size = scale === 'actual' ? `${pt(p.widthPt)} ${pt(p.heightPt)}` : p.widthPt >= p.heightPt ? 'landscape' : 'portrait';
    rules.push(`@page p${i} { size: ${size}; margin: 0; }`);
  });
  return rules.join('\n');
}
