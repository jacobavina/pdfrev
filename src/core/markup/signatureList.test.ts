import { describe, it, expect } from 'vitest';
import type { Markup } from '../../types/markup';
import { describeVerification, formatSignatureDate, nextUnsigned, signatureCounts, signatureRows } from './signatureList';

const field = (id: string, pageIndex: number, y: number, custom: Record<string, string | number>, extra: Partial<Markup> = {}): Markup =>
  ({ id, type: 'formField', pageIndex, points: [{ x: 0.1, y }, { x: 0.4, y: y + 0.05 }], style: { strokeColor: '#00f', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending', customFields: custom, ...extra }) as Markup;

describe('Signatures: campos de firma y verificación (ADR-0122)', () => {
  const all = [
    field('s2', 1, 0.2, { fieldType: 'signature', fieldName: 'Firma2' }),
    field('s1', 0, 0.5, { fieldType: 'signature', fieldName: 'Firma1', sigSigned: 1, sigSigner: 'Ana Pérez', sigDate: '2026-10-22T10:30:00Z', sigReason: 'Aprobado', sigLocation: 'Lima' }, { locked: true }),
    field('t', 0, 0.1, { fieldType: 'text', fieldName: 'Nombre' }),
    field('h', 0, 0.9, { fieldType: 'signature', fieldName: 'Oculta' }, { hidden: true }),
    { ...field('x', 0, 0.3, {}), type: 'rectangle' } as Markup,
  ];

  it('solo cuentan los campos de firma, por página y posición, sin los ocultos', () => {
    expect(signatureRows(all).map((r) => r.id)).toEqual(['s1', 's2']);
  });

  it('una firma firmada lleva firmante, fecha, motivo y lugar, y queda bloqueada', () => {
    const [signed, pending] = signatureRows(all);
    expect(signed).toMatchObject({ signed: true, signer: 'Ana Pérez', date: '2026-10-22T10:30:00Z', reason: 'Aprobado', location: 'Lima', locked: true });
    expect(pending).toMatchObject({ signed: false, signer: '', locked: false });
    expect(signatureCounts(signatureRows(all))).toEqual({ total: 2, signed: 1 });
  });

  it('el siguiente sin firmar salta las firmadas y da la vuelta', () => {
    const rows = signatureRows(all);
    expect(nextUnsigned(rows)?.id).toBe('s2');
    expect(nextUnsigned(rows, 's2')?.id).toBe('s2');
    expect(nextUnsigned(rows.filter((r) => r.signed))).toBeNull();
  });

  it('la fecha se acorta a día y hora y lo que no tiene esa forma se deja como está', () => {
    expect(formatSignatureDate('2026-10-22T10:30:00Z')).toBe('2026-10-22 10:30');
    expect(formatSignatureDate('D:2026')).toBe('D:2026');
    expect(formatSignatureDate('')).toBe('');
  });

  it('una firma válida que cubre todo el documento se cuenta como válida', () => {
    const v = describeVerification({ valid: true, signerName: 'Ana', reason: 'OK', location: 'Lima', coversWholeDocument: true });
    expect(v.status).toBe('valid');
    expect(v.detail).toContain('Signed by Ana');
    expect(v.detail).toContain('Reason: OK · Location: Lima');
  });

  it('válida pero con cambios posteriores, no válida, sin firma y error se distinguen', () => {
    expect(describeVerification({ valid: true, signerName: 'Ana', coversWholeDocument: false }).status).toBe('valid-edited');
    expect(describeVerification({ valid: false, signerName: 'Ana', coversWholeDocument: true }).status).toBe('invalid');
    expect(describeVerification(null, 'No /ByteRange found in PDF').status).toBe('none');
    expect(describeVerification(null, 'Invalid CMS ContentInfo').status).toBe('error');
    expect(describeVerification({ valid: true, signerName: '', coversWholeDocument: true }).detail).toMatch(/^Signed\./);
  });
});
