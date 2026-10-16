import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createHash, createHmac } from 'crypto';
import { PDFDocument, PDFName, PDFDict, PDFNumber, PDFArray, PDFRef, PDFString } from 'pdf-lib';
import {
  createSelfSignedPfx,
  parsePfxCertificate,
  readDerChildren,
  readDerNode,
  signPdfWithCertificate,
  verifyPdfSignature,
} from './digitalSignature';
import { importPdfAnnotations } from './annotationReader';
import { annotationKeyFor, concatUint8Arrays, saveIncrementalMarkups } from './incrementalWriter';
import { bmpPassword, pkcs12Kdf } from './pkcs12Ciphers';
import {
  OPENSSL_PFX_3DES,
  OPENSSL_PFX_AES_WITH_CHAIN,
  OPENSSL_PFX_CERT_SHA256,
  OPENSSL_PFX_LEGACY_RC2_3DES,
} from './testdata/opensslPfx';
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
    expect(verified.coversWholeDocument).toBe(true);

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

const fromB64 = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

function sigFieldMarkup(id: string, fieldName: string): Markup {
  return {
    id,
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
    customFields: { fieldType: 'signature', fieldName },
  };
}

/** Anotación de la página 0 cuya clave (/NM o referencia) es `key`, con su referencia. */
function findAnnot(doc: PDFDocument, key: string): { ref: PDFRef; dict: PDFDict } | undefined {
  const annots = doc.getPages()[0].node.Annots();
  if (!(annots instanceof PDFArray)) return undefined;
  for (let i = 0; i < annots.size(); i++) {
    const item = annots.get(i);
    const dict = doc.context.lookup(item);
    if (item instanceof PDFRef && dict instanceof PDFDict && annotationKeyFor(dict, item) === key) return { ref: item, dict };
  }
  return undefined;
}

