import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFNumber } from 'pdf-lib';
import { Markup } from '../../types/markup';
import {
  IncrementalWriter,
  IncrementalSaveOptions,
  saveIncrementalMarkups,
  annotationKeyFor,
  escapePdfString,
  formatPdfDate,
  concatUint8Arrays,
} from './incrementalWriter';
import { PageTransformInfo } from './operators';

/**
 * Firma digital de PDF con certificado X.509 / PKCS#12 (.pfx / .p12) y contenedor CMS / PKCS#7
 * (/Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached, ISO 32000-1 §12.8).
 * Implementado íntegramente sobre WebCrypto (crypto.subtle) sin dependencias externas.
 */

export interface SelfSignedCertOptions {
  commonName: string;
  organization?: string;
  email?: string;
  password: string;
  validityDays?: number;
}

export interface ParsedCertificate {
  commonName: string;
  organization?: string;
  email?: string;
  notBefore: string;
  notAfter: string;
  certDer: Uint8Array;
  issuerDer: Uint8Array;
  serialDer: Uint8Array;
  spkiDer: Uint8Array;
  privateKey: CryptoKey;
}

export interface SignatureMetadata {
  reason?: string;
  location?: string;
  contactInfo?: string;
  signDateIso?: string;
}

export interface VerifiedPdfSignature {
  valid: boolean;
  signerName: string;
  reason?: string;
  location?: string;
  byteRange: [number, number, number, number];
}

// --- Codificador y lector ASN.1 DER mínimo ---

function derLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function derTag(tag: number, content: Uint8Array): Uint8Array {
  return concatUint8Arrays([new Uint8Array([tag]), derLength(content.length), content]);
}

function derSequence(...items: Uint8Array[]): Uint8Array {
  return derTag(0x30, concatUint8Arrays(items));
}

function derSet(...items: Uint8Array[]): Uint8Array {
  return derTag(0x31, concatUint8Arrays(items));
}

function derOctetString(bytes: Uint8Array): Uint8Array {
  return derTag(0x04, bytes);
}

function derBitString(bytes: Uint8Array, unusedBits = 0): Uint8Array {
  return derTag(0x03, concatUint8Arrays([new Uint8Array([unusedBits]), bytes]));
}

function derNull(): Uint8Array {
  return new Uint8Array([0x05, 0x00]);
}

function derIntegerFromNumber(n: number): Uint8Array {
  if (n === 0) return derTag(0x02, new Uint8Array([0]));
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  if ((bytes[0] & 0x80) !== 0) bytes.unshift(0x00);
  return derTag(0x02, new Uint8Array(bytes));
}

function derIntegerFromBytes(raw: Uint8Array): Uint8Array {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0 && (raw[start + 1] & 0x80) === 0) {
    start++;
  }
  const trimmed = raw.subarray(start);
  const body = (trimmed[0] & 0x80) !== 0 ? concatUint8Arrays([new Uint8Array([0x00]), trimmed]) : trimmed;
  return derTag(0x02, body);
}

function derOid(dotOid: string): Uint8Array {
  const parts = dotOid.split('.').map((s) => parseInt(s, 10));
  if (parts.length < 2) throw new Error(`Invalid OID: ${dotOid}`);
  const out: number[] = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    if (v === 0) {
      out.push(0);
      continue;
    }
    const base128: number[] = [];
    while (v > 0) {
      base128.unshift(v & 0x7f);
      v = Math.floor(v / 128);
    }
    for (let j = 0; j < base128.length - 1; j++) {
      out.push(base128[j] | 0x80);
    }
    out.push(base128[base128.length - 1]);
  }
  return derTag(0x06, new Uint8Array(out));
}

function derUtf8String(str: string): Uint8Array {
  return derTag(0x0c, new TextEncoder().encode(str));
}

function derIA5String(str: string): Uint8Array {
  return derTag(0x16, new TextEncoder().encode(str));
}

function derUtcTime(date: Date): Uint8Array {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yy = pad(date.getUTCFullYear() % 100);
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return derTag(0x17, new TextEncoder().encode(`${yy}${mm}${dd}${hh}${min}${ss}Z`));
}

export interface DerNode {
  tag: number;
  headerOffset: number;
  valueOffset: number;
  length: number;
  totalLength: number;
  raw: Uint8Array;
  value: Uint8Array;
}

