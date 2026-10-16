import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { Markup, MarkupType } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const mk = (
  id: string,
  type: MarkupType,
  points: { x: number; y: number }[],
  customFields: Record<string, string | number>
): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#2563eb', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '2026-10-12T10:00:00Z',
  updatedAt: '2026-10-12T10:00:00Z',
  status: 'pending',
  customFields,
});

const box = (x: number, y: number, w = 0.15, h = 0.04) => [
  { x, y },
  { x: x + w, y: y + h },
];

const markups: Markup[] = [
  mk('f-text', 'formField', box(0.1, 0.1), { fieldType: 'text', fieldName: 'Project', fieldValue: 'Tower A' }),
  mk('f-check', 'formField', box(0.1, 0.2, 0.02, 0.026), { fieldType: 'checkbox', fieldName: 'Approved', fieldValue: 'Yes' }),
  mk('f-r1', 'formField', box(0.1, 0.3, 0.02, 0.026), { fieldType: 'radio', fieldName: 'Phase', radioValue: 'Design', fieldValue: 'Off' }),
  mk('f-r2', 'formField', box(0.2, 0.3, 0.02, 0.026), { fieldType: 'radio', fieldName: 'Phase', radioValue: 'Build', fieldValue: 'Yes' }),
  mk('f-drop', 'formField', box(0.1, 0.4), { fieldType: 'dropdown', fieldName: 'Discipline', fieldOptions: 'ARCH\nSTR\nMEP', fieldValue: 'STR' }),
  mk('f-sig', 'formField', box(0.1, 0.5, 0.2, 0.08), { fieldType: 'signature', fieldName: 'Signature1' }),
  mk('l-url', 'link', box(0.5, 0.1), { linkUri: 'https://example.com/specs' }),
  mk('l-page', 'link', box(0.5, 0.2), { linkPage: 3 }),
  mk('att', 'fileAttachment', box(0.5, 0.3, 0.025, 0.033), { attachmentKey: 'k1', attachmentName: 'RFI-012.txt', attachmentMime: 'text/plain' }),
];
const attachmentBytes = new TextEncoder().encode('RFI 012: confirm beam size at grid C-4');

