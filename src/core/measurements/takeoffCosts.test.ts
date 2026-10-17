import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { Markup } from '../../types/markup';
import {
  toCents,
  fromCents,
  computeItemCostCents,
  formatCurrency,
  computeTakeoffSubtotals,
} from './takeoffCosts';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';

function createTestMarkup(partial: Partial<Markup> & Pick<Markup, 'id' | 'type' | 'pageIndex' | 'points'>): Markup {
  const now = new Date().toISOString();
  return {
    author: 'Tester',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
    ...partial,
  };
}

describe('Takeoff Subtotals & Unit Costs (B.3 / ADR-0077)', () => {
  it('calcula subtotales por Subject y capa sumando antes de redondear y costes exactos en céntimos sin error de coma flotante', () => {
    // 1. Verificación de aritmética entera exacta en céntimos (sin error de coma flotante 0.1 + 0.2)
    expect(0.1 + 0.2).not.toBe(0.3); // Conocido defecto IEEE-754
    const centsA = toCents(0.1);
    const centsB = toCents(0.2);
    expect(centsA + centsB).toBe(30);
    expect(fromCents(centsA + centsB)).toBe(0.3);
    expect(formatCurrency(30)).toBe('$0.30');
    expect(computeItemCostCents(10, 2450)).toBe(24500);

    // 2. Suma antes de redondear evita discrepancia de centésimas acumuladas:
    // 3 mediciones de 10.334 m² cada una:
    // Si se redondea antes: 10.33 + 10.33 + 10.33 = 30.99
    // Sumando antes de redondear: 10.334 * 3 = 31.002 -> 31.00 m²
    const markups: Markup[] = [
      createTestMarkup({
        id: 'm1',
        type: 'area',
        pageIndex: 0,
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        subject: 'Cerámica Baños',
        layer: 'Acabados',
        unitPrice: 24.50, // $24.50 por m²
        measurement: {
          value: 10.334,
          unit: 'm',
          formatted: '10.33 m²',
          perimeter: 14.2,
        },
      }),
      createTestMarkup({
        id: 'm2',
        type: 'area',
        pageIndex: 0,
        points: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }],
        subject: 'Cerámica Baños',
        layer: 'Acabados',
        unitPrice: 24.50,
        measurement: {
          value: 10.334,
          unit: 'm',
          formatted: '10.33 m²',
          perimeter: 14.2,
        },
      }),
      createTestMarkup({
        id: 'm3',
        type: 'area',
        pageIndex: 0,
        points: [{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }],
        subject: 'Cerámica Baños',
        layer: 'Acabados',
        unitPrice: 24.50,
        measurement: {
          value: 10.334,
          unit: 'm',
          formatted: '10.33 m²',
          perimeter: 14.2,
        },
      }),
    ];

    const subtotalsBySubject = computeTakeoffSubtotals(markups, { groupBy: 'subject' });
    expect(subtotalsBySubject).toHaveLength(1);
    const sub = subtotalsBySubject[0];
    expect(sub.groupKey).toBe('Cerámica Baños');
    expect(sub.category).toBe('area');
    expect(sub.itemCount).toBe(3);
    // Cantidad exacta sin redondear:
    expect(sub.rawQuantity).toBeCloseTo(31.002, 5);
    // Formateada redondeada tras la suma:
    expect(sub.formattedQuantity).toBe('31.00 m²');
    // Perímetro acumulado
    expect(sub.perimeter).toBeCloseTo(42.6, 5);
    // Costes exactos en céntimos
    expect(sub.unitPriceCents).toBe(2450); // $24.50
    expect(sub.unitPrice).toBe(24.5);
    // Coste total: 31.002 * 2450 = 75954.9 céntimos -> redondeado a entero 75955 céntimos = $759.55
    expect(sub.totalCostCents).toBe(75955);
    expect(sub.totalCost).toBe(759.55);
    expect(sub.formattedCost).toBe('$759.55');

    // 3. Subtotales por Capa (Layer)
    const subtotalsByLayer = computeTakeoffSubtotals(markups, { groupBy: 'layer' });
    expect(subtotalsByLayer).toHaveLength(1);
    expect(subtotalsByLayer[0].groupKey).toBe('Acabados');
    expect(subtotalsByLayer[0].formattedQuantity).toBe('31.00 m²');
  });

  it('agrupa por Subject, Layer y Page correctamente con catálogo de precios', () => {
    const markups: Markup[] = [
      createTestMarkup({
        id: 'c1',
        type: 'count',
        pageIndex: 0,
        points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }],
        subject: 'Puertas RF-60',
        layer: 'Carpintería',
        measurement: {
          value: 3,
          unit: 'count' as any,
          formatted: '3 ea',
        },
      }),
      createTestMarkup({
        id: 'l1',
        type: 'length',
        pageIndex: 1,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        subject: 'Tubería Cobre 22mm',
        layer: 'Fontanería',
        measurement: {
          value: 12.5,
          unit: 'm',
          formatted: '12.50 m',
        },
      }),
    ];

    // Catálogo externo de precios unitarios
    const catalog = {
      'Puertas RF-60': 185.00,
      'Tubería Cobre 22mm': 14.20,
    };

    // Agrupación global por Subject
    const bySubject = computeTakeoffSubtotals(markups, { groupBy: 'subject', catalog });
    expect(bySubject).toHaveLength(2);
    expect(bySubject[0].groupKey).toBe('Puertas RF-60');
    expect(bySubject[0].formattedQuantity).toBe('3 ea');
    expect(bySubject[0].formattedCost).toBe('$555.00');

    expect(bySubject[1].groupKey).toBe('Tubería Cobre 22mm');
    expect(bySubject[1].formattedQuantity).toBe('12.50 m');
    expect(bySubject[1].formattedCost).toBe('$177.50');

    // Filtrado por página
    const page0Only = computeTakeoffSubtotals(markups, { groupBy: 'subject', catalog, pageIndex: 0 });
    expect(page0Only).toHaveLength(1);
    expect(page0Only[0].groupKey).toBe('Puertas RF-60');

    // Agrupación por página
    const byPage = computeTakeoffSubtotals(markups, { groupBy: 'page', catalog });
    expect(byPage).toHaveLength(2);
    expect(byPage[0].groupKey).toBe('Page 1');
    expect(byPage[1].groupKey).toBe('Page 2');
  });

  it('persiste bidireccionalmente /Subj, unitPrice y cost en PDF estándar e incremental', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([600, 800]);
    const baseBytes = await pdfDoc.save();

    const originalMarkup: Markup = createTestMarkup({
      id: 'markup-takeoff-1',
      type: 'area',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
      style: { strokeColor: '#1e40af', strokeWidth: 2, fillColor: '#93c5fd', opacity: 1 },
      subject: 'Pavimento Granito',
      layer: 'Solados',
      unitPrice: 42.00,
      cost: 504.00,
      measurement: {
        value: 12.0,
        unit: 'm',
        formatted: '12.00 m²',
        perimeter: 14.0,
      },
    });

    // Guardado incremental
    const modifiedBytes = await saveIncrementalMarkups(baseBytes, [originalMarkup]);

    // Lectura de anotaciones del PDF generado
    const { markups: readMarkups } = await importPdfAnnotations(modifiedBytes);
    expect(readMarkups).toHaveLength(1);
    const read = readMarkups[0];
    expect(read.id).toBe(originalMarkup.id);
    expect(read.subject).toBe('Pavimento Granito');
    expect(read.layer).toBe('Solados');
    expect(read.unitPrice).toBe(42.00);
    expect(read.cost).toBe(504.00);
    expect(read.measurement?.value).toBe(12.0);
  });
});