export function readDerNode(buf: Uint8Array, offset = 0): DerNode {
  if (offset >= buf.length) throw new Error('ASN.1 DER unexpected EOF');
  const tag = buf[offset];
  let idx = offset + 1;
  if (idx >= buf.length) throw new Error('ASN.1 DER truncated length');
  const firstLen = buf[idx++];
  let length = 0;
  if ((firstLen & 0x80) === 0) {
    length = firstLen;
  } else {
    const numBytes = firstLen & 0x7f;
    if (numBytes === 0 || numBytes > 4 || idx + numBytes > buf.length) {
      throw new Error('ASN.1 DER invalid length byte count');
    }
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | buf[idx++];
    }
  }
  const valueOffset = idx;
  const end = valueOffset + length;
  if (end > buf.length) throw new Error('ASN.1 DER value exceeds buffer');
  return {
    tag,
    headerOffset: offset,
    valueOffset,
    length,
    totalLength: end - offset,
    raw: buf.subarray(offset, end),
    value: buf.subarray(valueOffset, end),
  };
}

export function readDerChildren(node: DerNode): DerNode[] {
  const children: DerNode[] = [];
  let pos = 0;
  while (pos < node.value.length) {
    const child = readDerNode(node.value, pos);
    children.push(child);
    pos += child.totalLength;
  }
  return children;
}

function decodeDerOid(oidValue: Uint8Array): string {
  if (oidValue.length === 0) return '';
  const first = oidValue[0];
  const firstArc = Math.min(2, Math.floor(first / 40));
  const secondArc = first - firstArc * 40;
  const parts: number[] = [firstArc, secondArc];
  let cur = 0;
  for (let i = 1; i < oidValue.length; i++) {
    cur = cur * 128 + (oidValue[i] & 0x7f);
    if ((oidValue[i] & 0x80) === 0) {
      parts.push(cur);
      cur = 0;
    }
  }
  return parts.join('.');
}

function decodeDerString(node: DerNode): string {
  if (node.tag === 0x1e) {
    // BMPString (UTF-16BE)
    let out = '';
    for (let i = 0; i + 1 < node.value.length; i += 2) {
      out += String.fromCharCode((node.value[i] << 8) | node.value[i + 1]);
    }
    return out;
  }
  return new TextDecoder('utf-8').decode(node.value);
}

// OIDs estándar
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const OID_SHA256_WITH_RSA = '1.2.840.113549.1.1.11';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_COMMON_NAME = '2.5.4.3';
const OID_ORGANIZATION = '2.5.4.10';
const OID_EMAIL = '1.2.840.113549.1.9.1';
const OID_BASIC_CONSTRAINTS = '2.5.29.19';
const OID_KEY_USAGE = '2.5.29.15';
const OID_PKCS7_DATA = '1.2.840.113549.1.7.1';
const OID_PKCS7_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
const OID_KEY_BAG = '1.2.840.113549.1.12.10.1.1';
const OID_PKCS8_SHROUDED_KEY_BAG = '1.2.840.113549.1.12.10.1.2';
const OID_CERT_BAG = '1.2.840.113549.1.12.10.1.3';
const OID_X509_CERTIFICATE = '1.2.840.113549.1.9.22.1';
const OID_PBES2 = '1.2.840.113549.1.5.13';
const OID_PBKDF2 = '1.2.840.113549.1.5.12';
const OID_HMAC_WITH_SHA256 = '1.2.840.113549.2.9';
const OID_AES256_CBC = '2.16.840.1.101.3.4.1.42';
const OID_AES128_CBC = '2.16.840.1.101.3.4.1.2';

function buildX509Name(commonName: string, organization?: string, email?: string): Uint8Array {
  const rdns: Uint8Array[] = [
    derSet(derSequence(derOid(OID_COMMON_NAME), derUtf8String(commonName.trim() || 'REA Signer'))),
  ];
  if (organization && organization.trim()) {
    rdns.push(derSet(derSequence(derOid(OID_ORGANIZATION), derUtf8String(organization.trim()))));
  }
  if (email && email.trim()) {
    rdns.push(derSet(derSequence(derOid(OID_EMAIL), derIA5String(email.trim()))));
  }
  return derSequence(...rdns);
}

/**
 * Cifra un bloque PKCS#8 con PBES2 (PBKDF2-HMAC-SHA256 + AES-256-CBC) usando WebCrypto.
 */