describe('Formularios, enlaces y adjuntos en el PDF (ADR-0027)', () => {
  it('los campos son AcroForm reales: PDF.js los reconoce con su tipo y valor', async () => {
    const saved = await saveIncrementalMarkups(blueprint, markups, {}, {
      attachments: { k1: { name: 'RFI-012.txt', mime: 'text/plain', bytes: attachmentBytes } },
    });
    const pdf = await pdfjs.getDocument({ data: saved, disableFontFace: true }).promise;
    const fields = (await pdf.getFieldObjects()) as Record<string, { type: string; value: unknown }[]>;
    expect(Object.keys(fields).sort()).toEqual(['Approved', 'Discipline', 'Phase', 'Project', 'Signature1']);
    expect(fields.Project[0].type).toBe('text');
    expect(fields.Project[0].value).toBe('Tower A');
    expect(fields.Approved[0].type).toBe('checkbox');
    expect(fields.Approved[0].value).toBe('Yes');
    // El grupo es un campo padre (sin tipo propio en PDF.js) con dos botones de opción
    expect(fields.Phase.filter((f) => f.type).map((f) => f.type)).toEqual(['radiobutton', 'radiobutton']);
    expect(fields.Discipline[0].type).toBe('combobox');
    expect(fields.Discipline[0].value).toBe('STR');
    expect(fields.Signature1[0].type).toBe('signature');

    const page = await pdf.getPage(1);
    const annots = await page.getAnnotations();
    const url = annots.find((a: { subtype: string; url?: string }) => a.subtype === 'Link' && a.url);
    expect(url?.url).toBe('https://example.com/specs');
    const att = annots.find((a: { subtype: string }) => a.subtype === 'FileAttachment') as {
      file?: { filename: string; content: Uint8Array };
    };
    expect(att.file?.filename).toBe('RFI-012.txt');
    expect(new TextDecoder().decode(att.file!.content)).toBe('RFI 012: confirm beam size at grid C-4');
    await pdf.destroy();
  });

  it('ida y vuelta: REA recupera campos, valor rellenado fuera, enlaces y bytes del adjunto', async () => {
    const saved = await saveIncrementalMarkups(blueprint, markups, {}, {
      attachments: { k1: { name: 'RFI-012.txt', mime: 'text/plain', bytes: attachmentBytes } },
    });
    // Simula que en Acrobat se cambió el texto del campo (/V del widget)
    const doc = await PDFDocument.load(saved);
    const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
    const widget = annots
      .asArray()
      .map((r) => doc.context.lookup(r, PDFDict))
      .find((d) => d.get(PDFName.of('FT'))?.toString() === '/Tx')!;
    const { PDFString } = await import('pdf-lib');
    widget.set(PDFName.of('V'), PDFString.of('Tower B'));
    const edited = await doc.save();

    const back = await importPdfAnnotations(edited);
    const byId = (id: string) => back.markups.find((m) => m.id === id)!;
    expect(byId('f-text').type).toBe('formField');
    expect(byId('f-text').customFields?.fieldValue).toBe('Tower B');
    expect(byId('f-check').customFields?.fieldValue).toBe('Yes');
    expect(byId('f-r1').customFields?.fieldValue).toBe('Off');
    expect(byId('f-r2').customFields?.fieldValue).toBe('Yes');
    expect(byId('l-url').customFields?.linkUri).toBe('https://example.com/specs');
    expect(byId('l-page').customFields?.linkPage).toBe(3);
    expect(new TextDecoder().decode(back.attachments.k1.bytes)).toBe('RFI 012: confirm beam size at grid C-4');
    // Los widgets y enlaces de REA no cuentan como anotaciones ajenas no editables
    expect(back.foreignUnsupportedCount).toBe(0);
  });

  it('guardar de nuevo no duplica los campos en /AcroForm y conserva los ajenos', async () => {
    const once = await saveIncrementalMarkups(blueprint, markups);
    const twice = await saveIncrementalMarkups(once, markups);
    const doc = await PDFDocument.load(twice);
    const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    // Project, Approved, Discipline, Signature1 y el grupo Phase
    expect(acro.lookup(PDFName.of('Fields'), PDFArray).size()).toBe(5);
    const none = await saveIncrementalMarkups(twice, markups.filter((m) => m.type !== 'formField'));
    const doc3 = await PDFDocument.load(none);
    expect(doc3.catalog.lookup(PDFName.of('AcroForm'), PDFDict).lookup(PDFName.of('Fields'), PDFArray).size()).toBe(0);
  });

  it('importa y rellena formularios AcroForm de PDFs hechos en otras aplicaciones sin /REA (ADR-0055)', async () => {
    // Construye un PDF externo con AcroForm estándar de pdf-lib (sin clave /REA, con herencia /Parent en grupos)
    const extDoc = await PDFDocument.create();
    const page = extDoc.addPage([612, 792]);
    const form = extDoc.getForm();

    const tf = form.createTextField('Contractor');
    tf.setText('Initial Co');
    tf.addToPage(page, { x: 50, y: 700, width: 150, height: 24 });

    const cb = form.createCheckBox('SiteReady');
    cb.uncheck();
    cb.addToPage(page, { x: 50, y: 650, width: 18, height: 18 });

    const rg = form.createRadioGroup('Zone');
    rg.addOptionToPage('North', page, { x: 50, y: 600, width: 18, height: 18 });
    rg.addOptionToPage('South', page, { x: 100, y: 600, width: 18, height: 18 });
    rg.select('North');

    const dd = form.createDropdown('Material');
    dd.addOptions(['Concrete', 'Steel', 'Timber']);
    dd.select('Concrete');
    dd.addToPage(page, { x: 50, y: 550, width: 120, height: 24 });

    const ro = form.createTextField('ReadOnlyCode');
    ro.setText('DOC-001');
    ro.enableReadOnly();
    ro.addToPage(page, { x: 50, y: 500, width: 120, height: 24 });

    const foreignBytes = await extDoc.save();

    // 1. Importar con importPdfAnnotations
    const imported = await importPdfAnnotations(foreignBytes);
    expect(imported.foreignUnsupportedCount).toBe(0);
    const fields = imported.markups.filter((m) => m.type === 'formField');
    expect(fields).toHaveLength(6); // Contractor, SiteReady, Zone(North), Zone(South), Material, ReadOnlyCode

    const contractor = fields.find((m) => m.customFields?.fieldName === 'Contractor')!;
    const siteReady = fields.find((m) => m.customFields?.fieldName === 'SiteReady')!;
    const zoneNorth = fields.find(
      (m) => m.customFields?.fieldName === 'Zone' && m.customFields?.radioValue === 'North'
    )!;
    const zoneSouth = fields.find(
      (m) => m.customFields?.fieldName === 'Zone' && m.customFields?.radioValue === 'South'
    )!;
    const material = fields.find((m) => m.customFields?.fieldName === 'Material')!;
    const readOnly = fields.find((m) => m.customFields?.fieldName === 'ReadOnlyCode')!;

    expect(contractor.customFields?.fieldValue).toBe('Initial Co');
    expect(siteReady.customFields?.fieldValue).toBe('Off');
    expect(zoneNorth.customFields?.fieldValue).toBe('Yes');
    expect(zoneSouth.customFields?.fieldValue).toBe('Off');
    expect(material.customFields?.fieldValue).toBe('Concrete');
    expect(String(material.customFields?.fieldOptions).split('\n')).toEqual(['Concrete', 'Steel', 'Timber']);
    expect(readOnly.locked).toBe(true);

    // 2. Rellenar los campos en REA y guardar incrementalmente
    const updatedMarkups = imported.markups.map((m) => {
      if (m.id === contractor.id) {
        return { ...m, customFields: { ...m.customFields, fieldValue: 'Acme Builders' } };
      }
      if (m.id === siteReady.id) {
        return { ...m, customFields: { ...m.customFields, fieldValue: 'Yes' } };
      }
      if (m.id === zoneNorth.id) {
        return { ...m, customFields: { ...m.customFields, fieldValue: 'Off' } };
      }
      if (m.id === zoneSouth.id) {
        return { ...m, customFields: { ...m.customFields, fieldValue: 'Yes' } };
      }
      if (m.id === material.id) {
        return { ...m, customFields: { ...m.customFields, fieldValue: 'Steel' } };
      }
      return m;
    });

    const saved = await saveIncrementalMarkups(foreignBytes, updatedMarkups, {}, {
      importedIds: imported.markups.map((m) => m.id),
    });

    // Comprobar que el archivo original se conserva intacto como prefijo (actualización incremental)
    expect(saved.subarray(0, foreignBytes.length)).toEqual(foreignBytes);

    // 3. Reabrir con PDF.js y con importPdfAnnotations
    const pdf = await pdfjs.getDocument({ data: saved.slice(), disableFontFace: true }).promise;
    const pdfFields = (await pdf.getFieldObjects()) as Record<string, { type: string; value: unknown }[]>;
    expect(pdfFields.Contractor.find((f) => f.type)?.value).toBe('Acme Builders');
    expect(pdfFields.Material.find((f) => f.type)?.value).toBe('Steel');
    await pdf.destroy();

    // No se duplicaron entradas en /AcroForm /Fields
    const reloadedDoc = await PDFDocument.load(saved);
    const acro = reloadedDoc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    expect(acro.lookup(PDFName.of('Fields'), PDFArray).size()).toBe(5);

    const reimported = await importPdfAnnotations(saved);
    const reByName = (name: string, radioVal?: string) =>
      reimported.markups.find(
        (m) =>
          m.customFields?.fieldName === name &&
          (radioVal === undefined || m.customFields?.radioValue === radioVal)
      )!;
    expect(reByName('Contractor').customFields?.fieldValue).toBe('Acme Builders');
    expect(reByName('SiteReady').customFields?.fieldValue).toBe('Yes');
    expect(reByName('Zone', 'North').customFields?.fieldValue).toBe('Off');
    expect(reByName('Zone', 'South').customFields?.fieldValue).toBe('Yes');
    expect(reByName('Material').customFields?.fieldValue).toBe('Steel');
  });
});

