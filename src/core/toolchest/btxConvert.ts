import { PDFContext, PDFDict, PDFDocument, PDFName, PDFObjectParser, PDFRef, PDFString } from 'pdf-lib';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { COUNT_SYMBOLS } from '../markup/countSymbols';
import type { Markup } from '../../types/markup';
import { BtxItem } from './btx';
import { BTX_PAGE_H, BTX_PAGE_W, refineImportedMarkup, shortBtxType } from './btxRefine';

/**
 * De Tool Set de Revu a marcas de REA (ADR-0101): cada herramienta lleva su anotación PDF, así que se vuelcan todas en
 * un PDF temporal y se leen con el mismo lector que abre los PDF de Revu y Acrobat. Así no hay un segundo
 * intérprete de anotaciones que mantener.
 */

export interface BtxImportResult {
  /** Marca de cada herramienta importada, con el nombre y modo que tenía en Revu. */
  tools: { name: string; mode: 'properties' | 'drawing'; markup: Markup }[];
  /** Herramientas que REA no puede importar y por qué. */
  skipped: { name: string; type: string; reason: string }[];
}

/** Tipos de Revu sin equivalente en REA. */
const UNSUPPORTED: Record<string, string> = {
  AnnotationBRXStamp: 'Stamps with their own artwork are not imported.',
};

/** Convierte las herramientas de un .btx en marcas de REA. */
export async function btxItemsToMarkups(items: BtxItem[]): Promise<BtxImportResult> {
  const result: BtxImportResult = { tools: [], skipped: [] };
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([BTX_PAGE_W, BTX_PAGE_H]);
  const ids: { item: BtxItem; id: string }[] = [];
  const refs: PDFRef[] = [];

  items.forEach((item, i) => {
    const t = shortBtxType(item.type);
    if (UNSUPPORTED[t]) {
      result.skipped.push({ name: item.name, type: t, reason: UNSUPPORTED[t] });
      return;
    }
    try {
      const bytes = Uint8Array.from(item.dict, (c) => c.charCodeAt(0) & 0xff);
      const parsed = PDFObjectParser.forBytes(bytes, PDFContext.create()).parseObject();
      if (!(parsed instanceof PDFDict)) throw new Error('The annotation is not a dictionary.');
      // Se coloca en la hoja con su rectángulo tal cual (Revu lo guarda en el origen) y un identificador propio
      const id = `btx-${i}`;
      const dict = pdf.context.obj({});
      for (const [k, v] of parsed.entries()) dict.set(k, v);
      dict.set(PDFName.of('Type'), PDFName.of('Annot'));
      dict.set(PDFName.of('NM'), PDFString.of(id));
      dict.set(PDFName.of('P'), page.ref);
      refs.push(pdf.context.register(dict));
      ids.push({ item, id });
    } catch (err) {
      result.skipped.push({ name: item.name, type: t, reason: err instanceof Error ? err.message : String(err) });
    }
  });
  if (refs.length === 0) return result;

  page.node.set(PDFName.of('Annots'), pdf.context.obj(refs));
  const imported = (await importPdfAnnotations(await pdf.save())).markups;
  const byId = new Map(imported.map((m) => [m.id, m]));
  for (const { item, id } of ids) {
    const markup = byId.get(id);
    if (!markup) {
      result.skipped.push({ name: item.name, type: shortBtxType(item.type), reason: 'REA does not support this kind of annotation yet.' });
      continue;
    }
    result.tools.push({ name: item.name, mode: item.mode, markup: refineImportedMarkup(item, markup, COUNT_SYMBOLS.map((s) => s.id)) });
  }
  return result;
}