async function encryptPkcs8Pbes2(pkcs8Der: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 10000;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['encrypt']
  );
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, pkcs8Der as BufferSource);
  const cipherBytes = new Uint8Array(cipherBuf);

  const pbkdf2Params = derSequence(
    derOctetString(salt),
    derIntegerFromNumber(iterations),
    derSequence(derOid(OID_HMAC_WITH_SHA256), derNull())
  );
  const kdfAlg = derSequence(derOid(OID_PBKDF2), pbkdf2Params);
  const encScheme = derSequence(derOid(OID_AES256_CBC), derOctetString(iv));
  const pbes2Params = derSequence(kdfAlg, encScheme);
  const encAlgId = derSequence(derOid(OID_PBES2), pbes2Params);

  return derSequence(encAlgId, derOctetString(cipherBytes));
}

/**
 * Descifra un EncryptedPrivateKeyInfo PBES2 (PBKDF2 + AES-128/256-CBC) usando WebCrypto.
 */
async function decryptEncryptedPrivateKeyInfo(encKeyInfoDer: Uint8Array, password: string): Promise<Uint8Array> {
  const top = readDerNode(encKeyInfoDer);
  const topKids = readDerChildren(top);
  if (topKids.length < 2) throw new Error('Malformed EncryptedPrivateKeyInfo');
  const algSeq = readDerChildren(topKids[0]);
  const algOid = decodeDerOid(algSeq[0].value);
  const encryptedBytes = topKids[1].value;

  if (algOid !== OID_PBES2 || algSeq.length < 2) {
    throw new Error(`Unsupported private key encryption OID: ${algOid}`);
  }
  const pbes2Kids = readDerChildren(algSeq[1]);
  const kdfKids = readDerChildren(pbes2Kids[0]);
  const encKids = readDerChildren(pbes2Kids[1]);
  const kdfOid = decodeDerOid(kdfKids[0].value);
  if (kdfOid !== OID_PBKDF2) throw new Error(`Unsupported KDF OID: ${kdfOid}`);

  const pbkdf2Params = readDerChildren(kdfKids[1]);
  const salt = pbkdf2Params[0].value;
  let iterations = 0;
  for (const b of pbkdf2Params[1].value) iterations = (iterations << 8) | b;

  let hashName: 'SHA-256' | 'SHA-1' = 'SHA-256';
  for (let i = 2; i < pbkdf2Params.length; i++) {
    if (pbkdf2Params[i].tag === 0x30) {
      const prfKids = readDerChildren(pbkdf2Params[i]);
      if (prfKids.length > 0 && decodeDerOid(prfKids[0].value) !== OID_HMAC_WITH_SHA256) {
        hashName = 'SHA-1';
      }
    }
  }

  const cipherOid = decodeDerOid(encKids[0].value);
  const keyBits = cipherOid === OID_AES128_CBC ? 128 : 256;
  const iv = encKids[1].value;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: hashName },
    baseKey,
    { name: 'AES-CBC', length: keyBits },
    false,
    ['decrypt']
  );
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv as BufferSource },
      aesKey,
      encryptedBytes as BufferSource
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error('Invalid certificate password or corrupted PFX file');
  }
}

/**
 * Extrae metadatos del certificado X.509 DER y lo vincula con su clave privada WebCrypto.
 */
export function parseX509CertificateDer(certDer: Uint8Array, privateKey: CryptoKey): ParsedCertificate {
  const certSeq = readDerNode(certDer);
  const certKids = readDerChildren(certSeq);
  if (certKids.length < 1) throw new Error('Invalid X.509 certificate');

  const tbs = certKids[0];
  const tbsKids = readDerChildren(tbs);
  let idx = 0;
  if (tbsKids[0].tag === 0xa0) idx = 1; // [0] EXPLICIT version
  const serialDer = tbsKids[idx].raw;
  const issuerDer = tbsKids[idx + 2].raw;
  const validityNode = tbsKids[idx + 3];
  const subjectNode = tbsKids[idx + 4];
  const spkiDer = tbsKids[idx + 5].raw;

  const validityKids = readDerChildren(validityNode);
  const notBefore = validityKids[0] ? decodeDerString(validityKids[0]) : '';
  const notAfter = validityKids[1] ? decodeDerString(validityKids[1]) : '';

  let commonName = '';
  let organization: string | undefined;
  let email: string | undefined;
  for (const rdn of readDerChildren(subjectNode)) {
    for (const atv of readDerChildren(rdn)) {
      const pair = readDerChildren(atv);
      if (pair.length >= 2 && pair[0].tag === 0x06) {
        const oid = decodeDerOid(pair[0].value);
        const val = decodeDerString(pair[1]);
        if (oid === OID_COMMON_NAME) commonName = val;
        else if (oid === OID_ORGANIZATION) organization = val;
        else if (oid === OID_EMAIL) email = val;
      }
    }
  }

  return {
    commonName: commonName || 'Digital Signer',
    organization,
    email,
    notBefore,
    notAfter,
    certDer: certSeq.raw,
    issuerDer,
    serialDer,
    spkiDer,
    privateKey,
  };
}

