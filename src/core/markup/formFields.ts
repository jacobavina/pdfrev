import { Markup } from '../../types/markup';

/**
 * Campos de formulario (ADR-0027), como Tools ▸ Form de Revu: se diseñan sobre el plano y se escriben como campos
 * AcroForm reales (widget + campo) que Revu y Acrobat pueden rellenar. Puro: sin React ni DOM.
 */

export type FieldType = 'text' | 'checkbox' | 'radio' | 'listbox' | 'dropdown' | 'button' | 'signature';

export interface FieldTypeDef {
  id: FieldType;
  label: string;
  /** Prefijo del nombre automático (Text1, Check1…). */
  prefix: string;
  /** /FT del campo PDF. */
  pdfFT: 'Tx' | 'Btn' | 'Ch' | 'Sig';
  /** /Ff del campo PDF (ISO 32000-1 tablas 226, 228, 230). */
  flags: number;
  /** Tamaño por defecto en pt (clic sin arrastrar). */
  size: { width: number; height: number };
}

export const FIELD_TYPES: FieldTypeDef[] = [
  { id: 'text', label: 'Text Box', prefix: 'Text', pdfFT: 'Tx', flags: 0, size: { width: 144, height: 20 } },
  { id: 'checkbox', label: 'Check Box', prefix: 'Check', pdfFT: 'Btn', flags: 0, size: { width: 14, height: 14 } },
  // Radio (bit 16) + NoToggleToOff (bit 15)
  { id: 'radio', label: 'Radio Button', prefix: 'Group', pdfFT: 'Btn', flags: 49152, size: { width: 14, height: 14 } },
  { id: 'listbox', label: 'List Box', prefix: 'List', pdfFT: 'Ch', flags: 0, size: { width: 120, height: 60 } },
  // Combo (bit 18)
  { id: 'dropdown', label: 'Dropdown', prefix: 'Dropdown', pdfFT: 'Ch', flags: 131072, size: { width: 120, height: 20 } },
  // Pushbutton (bit 17)
  { id: 'button', label: 'Button', prefix: 'Button', pdfFT: 'Btn', flags: 65536, size: { width: 80, height: 24 } },
  { id: 'signature', label: 'Digital Signature', prefix: 'Signature', pdfFT: 'Sig', flags: 0, size: { width: 160, height: 48 } },
];

export function fieldTypeDef(id: unknown): FieldTypeDef {
  return FIELD_TYPES.find((f) => f.id === id) ?? FIELD_TYPES[0];
}

export function fieldTypeOf(markup: Markup): FieldType {
  return fieldTypeDef(markup.customFields?.fieldType).id;
}

/** Siguiente nombre libre para un tipo (Text1, Text2…); en radio, el grupo nuevo. */
export function nextFieldName(type: FieldType, markups: Markup[]): string {
  const prefix = fieldTypeDef(type).prefix;
  const used = new Set(markups.filter((m) => m.type === 'formField').map((m) => String(m.customFields?.fieldName ?? '')));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Opciones de listas y desplegables (una por línea). */
export function fieldOptions(markup: Markup): string[] {
  const raw = markup.customFields?.fieldOptions;
  return typeof raw === 'string' ? raw.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

/** ¿Está marcada la casilla o el botón de opción? */
export function isFieldChecked(markup: Markup): boolean {
  return markup.customFields?.fieldValue === 'Yes';
}

/** Valor de exportación de un botón de opción (nombre PDF seguro). */
export function radioExportValue(markup: Markup): string {
  const raw = String(markup.customFields?.radioValue ?? 'Choice1');
  return raw.replace(/[^A-Za-z0-9_-]/g, '') || 'Choice1';
}

/** ¿Está firmado digitalmente el campo de firma? */
export function isSignatureSigned(markup: Markup): boolean {
  return markup.customFields?.sigSigned === 1;
}

/** Líneas visibles de un campo de firma firmado (firmante, fecha y motivo/lugar). */
export function signatureDisplayLines(markup: Markup): { headline: string; details: string } | null {
  if (!isSignatureSigned(markup)) return null;
  const signer = String(markup.customFields?.sigSigner || markup.author || 'Signer');
  const headline = `Digitally signed by ${signer}`;
  const parts: string[] = [];
  if (markup.customFields?.sigDate) {
    const raw = String(markup.customFields.sigDate);
    parts.push(`Date: ${raw.slice(0, 19).replace('T', ' ')}`);
  }
  if (markup.customFields?.sigReason) parts.push(`Reason: ${markup.customFields.sigReason}`);
  if (markup.customFields?.sigLocation) parts.push(`Location: ${markup.customFields.sigLocation}`);
  return { headline, details: parts.join(' · ') };
}

/** Texto visible del campo: valor, opción elegida o rótulo del botón. */
export function fieldDisplayText(markup: Markup): string {
  const v = markup.customFields?.fieldValue;
  switch (fieldTypeOf(markup)) {
    case 'text':
    case 'dropdown':
    case 'listbox':
      return typeof v === 'string' ? v : '';
    case 'button':
      return typeof markup.customFields?.buttonCaption === 'string' ? markup.customFields.buttonCaption : 'Button';
    case 'signature': {
      const sig = signatureDisplayLines(markup);
      return sig ? sig.headline : 'Sign here';
    }
    default:
      return '';
  }
}

