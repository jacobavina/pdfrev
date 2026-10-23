import { describe, it, expect } from 'vitest';
import { readSignatureText } from './digitalSignature';

const utf16Hex = (text: string) => 'FEFF' + [...text].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');

describe('Texto del motivo y del lugar de una firma (ADR-0122)', () => {
  it('lee el literal entre paréntesis', () => {
    expect(readSignatureText('<< /Reason (Emitido para obra) /Location (Lima) >>', 'Reason')).toBe('Emitido para obra');
    expect(readSignatureText('<< /Reason (Emitido para obra) /Location (Lima) >>', 'Location')).toBe('Lima');
  });

  it('lee el hexadecimal UTF-16 con acentos', () => {
    const raw = `<< /Location <${utf16Hex('Ciudad de México')}> >>`;
    expect(readSignatureText(raw, 'Location')).toBe('Ciudad de México');
  });

  it('lee un hexadecimal sin BOM como texto de un byte por carácter y admite espacios', () => {
    expect(readSignatureText('/Reason <48 6F 6C 61>', 'Reason')).toBe('Hola');
  });

  it('devuelve undefined si la clave no está', () => {
    expect(readSignatureText('<< /Name (Ana) >>', 'Reason')).toBeUndefined();
  });
});
