import type { Markup } from '../../types/markup';
import { fieldTypeOf, isSignatureSigned } from './formFields';

/**
 * Lista de campos de firma (panel Signatures, ADR-0122) y lectura del resultado de verificar la firma del documento. Puro.
 */

export interface SignatureRow {
  id: string;
  pageIndex: number;
  name: string;
  signed: boolean;
  signer: string;
  /** Fecha de la firma como la guarda el PDF (ISO) o texto; vacía si no la hay. */
  date: string;
  reason: string;
  location: string;
  locked: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

export const isSignatureField = (m: Markup): boolean => m.type === 'formField' && fieldTypeOf(m) === 'signature';

/** Los campos de firma del documento, por página, posición y nombre. */
export function signatureRows(markups: Markup[]): SignatureRow[] {
  const top = (m: Markup) => (m.points.length > 0 ? Math.min(...m.points.map((p) => p.y)) : 0);
  return markups
    .filter((m) => isSignatureField(m) && !m.hidden)
    .sort((a, b) => a.pageIndex - b.pageIndex || top(a) - top(b) || natural(str(a.customFields?.fieldName), str(b.customFields?.fieldName)) || a.id.localeCompare(b.id))
    .map((m) => ({
      id: m.id,
      pageIndex: m.pageIndex,
      name: str(m.customFields?.fieldName),
      signed: isSignatureSigned(m),
      signer: str(m.customFields?.sigSigner),
      date: str(m.customFields?.sigDate),
      reason: str(m.customFields?.sigReason),
      location: str(m.customFields?.sigLocation),
      locked: Boolean(m.locked),
    }));
}

export const signatureCounts = (rows: SignatureRow[]): { total: number; signed: number } => ({ total: rows.length, signed: rows.filter((r) => r.signed).length });

/** El siguiente campo sin firmar después de `afterId`, dando la vuelta al final; null si todos están firmados. */
export function nextUnsigned(rows: SignatureRow[], afterId?: string | null): SignatureRow | null {
  const pending = rows.filter((r) => !r.signed);
  if (pending.length === 0) return null;
  const at = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
  return rows.slice(at + 1).find((r) => !r.signed) ?? pending[0];
}

/** "2026-10-22T10:30:00Z" → "2026-10-22 10:30"; lo que no tenga esa forma se deja como está. */
export function formatSignatureDate(raw: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(raw);
  return m ? `${m[1]} ${m[2]}` : raw;
}

export type VerificationStatus = 'valid' | 'valid-edited' | 'invalid' | 'none' | 'error';

export interface VerificationView {
  status: VerificationStatus;
  headline: string;
  detail: string;
}

interface VerifiedLike {
  valid: boolean;
  signerName: string;
  reason?: string;
  location?: string;
  coversWholeDocument: boolean;
}

/** Lo que se le cuenta al usuario tras verificar: válida, válida pero con cambios posteriores, no válida o sin firma. */
export function describeVerification(result: VerifiedLike | null, error?: string): VerificationView {
  if (error !== undefined) {
    if (/No \/ByteRange/i.test(error)) return { status: 'none', headline: 'No digital signature', detail: 'This document has not been signed with a digital signature.' };
    return { status: 'error', headline: 'The signature could not be checked', detail: error };
  }
  if (!result) return { status: 'error', headline: 'The signature could not be checked', detail: 'There was nothing to check.' };
  const who = result.signerName ? `Signed by ${result.signerName}` : 'Signed';
  const extra = [result.reason ? `Reason: ${result.reason}` : '', result.location ? `Location: ${result.location}` : ''].filter(Boolean).join(' · ');
  if (!result.valid) return { status: 'invalid', headline: 'The signature is not valid', detail: `${who}. The document was changed after it was signed, or the signature is damaged.${extra ? ` ${extra}` : ''}` };
  if (!result.coversWholeDocument) return { status: 'valid-edited', headline: 'Valid, but the document changed afterwards', detail: `${who}. Markups or edits were added after signing; the signature covers only what it signed.${extra ? ` ${extra}` : ''}` };
  return { status: 'valid', headline: 'The signature is valid', detail: `${who}. The document has not changed since.${extra ? ` ${extra}` : ''}` };
}