/**
 * Genera un par RSA-2048 SHA-256, construye un certificado X.509 v3 autofirmado y lo empaqueta en un
 * archivo PKCS#12 (.pfx / .p12) cifrado con PBES2 y la contraseña dada.
 */
export async function createSelfSignedPfx(
  opts: SelfSignedCertOptions
): Promise<{ pfxBytes: Uint8Array; certificate: ParsedCertificate }> {
  if (!opts.commonName.trim()) {
    throw new Error('Common Name (signer name) is required');
  }
  if (!opts.password) {
    throw new Error('Certificate password is required');
  }

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const spkiDer = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  const pkcs8Der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));

  const serialBytes = crypto.getRandomValues(new Uint8Array(8));
  serialBytes[0] &= 0x7f;
  if (serialBytes[0] === 0) serialBytes[0] = 1;

  const now = new Date();
  const notBeforeDate = new Date(now.getTime() - 60_000);
  const days = opts.validityDays ?? 365 * 5;
  const notAfterDate = new Date(now.getTime() + days * 86_400_000);

  const nameDer = buildX509Name(opts.commonName, opts.organization, opts.email);
  const sigAlgDer = derSequence(derOid(OID_SHA256_WITH_RSA), derNull());

  // Extensiones X.509 v3: BasicConstraints (CA=false) y KeyUsage (digitalSignature | nonRepudiation)
  const extBasicConstraints = derSequence(derOid(OID_BASIC_CONSTRAINTS), derOctetString(derSequence()));
  const extKeyUsage = derSequence(
    derOid(OID_KEY_USAGE),
    derTag(0x01, new Uint8Array([0xff])), // critical = TRUE
    derOctetString(derBitString(new Uint8Array([0xc0]), 6))
  );
  const extensionsExplicit = derTag(0xa3, derSequence(extBasicConstraints, extKeyUsage));

  const tbsCertificate = derSequence(
    derTag(0xa0, derIntegerFromNumber(2)), // v3
    derIntegerFromBytes(serialBytes),
    sigAlgDer,
    nameDer,
    derSequence(derUtcTime(notBeforeDate), derUtcTime(notAfterDate)),
    nameDer,
    spkiDer,
    extensionsExplicit
  );

  const certSigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    tbsCertificate as BufferSource
  );
  const certDer = derSequence(tbsCertificate, sigAlgDer, derBitString(new Uint8Array(certSigBuf)));

  // Construir contenedor PKCS#12 (PFX v3, RFC 7292)
  const encryptedKeyInfo = await encryptPkcs8Pbes2(pkcs8Der, opts.password);
  const shroudedKeyBag = derSequence(derOid(OID_PKCS8_SHROUDED_KEY_BAG), derTag(0xa0, encryptedKeyInfo));

  const x509CertBagValue = derSequence(derOid(OID_X509_CERTIFICATE), derTag(0xa0, derOctetString(certDer)));
  const certBag = derSequence(derOid(OID_CERT_BAG), derTag(0xa0, x509CertBagValue));

  const safeContents = derSequence(certBag, shroudedKeyBag);
  const dataContentInfo = derSequence(derOid(OID_PKCS7_DATA), derTag(0xa0, derOctetString(safeContents)));
  const authSafeBytes = derSequence(dataContentInfo);
  const authSafeContentInfo = derSequence(derOid(OID_PKCS7_DATA), derTag(0xa0, derOctetString(authSafeBytes)));

  const pfxBytes = derSequence(derIntegerFromNumber(3), authSafeContentInfo);
  const certificate = parseX509CertificateDer(certDer, keyPair.privateKey);

  return { pfxBytes, certificate };
}

/**
 * Lee un archivo PKCS#12 (.pfx / .p12) con su contraseña y devuelve el certificado X.509 y su clave privada.
 */