function rectOf(dict: PDFDict): number[] {
  return dict.lookup(PDFName.of('Rect'), PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
}

describe('Firma digital: volver a guardar y .pfx de otras herramientas (ADR-0058)', () => {
  it('volver a guardar un PDF firmado con otra marca conserva el widget firmado con su objeto y /V, y la firma sigue válida', async () => {
    const { pfxBytes } = await createSelfSignedPfx({ commonName: 'Carlos Rivera', password: 'rea-pass' });
    const cert = await parsePfxCertificate(pfxBytes, 'rea-pass');
    const { signedPdfBytes, updatedMarkup } = await signPdfWithCertificate(
      blueprint,
      [sigFieldMarkup('sig-field-1', 'EngineerSignature')],
      'sig-field-1',
      cert,
      { reason: 'Issued for construction', signDateIso: '2026-10-15T18:30:00Z' }
    );
    const signedDoc = await PDFDocument.load(signedPdfBytes);
    const signedWidget = findAnnot(signedDoc, 'sig-field-1')!;
    const signedRect = rectOf(signedWidget.dict);

    // La marca sigue en el modelo y se intenta mover y recolorear: está bloqueada y se ignora
    const movedSig: Markup = {
      ...updatedMarkup,
      points: [
        { x: 0.4, y: 0.2 },
        { x: 0.6, y: 0.3 },
      ],
      style: { ...updatedMarkup.style, strokeColor: '#ff0000' },
    };
    const rect: Markup = {
      id: 'rect-after-sign',
      type: 'rectangle',
      pageIndex: 0,
      points: [
        { x: 0.5, y: 0.2 },
        { x: 0.7, y: 0.3 },
      ],
      style: { strokeColor: '#16a34a', strokeWidth: 2, opacity: 1 },
      author: 'Carlos Rivera',
      createdAt: '2026-10-16T09:00:00Z',
      updatedAt: '2026-10-16T09:00:00Z',
      status: 'pending',
    };
    const resaved = await saveIncrementalMarkups(signedPdfBytes, [movedSig, rect], {}, { importedIds: ['sig-field-1'] });

    // 1. Revisión incremental: los bytes firmados quedan intactos y el widget no se reescribe en la nueva revisión
    expect(resaved.subarray(0, signedPdfBytes.length)).toEqual(signedPdfBytes);
    const tail = latin1(resaved.subarray(signedPdfBytes.length));
    expect(tail).toMatch(/\/NM \(rect-after-sign\)/);
    expect(tail).not.toMatch(new RegExp(`(^|\\n)${signedWidget.ref.objectNumber} 0 obj`));

    // 2. La primera firma sigue validando (cubre su revisión, no las posteriores)
    const verified = await verifyPdfSignature(resaved);
    expect(verified.valid).toBe(true);
    expect(verified.coversWholeDocument).toBe(false);
    expect(verified.signerName).toBe('Carlos Rivera');
    expect(verified.byteRange[2] + verified.byteRange[3]).toBe(signedPdfBytes.length);

    // 3. El widget es el mismo objeto, con su /V /Type /Sig, su /Rect original y sigue en /AcroForm /Fields
    const doc = await PDFDocument.load(resaved);
    const widget = findAnnot(doc, 'sig-field-1')!;
    expect(widget.ref.objectNumber).toBe(signedWidget.ref.objectNumber);
    const v = widget.dict.lookup(PDFName.of('V'));
    expect(v).toBeInstanceOf(PDFDict);
    expect((v as PDFDict).get(PDFName.of('Type'))?.toString()).toBe('/Sig');
    expect(rectOf(widget.dict)).toEqual(signedRect);
    const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    const fieldNums = acro.lookup(PDFName.of('Fields'), PDFArray).asArray().map((r) => (r as PDFRef).objectNumber);
    expect(fieldNums).toContain(signedWidget.ref.objectNumber);
    expect(acro.lookup(PDFName.of('SigFlags'), PDFNumber).asNumber()).toBe(3);
    expect(findAnnot(doc, 'rect-after-sign')).toBeDefined();

    // 4. Un tercer guardado tampoco la rompe, y al reabrir el campo sigue firmado y aparece una sola vez
    const third = await saveIncrementalMarkups(resaved, [movedSig, rect], {}, { importedIds: ['sig-field-1', 'rect-after-sign'] });
    expect((await verifyPdfSignature(third)).valid).toBe(true);
    const imported = await importPdfAnnotations(third);
    const sigs = imported.markups.filter((m) => m.id === 'sig-field-1');
    expect(sigs).toHaveLength(1);
    expect(sigs[0].customFields?.sigSigned).toBe(1);
    expect(sigs[0].locked).toBe(true);
    expect(imported.markups.filter((m) => m.id === 'rect-after-sign')).toHaveLength(1);

    // 5. Firmar otra vez el mismo campo se rechaza en lugar de pisar la firma
    await expect(signPdfWithCertificate(third, [movedSig, rect], 'sig-field-1', cert)).rejects.toThrow(/already signed/);
  });

  it('un campo de firma firmado en otra aplicación (sin /REA) se conserva tal cual al guardar desde REA', async () => {
    const doc = await PDFDocument.load(blueprint);
    const ctx = doc.context;
    const page = doc.getPages()[0];
    const sigRef = ctx.register(
      ctx.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached', Name: PDFString.of('Otro Firmante') })
    );
    const widgetRef = ctx.register(
      ctx.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        T: PDFString.of('ForeignSignature'),
        Rect: [50, 50, 250, 100],
        F: 4,
        P: page.ref,
        V: sigRef,
      })
    );
    page.node.set(PDFName.of('Annots'), ctx.obj([widgetRef]));
    doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [widgetRef], SigFlags: 3 }));
    const bytes = await doc.save({ useObjectStreams: false });

    const imported = await importPdfAnnotations(bytes);
    const sig = imported.markups.find((m) => m.customFields?.fieldType === 'signature')!;
    expect(sig.customFields?.sigSigned).toBe(1);
    const moved: Markup = { ...sig, points: sig.points.map((p) => ({ x: p.x + 0.1, y: p.y + 0.1 })) };
    const saved = await saveIncrementalMarkups(bytes, [moved], {}, { importedIds: imported.markups.map((m) => m.id) });

    expect(latin1(saved.subarray(bytes.length))).not.toMatch(new RegExp(`(^|\\n)${widgetRef.objectNumber} 0 obj`));
    const out = await PDFDocument.load(saved);
    const widget = findAnnot(out, sig.id)!;
    expect(widget.ref.objectNumber).toBe(widgetRef.objectNumber);
    expect(widget.dict.get(PDFName.of('REA'))).toBeUndefined();
    expect(widget.dict.lookup(PDFName.of('V'))).toBeInstanceOf(PDFDict);
    expect(rectOf(widget.dict)).toEqual([50, 50, 250, 100]);
    const fields = out.catalog.lookup(PDFName.of('AcroForm'), PDFDict).lookup(PDFName.of('Fields'), PDFArray);
    expect(fields.asArray().map((r) => (r as PDFRef).objectNumber)).toContain(widgetRef.objectNumber);
  });

  it('abre los .pfx de OpenSSL: RC2-40 y 3DES con MAC SHA-1, solo 3DES, y PBES2/AES-256 en encryptedData con MAC SHA-256 y cadena de CA', async () => {
    for (const b64 of [OPENSSL_PFX_LEGACY_RC2_3DES, OPENSSL_PFX_3DES, OPENSSL_PFX_AES_WITH_CHAIN]) {
      const pfx = fromB64(b64);
      const parsed = await parsePfxCertificate(pfx, 'rea-test');
      expect(parsed.commonName).toBe('Ana Torres');
      expect(parsed.organization).toBe('Torres Ingenieria');
      // El certificado del firmante (no el de la CA), comparado con la huella que da OpenSSL
      expect(sha256Hex(parsed.certDer)).toBe(OPENSSL_PFX_CERT_SHA256);
      await expect(parsePfxCertificate(pfx, 'wrong-password')).rejects.toThrow(/Invalid certificate password/i);
    }

    // La clave descifrada firma de verdad: la firma del PDF valida con el certificado embebido
    const cert = await parsePfxCertificate(fromB64(OPENSSL_PFX_LEGACY_RC2_3DES), 'rea-test');
    const { signedPdfBytes } = await signPdfWithCertificate(
      blueprint,
      [sigFieldMarkup('sig-openssl', 'ContractorSignature')],
      'sig-openssl',
      cert,
      { signDateIso: '2026-10-16T12:00:00Z' }
    );
    const verified = await verifyPdfSignature(signedPdfBytes);
    expect(verified.valid).toBe(true);
    expect(verified.signerName).toBe('Ana Torres');
  });

  it('abre un .pfx codificado en BER, con longitudes indefinidas y el AuthenticatedSafe en OCTET STRING por trozos', async () => {
    const der = fromB64(OPENSSL_PFX_AES_WITH_CHAIN);
    const [version, authSafeInfo, macData] = readDerChildren(readDerNode(der));
    const [oid, explicit] = readDerChildren(authSafeInfo);
    const octets = readDerNode(explicit.value).value;
    const tlv = (tag: number, content: Uint8Array) => {
      const len = content.length;
      const head = len < 0x80 ? [tag, len] : len < 0x100 ? [tag, 0x81, len] : [tag, 0x82, len >> 8, len & 0xff];
      return concatUint8Arrays([new Uint8Array(head), content]);
    };
    const indefinite = (tag: number, ...parts: Uint8Array[]) =>
      concatUint8Arrays([new Uint8Array([tag, 0x80]), ...parts, new Uint8Array([0, 0])]);
    const half = Math.floor(octets.length / 2);
    const chunked = indefinite(0x24, tlv(0x04, octets.subarray(0, half)), tlv(0x04, octets.subarray(half)));
    const ber = indefinite(0x30, version.raw, indefinite(0x30, oid.raw, indefinite(0xa0, chunked)), macData.raw);
    expect(ber[1]).toBe(0x80);

    const parsed = await parsePfxCertificate(ber, 'rea-test');
    expect(sha256Hex(parsed.certDer)).toBe(OPENSSL_PFX_CERT_SHA256);
  });

  it('el .pfx que crea REA lleva macData HMAC-SHA256 y localKeyId; un byte alterado se rechaza y los .pfx sin MAC siguen abriendo', async () => {
    const { pfxBytes } = await createSelfSignedPfx({ commonName: 'Lucía Peña', password: 'contraseña-ñ' });
    const kids = readDerChildren(readDerNode(pfxBytes));
    expect(kids).toHaveLength(3);

    // macData = { DigestInfo { sha256, mac }, salt, 2048 }; el MAC se recalcula con HMAC de node:crypto
    const [digestInfo, salt, iterations] = readDerChildren(kids[2]);
    const [algId, mac] = readDerChildren(digestInfo);
    expect(toHex(readDerChildren(algId)[0].raw)).toBe('0609608648016503040201');
    expect(toHex(iterations.value)).toBe('0800');
    const authSafeOctets = readDerNode(readDerChildren(kids[1])[1].value).value;
    const macKey = await pkcs12Kdf('SHA-256', bmpPassword('contraseña-ñ'), salt.value, 2048, 3, 32);
    expect(toHex(mac.value)).toBe(createHmac('sha256', macKey).update(authSafeOctets).digest('hex'));

    // localKeyId (1.2.840.113549.1.9.21) en el bolso del certificado y en el de la clave
    expect(toHex(pfxBytes).split('06092a864886f70d010915').length - 1).toBe(2);

    expect((await parsePfxCertificate(pfxBytes, 'contraseña-ñ')).commonName).toBe('Lucía Peña');
    await expect(parsePfxCertificate(pfxBytes, 'contrasena-n')).rejects.toThrow(/MAC verification failed/);

    // Un byte alterado dentro del AuthenticatedSafe (en el certificado, que va sin cifrar) lo detecta el MAC
    const tampered = new Uint8Array(pfxBytes);
    tampered[authSafeOctets.byteOffset - pfxBytes.byteOffset + 100] ^= 0x01;
    await expect(parsePfxCertificate(tampered, 'contraseña-ñ')).rejects.toThrow(/MAC verification failed/);

    // Compatibilidad: un .pfx sin macData (como los de ADR-0056) sigue abriendo
    const withoutMac = concatUint8Arrays([new Uint8Array([0x30, 0x82, 0, 0]), kids[0].raw, kids[1].raw]);
    const len = withoutMac.length - 4;
    withoutMac[2] = len >> 8;
    withoutMac[3] = len & 0xff;
    expect((await parsePfxCertificate(withoutMac, 'contraseña-ñ')).commonName).toBe('Lucía Peña');
  });
});
