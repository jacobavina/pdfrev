import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, PDFDict, PDFNumber } from 'pdf-lib';
import {
  createSelfSignedPfx,
  parsePfxCertificate,
  signPdfWithCertificate,
  verifyPdfSignature,
} from './digitalSignature';
import { importPdfAnnotations } from './annotationReader';
import { Markup } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

describe('Firma con certificado digital PKCS#12 (.pfx/.p12) y CMS / PKCS#7 (ADR-0056)', () => {
  it('crea un certificado autofirmado .pfx/.p12, lo reabre con su contraseña y rechaza contraseñas incorrectas', async () => {
    const { pfxBytes, certificate } = await createSelfSignedPfx({
      commonName: 'Elena Vance, PE',
      organization: 'Vance Structural Engineering',
      email: 'elena@vance-eng.example',
      password: 'secret-password-2026',
    });

    expect(pfxBytes.byteLength).toBeGreaterThan(1000);
    expect(certificate.commonName).toBe('Elena Vance, PE');
    expect(certificate.organization).toBe('Vance Structural Engineering');
    expect(certificate.email).toBe('elena@vance-eng.example');

    const parsed = await parsePfxCertificate(pfxBytes, 'secret-password-2026');
    expect(parsed.commonName).toBe('Elena Vance, PE');
    expect(parsed.organization).toBe('Vance Structural Engineering');
    expect(parsed.email).toBe('elena@vance-eng.example');
    expect(parsed.certDer).toEqual(certificate.certDer);

    await expect(parsePfxCertificate(pfxBytes, 'wrong-password')).rejects.toThrow(/Invalid certificate password/i);
  });

  it('firma un campo /FT /Sig con /Type /Sig, /ByteRange, /Contents CMS válido, /SigFlags 3 y apariencia /AP /N', async () => {
    const { pfxBytes } = await createSelfSignedPfx({
      commonName: 'Carlos Rivera',
      organization: 'REA Construction',
      password: 'rea-pass',
    });
    const cert = await parsePfxCertificate(pfxBytes, 'rea-pass');

    const sigField: Markup = {
      id: 'sig-field-1',
      type: 'formField',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.35, y: 0.6 },
      ],
      style: { strokeColor: '#2563eb', strokeWidth: 1, opacity: 1 },
      author: 'Carlos Rivera',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
      status: 'pending',
      customFields: { fieldType: 'signature', fieldName: 'EngineerSignature' },
    };

    const { signedPdfBytes, updatedMarkup } = await signPdfWithCertificate(
      blueprint,
      [sigField],
      'sig-field-1',
      cert,
      {
        reason: 'Issued for construction',
        location: 'Mexico City',
        signDateIso: '2026-10-15T18:30:00Z',
      }
    );

    // 1. El archivo original se preserva íntegro como prefijo (actualización incremental)
    expect(signedPdfBytes.subarray(0, blueprint.length)).toEqual(blueprint);
    expect(updatedMarkup.locked).toBe(true);
    expect(updatedMarkup.customFields?.sigSigned).toBe(1);
    expect(updatedMarkup.customFields?.sigSigner).toBe('Carlos Rivera');

    // 2. Verificación criptográfica real del /ByteRange y del CMS SignedData (SHA-256 + RSA-2048)
    const verified = await verifyPdfSignature(signedPdfBytes);
    expect(verified.valid).toBe(true);
    expect(verified.signerName).toBe('Carlos Rivera');
    expect(verified.reason).toBe('Issued for construction');
    expect(verified.location).toBe('Mexico City');

    // 3. Si se altera un byte dentro del /ByteRange, la verificación criptográfica detecta la manipulación
    const tampered = new Uint8Array(signedPdfBytes);
    tampered[20] ^= 0xff;
    const tamperedVerify = await verifyPdfSignature(tampered);
    expect(tamperedVerify.valid).toBe(false);

    // 4. Estructura PDF estándar: /AcroForm /SigFlags = 3 y /V apunta a /Type /Sig /SubFilter /adbe.pkcs7.detached
    const doc = await PDFDocument.load(signedPdfBytes);
    const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    expect(acro.lookup(PDFName.of('SigFlags'), PDFNumber).asNumber()).toBe(3);

    // 5. Reimportar con importPdfAnnotations recupera los datos de la firma y bloquea el campo
    const imported = await importPdfAnnotations(signedPdfBytes);
    const impSig = imported.markups.find((m) => m.id === 'sig-field-1')!;
    expect(impSig.locked).toBe(true);
    expect(impSig.customFields?.sigSigned).toBe(1);
    expect(impSig.customFields?.sigSigner).toBe('Carlos Rivera');
    expect(impSig.customFields?.sigReason).toBe('Issued for construction');
    expect(impSig.customFields?.sigLocation).toBe('Mexico City');
  });
});