export async function parsePfxCertificate(pfxBytes: Uint8Array, password: string): Promise<ParsedCertificate> {
  let root: DerNode;
  try {
    root = readDerNode(pfxBytes);
  } catch {
    throw new Error('Invalid PFX/P12 file: not a valid ASN.1 DER structure');
  }
  if (root.tag !== 0x30) {
    throw new Error('Invalid PFX/P12 file: expected ASN.1 SEQUENCE');
  }

  let foundCertDer: Uint8Array | null = null;
  let foundEncryptedKeyDer: Uint8Array | null = null;
  let foundPlainKeyDer: Uint8Array | null = null;

  const walk = (node: DerNode): void => {
    const isConstructed = (node.tag & 0x20) !== 0;
    if (isConstructed) {
      let children: DerNode[] = [];
      try {
        children = readDerChildren(node);
      } catch {
        return;
      }
      if (node.tag === 0x30 && children.length >= 2 && children[0].tag === 0x06) {
        const oid = decodeDerOid(children[0].value);
        if (oid === OID_X509_CERTIFICATE && children[1].tag === 0xa0) {
          const inner = readDerNode(children[1].value);
          if (inner.tag === 0x04) foundCertDer = inner.value;
        } else if (oid === OID_PKCS8_SHROUDED_KEY_BAG && children[1].tag === 0xa0) {
          foundEncryptedKeyDer = children[1].value;
        } else if (oid === OID_KEY_BAG && children[1].tag === 0xa0) {
          foundPlainKeyDer = children[1].value;
        }
      }
      for (const child of children) walk(child);
    } else if (node.tag === 0x04 && node.value.length >= 4 && (node.value[0] === 0x30 || node.value[0] === 0x04)) {
      try {
        const inner = readDerNode(node.value);
        if (inner.totalLength === node.value.length) walk(inner);
      } catch {
        // No es un nodo ASN.1 anidado
      }
    }
  };

  walk(root);

  if (!foundCertDer) {
    throw new Error('No X.509 certificate found in PFX/P12 file');
  }
  if (!foundEncryptedKeyDer && !foundPlainKeyDer) {
    throw new Error('No private key found in PFX/P12 file');
  }

  const pkcs8Bytes = foundEncryptedKeyDer
    ? await decryptEncryptedPrivateKeyInfo(foundEncryptedKeyDer, password)
    : foundPlainKeyDer!;

  let privateKey: CryptoKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8Bytes as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  } catch {
    throw new Error('Unsupported private key format in PFX/P12 (RSA SHA-256 required)');
  }

  return parseX509CertificateDer(foundCertDer, privateKey);
}

/**
 * Construye el contenedor CMS / PKCS#7 SignedData detached (RFC 5652) firmando el resumen SHA-256 de `dataToSign`.
 */
export async function buildCmsSignedData(
  dataToSign: Uint8Array,
  cert: ParsedCertificate,
  signingDate: Date = new Date()
): Promise<Uint8Array> {
  const digestBuf = await crypto.subtle.digest('SHA-256', dataToSign as BufferSource);
  const messageDigest = new Uint8Array(digestBuf);

  const attrContentType = derSequence(derOid(OID_CONTENT_TYPE), derSet(derOid(OID_PKCS7_DATA)));
  const attrSigningTime = derSequence(derOid(OID_SIGNING_TIME), derSet(derUtcTime(signingDate)));
  const attrMessageDigest = derSequence(derOid(OID_MESSAGE_DIGEST), derSet(derOctetString(messageDigest)));

  // Orden canónico DER SET OF (por longitud y bytes)
  const attrs = [attrContentType, attrSigningTime, attrMessageDigest].sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });

  const signedAttrsSetForSign = derSet(...attrs);
  const signedAttrsImplicit = derTag(0xa0, concatUint8Arrays(attrs));

  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cert.privateKey,
    signedAttrsSetForSign as BufferSource
  );
  const signatureBytes = new Uint8Array(sigBuf);

  const sha256AlgId = derSequence(derOid(OID_SHA256), derNull());
  const rsaAlgId = derSequence(derOid(OID_RSA_ENCRYPTION), derNull());

  const signerInfo = derSequence(
    derIntegerFromNumber(1),
    derSequence(cert.issuerDer, cert.serialDer),
    sha256AlgId,
    signedAttrsImplicit,
    rsaAlgId,
    derOctetString(signatureBytes)
  );

  const signedData = derSequence(
    derIntegerFromNumber(1),
    derSet(sha256AlgId),
    derSequence(derOid(OID_PKCS7_DATA)),
    derTag(0xa0, cert.certDer),
    derSet(signerInfo)
  );

  return derSequence(derOid(OID_PKCS7_SIGNED_DATA), derTag(0xa0, signedData));
}

