import type { LinkEntry, LinkTarget } from '../core/links/linkList';

/**
 * Lectura de los enlaces propios del PDF para el panel Links (ADR-0116): anotaciones `Link` con dirección o destino, de
 * todas las páginas. Los enlaces que ya son marcas de REA se omiten (el panel los toma de las marcas).
 */

interface PdfPageLike {
  getViewport: (o: { scale: number }) => { width: number; height: number; convertToViewportRectangle: (r: number[]) => number[] };
  getAnnotations: () => Promise<{ subtype: string; rect: number[]; url?: string; dest?: unknown; id?: string }[]>;
}

interface PdfDocLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
  getDestination?: (name: string) => Promise<unknown[] | null>;
  getPageIndex?: (ref: unknown) => Promise<number>;
}

async function destinationPage(doc: PdfDocLike, dest: unknown): Promise<number | undefined> {
  const resolved = typeof dest === 'string' ? await doc.getDestination?.(dest) : (dest as unknown[] | null);
  // El primer elemento es una referencia a la página o su índice, que puede ser 0
  if (!Array.isArray(resolved) || resolved[0] === undefined || resolved[0] === null) return undefined;
  if (typeof resolved[0] === 'number') return resolved[0] as number;
  return typeof doc.getPageIndex === 'function' ? doc.getPageIndex(resolved[0]).catch(() => undefined) : undefined;
}

/** Los enlaces del PDF que no son marcas de REA. `isCancelled` corta la lectura si el panel ya no la necesita. */
export async function readPdfLinks(pdfDoc: unknown, reaIds: Set<string>, isCancelled: () => boolean = () => false): Promise<LinkEntry[]> {
  const doc = pdfDoc as PdfDocLike | null;
  if (!doc || typeof doc.getPage !== 'function') return [];
  const out: LinkEntry[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    if (isCancelled()) break;
    try {
      const page = await doc.getPage(i + 1);
      const vp = page.getViewport({ scale: 1 });
      const annots = await page.getAnnotations();
      for (let k = 0; k < annots.length; k++) {
        const a = annots[k];
        if (a.subtype !== 'Link' || (a.id && reaIds.has(a.id))) continue;
        let target: LinkTarget = { kind: 'none' };
        if (a.url) target = { kind: 'url', url: a.url };
        else if (a.dest) {
          const idx = await destinationPage(doc, a.dest);
          if (idx !== undefined) target = { kind: 'page', page: idx + 1 };
        }
        const [, y1, , y2] = vp.convertToViewportRectangle(a.rect);
        out.push({ key: `p:${i}:${a.id ?? k}`, source: 'pdf', pageIndex: i, y: Math.min(y1, y2) / vp.height, target });
      }
    } catch (err) {
      // Una página ilegible no impide listar el resto
      console.warn(`[Links] No se pudieron leer los enlaces de la página ${i + 1}:`, err);
    }
  }
  return out;
}