const CONTENTS_HEX_CHARS = 8192; // 4096 bytes reservados para el CMS SignedData DER
const BYTERANGE_PLACEHOLDER = '[0000000000 0000000000 0000000000 0000000000]';

/**
 * Firma digitalmente un campo de firma (`sigMarkupId`) del PDF mediante actualización incremental,
 * insertando el diccionario `/Type /Sig` con `/ByteRange` y `/Contents` CMS PKCS#7 detached real.
 */
export async function signPdfWithCertificate(
  originalBytes: Uint8Array,
  markups: Markup[],
  sigMarkupId: string,
  cert: ParsedCertificate,
  meta: SignatureMetadata = {},
  transformInfoMap: Record<number, PageTransformInfo> = {},
  saveOptions: IncrementalSaveOptions = {}
): Promise<{ signedPdfBytes: Uint8Array; updatedMarkup: Markup }> {
  const target = markups.find((m) => m.id === sigMarkupId);
  if (!target) {
    throw new Error(`Signature field not found: ${sigMarkupId}`);
  }

  const signDateIso = meta.signDateIso || new Date().toISOString();
  const updatedMarkup: Markup = {
    ...target,
    locked: true,
    updatedAt: signDateIso,
    customFields: {
      ...target.customFields,
      fieldType: 'signature',
      sigSigned: 1,
      sigSigner: cert.commonName,
      sigDate: signDateIso,
      ...(meta.reason?.trim() ? { sigReason: meta.reason.trim() } : {}),
      ...(meta.location?.trim() ? { sigLocation: meta.location.trim() } : {}),
    },
  };

  const updatedMarkups = markups.map((m) => (m.id === sigMarkupId ? updatedMarkup : m));

  // Paso 1: Guardar todas las marcas y la apariencia visual (/AP /N) del campo firmado
  const baseBytes = await saveIncrementalMarkups(originalBytes, updatedMarkups, transformInfoMap, saveOptions);

  // Paso 2: Añadir revisión incremental con el diccionario /Type /Sig, /V en el widget y /SigFlags 3 en /AcroForm
  const writer = new IncrementalWriter(baseBytes);
  const pdfDoc = await PDFDocument.load(baseBytes);
  const pages = pdfDoc.getPages();
  const page = pages[updatedMarkup.pageIndex];
  if (!page) {
    throw new Error(`Page index out of bounds: ${updatedMarkup.pageIndex}`);
  }

  let widgetRef: PDFRef | undefined;
  let widgetDict: PDFDict | undefined;
  const annots = page.node.Annots();
  if (annots instanceof PDFArray) {
    for (let i = 0; i < annots.size(); i++) {
      const item = annots.get(i);
      const resolved = item instanceof PDFRef ? pdfDoc.context.lookup(item) : item;
      if (resolved instanceof PDFDict) {
        const key = annotationKeyFor(resolved, item instanceof PDFRef ? item : undefined);
        if (key === sigMarkupId) {
          widgetRef = item instanceof PDFRef ? item : undefined;
          widgetDict = resolved;
          break;
        }
      }
    }
  }
  if (!widgetRef || !widgetDict) {
    throw new Error('Could not locate signature widget annotation in saved PDF');
  }

  const sigObjNum = writer.allocateObjectNumber();
  const sigRef = PDFRef.of(sigObjNum, 0);

  const parentRef = widgetDict.get(PDFName.of('Parent'));
  if (parentRef instanceof PDFRef) {
    const parentDict = pdfDoc.context.lookup(parentRef);
    if (parentDict instanceof PDFDict) {
      parentDict.set(PDFName.of('V'), sigRef);
      writer.addObject(parentRef.objectNumber, parentDict.toString());
    }
  } else {
    widgetDict.set(PDFName.of('V'), sigRef);
    writer.addObject(widgetRef.objectNumber, widgetDict.toString());
  }

  // /SigFlags 3 (SignaturesExist | AppendOnly) en /AcroForm
  const catalog = pdfDoc.catalog;
  const acroRefOrDict = catalog.get(PDFName.of('AcroForm'));
  const acroDict = catalog.lookup(PDFName.of('AcroForm'));
  if (acroDict instanceof PDFDict) {
    acroDict.set(PDFName.of('SigFlags'), PDFNumber.of(3));
    if (acroRefOrDict instanceof PDFRef) {
      writer.addObject(acroRefOrDict.objectNumber, acroDict.toString());
    } else {
      const rootRef = pdfDoc.context.trailerInfo.Root;
      if (rootRef instanceof PDFRef) writer.addObject(rootRef.objectNumber, catalog.toString());
    }
  }

  const contentsPlaceholder = `<${'0'.repeat(CONTENTS_HEX_CHARS)}>`;
  let sigBody = `<<
  /Type /Sig
  /Filter /Adobe.PPKLite
  /SubFilter /adbe.pkcs7.detached
  /Name ${escapePdfString(cert.commonName)}
  /M ${formatPdfDate(signDateIso)}
`;
  if (meta.reason?.trim()) sigBody += `  /Reason ${escapePdfString(meta.reason.trim())}\n`;
  if (meta.location?.trim()) sigBody += `  /Location ${escapePdfString(meta.location.trim())}\n`;
  if (meta.contactInfo?.trim()) sigBody += `  /ContactInfo ${escapePdfString(meta.contactInfo.trim())}\n`;
  sigBody += `  /ByteRange ${BYTERANGE_PLACEHOLDER}\n  /Contents ${contentsPlaceholder}\n>>`;

  writer.addObject(sigObjNum, sigBody);
  const preparedBytes = writer.build();

  // Paso 3: Calcular desplazamientos exactos de /ByteRange y rellenar /Contents con el CMS DER firmado
  const tailText = new TextDecoder('latin1').decode(preparedBytes.subarray(baseBytes.length));
  const brIdxLocal = tailText.indexOf(`/ByteRange ${BYTERANGE_PLACEHOLDER}`);
  const contentsKeyIdxLocal = tailText.indexOf('/Contents <');
  if (brIdxLocal === -1 || contentsKeyIdxLocal === -1) {
    throw new Error('Could not locate /ByteRange or /Contents placeholder in signature revision');
  }

  const brValueOffset = baseBytes.length + brIdxLocal + '/ByteRange '.length;
  const hexOpenOffset = baseBytes.length + contentsKeyIdxLocal + '/Contents '.length; // posición de '<'
  const hexCloseOffset = hexOpenOffset + 1 + CONTENTS_HEX_CHARS; // posición de '>'
  const afterCloseOffset = hexCloseOffset + 1;

  const range1Start = 0;
  const range1Len = hexOpenOffset;
  const range2Start = afterCloseOffset;
  const range2Len = preparedBytes.length - afterCloseOffset;

  const brReal = `[${range1Start} ${range1Len} ${range2Start} ${range2Len}]`;
  if (brReal.length > BYTERANGE_PLACEHOLDER.length) {
    throw new Error('ByteRange exceeds reserved placeholder width');
  }
  const brPadded = brReal + ' '.repeat(BYTERANGE_PLACEHOLDER.length - brReal.length);
  const brBytes = new TextEncoder().encode(brPadded);

  const finalBytes = new Uint8Array(preparedBytes);
  finalBytes.set(brBytes, brValueOffset);

  const signedPortion = concatUint8Arrays([
    finalBytes.subarray(range1Start, range1Start + range1Len),
    finalBytes.subarray(range2Start, range2Start + range2Len),
  ]);

  const cmsDer = await buildCmsSignedData(signedPortion, cert, new Date(signDateIso));
  if (cmsDer.length * 2 > CONTENTS_HEX_CHARS) {
    throw new Error(`CMS signature size (${cmsDer.length} bytes) exceeds reserved /Contents capacity`);
  }

  let cmsHex = '';
  for (let i = 0; i < cmsDer.length; i++) {
    cmsHex += cmsDer[i].toString(16).toUpperCase().padStart(2, '0');
  }
  cmsHex = cmsHex.padEnd(CONTENTS_HEX_CHARS, '0');
  finalBytes.set(new TextEncoder().encode(cmsHex), hexOpenOffset + 1);

  return { signedPdfBytes: finalBytes, updatedMarkup };
}

/**
 * Verifica criptográficamente la firma digital PKCS#7 / CMS de un PDF:
 * comprueba `/ByteRange`, el resumen SHA-256 de los rangos de bytes y la firma RSA del `SignerInfo`.
 */
export async function verifyPdfSignature(pdfBytes: Uint8Array): Promise<VerifiedPdfSignature> {
  const raw = new TextDecoder('latin1').decode(pdfBytes);
  const sigMatch = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(raw);
  if (!sigMatch) {
    throw new Error('No /ByteRange found in PDF');
  }
  const r1Start = parseInt(sigMatch[1], 10);
  const r1Len = parseInt(sigMatch[2], 10);
  const r2Start = parseInt(sigMatch[3], 10);
  const r2Len = parseInt(sigMatch[4], 10);

  if (r1Start !== 0 || r2Start + r2Len !== pdfBytes.length || r1Len >= r2Start) {
    throw new Error('Invalid /ByteRange bounds');
  }

  // Los bytes entre los dos tramos de /ByteRange deben ser exactamente <HEX...>
  if (pdfBytes[r1Len] !== 0x3c || pdfBytes[r2Start - 1] !== 0x3e) {
    throw new Error('/ByteRange does not bracket the <...> hex string of /Contents');
  }

  const hexStr = new TextDecoder('latin1').decode(pdfBytes.subarray(r1Len + 1, r2Start - 1)).trim();
  const cmsFullBytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < cmsFullBytes.length; i++) {
    cmsFullBytes[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  }

  const contentInfo = readDerNode(cmsFullBytes, 0);
  const ciKids = readDerChildren(contentInfo);
  if (ciKids.length < 2 || decodeDerOid(ciKids[0].value) !== OID_PKCS7_SIGNED_DATA) {
    throw new Error('Invalid CMS ContentInfo: expected SignedData OID');
  }
  const signedData = readDerNode(ciKids[1].value, 0);
  const sdKids = readDerChildren(signedData);

  const certsNode = sdKids.find((n) => n.tag === 0xa0);
  if (!certsNode) throw new Error('No X.509 certificate in CMS SignedData');
  const certSeq = readDerNode(certsNode.value, 0);
  const certKids = readDerChildren(certSeq);
  const tbsKids = readDerChildren(certKids[0]);
  const idx = tbsKids[0].tag === 0xa0 ? 1 : 0;
  const subjectNode = tbsKids[idx + 4];
  const spkiDer = tbsKids[idx + 5].raw;

  let signerName = 'Signer';
  for (const rdn of readDerChildren(subjectNode)) {
    for (const atv of readDerChildren(rdn)) {
      const pair = readDerChildren(atv);
      if (pair.length >= 2 && decodeDerOid(pair[0].value) === OID_COMMON_NAME) {
        signerName = decodeDerString(pair[1]);
      }
    }
  }

  const signerInfosSet = sdKids[sdKids.length - 1];
  const signerInfo = readDerChildren(signerInfosSet)[0];
  const siKids = readDerChildren(signerInfo);
  const signedAttrsImplicit = siKids.find((n) => n.tag === 0xa0);
  const sigOctet = siKids[siKids.length - 1];
  if (!signedAttrsImplicit || sigOctet.tag !== 0x04) {
    throw new Error('Missing signedAttrs or signature in CMS SignerInfo');
  }

  // Extraer messageDigest de signedAttrs
  let embeddedDigest: Uint8Array | null = null;
  for (const attr of readDerChildren(signedAttrsImplicit)) {
    const aKids = readDerChildren(attr);
    if (aKids.length >= 2 && decodeDerOid(aKids[0].value) === OID_MESSAGE_DIGEST) {
      const setKids = readDerChildren(aKids[1]);
      if (setKids.length > 0 && setKids[0].tag === 0x04) {
        embeddedDigest = setKids[0].value;
      }
    }
  }
  if (!embeddedDigest) throw new Error('Missing messageDigest attribute in CMS signedAttrs');

  // Recalcular SHA-256 de los dos tramos de /ByteRange
  const signedPortion = concatUint8Arrays([
    pdfBytes.subarray(r1Start, r1Start + r1Len),
    pdfBytes.subarray(r2Start, r2Start + r2Len),
  ]);
  const computedDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', signedPortion as BufferSource));
  const digestsMatch =
    computedDigest.length === embeddedDigest.length &&
    computedDigest.every((b, i) => b === embeddedDigest![i]);

  // Verificar la firma RSA sobre el SET de signedAttrs usando la clave pública del certificado X.509
  const publicKey = await crypto.subtle.importKey(
    'spki',
    spkiDer as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signedAttrsSet = derTag(0x31, signedAttrsImplicit.value);
  const rsaValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    sigOctet.value as BufferSource,
    signedAttrsSet as BufferSource
  );

  const reasonMatch = /\/Reason\s*\(([^)]*)\)/.exec(raw);
  const locationMatch = /\/Location\s*\(([^)]*)\)/.exec(raw);

  return {
    valid: digestsMatch && rsaValid,
    signerName,
    reason: reasonMatch?.[1],
    location: locationMatch?.[1],
    byteRange: [r1Start, r1Len, r2Start, r2Len],
  };
}
