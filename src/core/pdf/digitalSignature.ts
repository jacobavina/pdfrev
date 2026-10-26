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
  isSignedSignatureField,
} from './incrementalWriter';
import { PageTransformInfo } from './operators';
import { Pkcs12Hash, bmpPassword, pkcs12Kdf, rc2CbcDecrypt, stripPkcs7Padding, tripleDesCbcDecrypt } from './pkcs12Ciphers';

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
  /** false si después de firmar se añadieron revisiones incrementales (ADR-0058): la firma cubre la suya. */
  coversWholeDocument: boolean;
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

function derBmpString(str: string): Uint8Array {
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    out[i * 2] = str.charCodeAt(i) >> 8;
    out[i * 2 + 1] = str.charCodeAt(i) & 0xff;
  }
  return derTag(0x1e, out);
}

/** SET OF en orden canónico DER (X.690 §11.6): elementos ordenados por sus bytes. */
function derSetOf(...items: Uint8Array[]): Uint8Array {
  const sorted = [...items].sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  });
  return derSet(...sorted);
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
// PKCS#12 de otras herramientas (ADR-0058)
const OID_PKCS7_ENCRYPTED_DATA = '1.2.840.113549.1.7.6';
const OID_PKCS7_ENVELOPED_DATA = '1.2.840.113549.1.7.3';
const OID_SAFE_CONTENTS_BAG = '1.2.840.113549.1.12.10.1.6';
const OID_FRIENDLY_NAME = '1.2.840.113549.1.9.20';
const OID_LOCAL_KEY_ID = '1.2.840.113549.1.9.21';
const OID_PBMAC1 = '1.2.840.113549.1.5.14';
const OID_DES_EDE3_CBC = '1.2.840.113549.3.7';
/** pbeWithSHAAnd…: longitud de clave y cifrado (RFC 7292 apéndice C). */
const PKCS12_PBE: Record<string, { keyLen: number; rc2Bits?: number }> = {
  '1.2.840.113549.1.12.1.3': { keyLen: 24 },
  '1.2.840.113549.1.12.1.4': { keyLen: 16 },
  '1.2.840.113549.1.12.1.5': { keyLen: 16, rc2Bits: 128 },
  '1.2.840.113549.1.12.1.6': { keyLen: 5, rc2Bits: 40 },
};
/** Longitud de clave de los cifrados de PBES2 que se admiten. */
const PBES2_CIPHERS: Record<string, number> = {
  [OID_AES128_CBC]: 16,
  [OID_AES256_CBC]: 32,
  [OID_DES_EDE3_CBC]: 24,
};
const HMAC_PRF: Record<string, Pkcs12Hash> = {
  '1.2.840.113549.2.7': 'SHA-1',
  [OID_HMAC_WITH_SHA256]: 'SHA-256',
  '1.2.840.113549.2.10': 'SHA-384',
  '1.2.840.113549.2.11': 'SHA-512',
};
const DIGEST_OIDS: Record<string, Pkcs12Hash> = {
  '1.3.14.3.2.26': 'SHA-1',
  [OID_SHA256]: 'SHA-256',
  '2.16.840.1.101.3.4.2.2': 'SHA-384',
  '2.16.840.1.101.3.4.2.3': 'SHA-512',
};
const HASH_LENGTH: Record<Pkcs12Hash, number> = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 };
const PFX_MAC_ITERATIONS = 2048;
const MAX_PBE_ITERATIONS = 1_000_000;
const PFX_PASSWORD_ERROR = 'Invalid certificate password or corrupted PFX file';

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

/** Entero DER no negativo como número (iteraciones); rechaza valores desmesurados. */
function derToNumber(node: DerNode): number {
  if (node.tag !== 0x02 || node.value.length === 0 || node.value.length > 6) {
    throw new Error('Corrupted PFX file: invalid INTEGER');
  }
  let n = 0;
  for (const b of node.value) n = n * 256 + b;
  return n;
}

function iterationsOf(node: DerNode | undefined): number {
  const n = node ? derToNumber(node) : 1;
  if (n < 1 || n > MAX_PBE_ITERATIONS) throw new Error(`Unsupported PFX/P12 iteration count: ${n}`);
  return n;
}

/**
 * Pasa BER a DER (ADR-0058): longitudes indefinidas y OCTET STRING construidos, como los que escriben el llavero de
 * macOS o Java. No entra en los OCTET STRING primitivos: lo que llevan dentro se normaliza al leerlo.
 */
export function berToDer(buf: Uint8Array): Uint8Array {
  const read = (offset: number, depth: number): { der: Uint8Array; next: number } => {
    if (depth > 64) throw new Error('ASN.1 nesting too deep');
    if (offset + 2 > buf.length) throw new Error('ASN.1 BER truncated');
    const tag = buf[offset];
    if ((tag & 0x1f) === 0x1f) throw new Error('ASN.1 high tag numbers are not supported');
    const constructed = (tag & 0x20) !== 0;
    const first = buf[offset + 1];
    let idx = offset + 2;
    let end = -1;
    if (first === 0x80) {
      if (!constructed) throw new Error('ASN.1 BER indefinite length on a primitive value');
    } else if ((first & 0x80) === 0) {
      end = idx + first;
    } else {
      const numBytes = first & 0x7f;
      if (numBytes > 4 || idx + numBytes > buf.length) throw new Error('ASN.1 BER invalid length byte count');
      let len = 0;
      for (let i = 0; i < numBytes; i++) len = len * 256 + buf[idx++];
      end = idx + len;
    }
    if (end > buf.length) throw new Error('ASN.1 BER value exceeds buffer');
    if (!constructed) return { der: derTag(tag, buf.subarray(idx, end)), next: end };
    const kids: Uint8Array[] = [];
    for (;;) {
      if (end === -1) {
        if (idx + 2 > buf.length) throw new Error('ASN.1 BER missing end-of-contents');
        if (buf[idx] === 0 && buf[idx + 1] === 0) {
          idx += 2;
          break;
        }
      } else if (idx >= end) {
        break;
      }
      const kid = read(idx, depth + 1);
      kids.push(kid.der);
      idx = kid.next;
    }
    if (end !== -1 && idx !== end) throw new Error('ASN.1 BER child exceeds its parent');
    if (tag === 0x24) {
      // OCTET STRING construido: la concatenación de sus trozos
      return { der: derOctetString(concatUint8Arrays(kids.map((k) => readDerNode(k).value))), next: idx };
    }
    return { der: derTag(tag, concatUint8Arrays(kids)), next: idx };
  };
  return read(0, 0).der;
}

/** Contenido de un [0] IMPLICIT OCTET STRING, primitivo (0x80) o construido por trozos (0xa0). */
function implicitOctets(node: DerNode): Uint8Array {
  if (node.tag === 0x80) return node.value;
  if (node.tag === 0xa0) return concatUint8Arrays(readDerChildren(node).map((k) => k.value));
  throw new Error('Corrupted PFX file: unexpected encrypted content');
}

/**
 * Descifra con el AlgorithmIdentifier de PKCS#5 / PKCS#12 (ADR-0058): PBES2 (PBKDF2 con HMAC-SHA1/256/384/512 y
 * AES-128/256-CBC o DES-EDE3-CBC) y pbeWithSHAAnd3-KeyTripleDES-CBC, 2-KeyTripleDES-CBC, 128BitRC2-CBC y
 * 40BitRC2-CBC con el KDF de PKCS#12.
 */
async function decryptPbe(algIdNode: DerNode, encrypted: Uint8Array, password: string): Promise<Uint8Array> {
  const algSeq = readDerChildren(algIdNode);
  const algOid = algSeq[0]?.tag === 0x06 ? decodeDerOid(algSeq[0].value) : '';
  const legacy = PKCS12_PBE[algOid];
  if (legacy && algSeq.length >= 2) {
    const params = readDerChildren(algSeq[1]);
    const salt = params[0].value;
    const iterations = iterationsOf(params[1]);
    const pw = bmpPassword(password);
    const key = await pkcs12Kdf('SHA-1', pw, salt, iterations, 1, legacy.keyLen);
    const iv = await pkcs12Kdf('SHA-1', pw, salt, iterations, 2, 8);
    const raw =
      legacy.rc2Bits === undefined
        ? tripleDesCbcDecrypt(key, iv, encrypted)
        : rc2CbcDecrypt(key, legacy.rc2Bits, iv, encrypted);
    return stripPkcs7Padding(raw, 8);
  }
  if (algOid !== OID_PBES2 || algSeq.length < 2) {
    throw new Error(`Unsupported PFX/P12 encryption algorithm: ${algOid || 'unknown'}`);
  }

  const pbes2Kids = readDerChildren(algSeq[1]);
  const kdfKids = readDerChildren(pbes2Kids[0]);
  const encKids = readDerChildren(pbes2Kids[1]);
  const kdfOid = decodeDerOid(kdfKids[0].value);
  if (kdfOid !== OID_PBKDF2) throw new Error(`Unsupported KDF OID: ${kdfOid}`);

  // PBKDF2-params: salt, iterationCount, keyLength OPTIONAL, prf DEFAULT hmacWithSHA1 (RFC 8018 A.2)
  const pbkdf2Params = readDerChildren(kdfKids[1]);
  if (pbkdf2Params[0]?.tag !== 0x04) throw new Error('Unsupported PBKDF2 salt source');
  const salt = pbkdf2Params[0].value;
  const iterations = iterationsOf(pbkdf2Params[1]);
  let hashName: Pkcs12Hash = 'SHA-1';
  for (let i = 2; i < pbkdf2Params.length; i++) {
    if (pbkdf2Params[i].tag === 0x30) {
      const prfOid = decodeDerOid(readDerChildren(pbkdf2Params[i])[0].value);
      const prf = HMAC_PRF[prfOid];
      if (!prf) throw new Error(`Unsupported PBKDF2 PRF: ${prfOid}`);
      hashName = prf;
    }
  }

  const cipherOid = decodeDerOid(encKids[0].value);
  const keyBytes = PBES2_CIPHERS[cipherOid];
  if (!keyBytes) throw new Error(`Unsupported PBES2 cipher: ${cipherOid}`);
  const iv = encKids[1].value;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const keyRaw = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: hashName },
      baseKey,
      keyBytes * 8
    )
  );
  if (cipherOid === OID_DES_EDE3_CBC) {
    return stripPkcs7Padding(tripleDesCbcDecrypt(keyRaw, iv, encrypted), 8);
  }
  const aesKey = await crypto.subtle.importKey('raw', keyRaw as BufferSource, 'AES-CBC', false, ['decrypt']);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv as BufferSource },
      aesKey,
      encrypted as BufferSource
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error(PFX_PASSWORD_ERROR);
  }
}

/** HMAC de PKCS#12 sobre el AuthenticatedSafe, con la clave del KDF (id 3) del mismo resumen (RFC 7292 §4). */
async function pfxMac(
  hash: Pkcs12Hash,
  pw: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  data: Uint8Array
): Promise<Uint8Array> {
  const keyBytes = await pkcs12Kdf(hash, pw, salt, iterations, 3, HASH_LENGTH[hash]);
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data as BufferSource));
}

/** Comprueba el macData: detecta la contraseña incorrecta y el archivo alterado antes de descifrar nada. */
async function verifyPfxMac(macDataNode: DerNode, authSafeOctets: Uint8Array, password: string): Promise<void> {
  const macKids = readDerChildren(macDataNode);
  const digestInfo = readDerChildren(macKids[0]);
  const algOid = decodeDerOid(readDerChildren(digestInfo[0])[0].value);
  if (algOid === OID_PBMAC1) throw new Error('Unsupported PFX/P12 MAC algorithm (PBMAC1)');
  const hash = DIGEST_OIDS[algOid];
  if (!hash) throw new Error(`Unsupported PFX/P12 MAC algorithm: ${algOid}`);
  const expected = digestInfo[1].value;
  const salt = macKids[1].value;
  const iterations = iterationsOf(macKids[2]);
  // Contraseña vacía: unas herramientas la codifican como 00 00 y otras como cadena vacía; valen las dos
  const candidates = password === '' ? [bmpPassword(''), new Uint8Array(0)] : [bmpPassword(password)];
  for (const pw of candidates) {
    const mac = await pfxMac(hash, pw, salt, iterations, authSafeOctets);
    let diff = mac.length ^ expected.length;
    for (let i = 0; i < Math.min(mac.length, expected.length); i++) diff |= mac[i] ^ expected[i];
    if (diff === 0) return;
  }
  throw new Error(`${PFX_PASSWORD_ERROR} (MAC verification failed)`);
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

  // Construir contenedor PKCS#12 (PFX v3, RFC 7292). Los dos bolsos llevan localKeyId (SHA-1 del certificado) y
  // friendlyName, con los que Windows y Acrobat emparejan la clave con su certificado (ADR-0058)
  const encryptedKeyInfo = await encryptPkcs8Pbes2(pkcs8Der, opts.password);
  const localKeyId = new Uint8Array(await crypto.subtle.digest('SHA-1', certDer as BufferSource));
  const bagAttributes = derSetOf(
    derSequence(derOid(OID_FRIENDLY_NAME), derSet(derBmpString(opts.commonName.trim()))),
    derSequence(derOid(OID_LOCAL_KEY_ID), derSet(derOctetString(localKeyId)))
  );
  const shroudedKeyBag = derSequence(
    derOid(OID_PKCS8_SHROUDED_KEY_BAG),
    derTag(0xa0, encryptedKeyInfo),
    bagAttributes
  );

  const x509CertBagValue = derSequence(derOid(OID_X509_CERTIFICATE), derTag(0xa0, derOctetString(certDer)));
  const certBag = derSequence(derOid(OID_CERT_BAG), derTag(0xa0, x509CertBagValue), bagAttributes);

  const safeContents = derSequence(certBag, shroudedKeyBag);
  const dataContentInfo = derSequence(derOid(OID_PKCS7_DATA), derTag(0xa0, derOctetString(safeContents)));
  const authSafeBytes = derSequence(dataContentInfo);
  const authSafeContentInfo = derSequence(derOid(OID_PKCS7_DATA), derTag(0xa0, derOctetString(authSafeBytes)));

  // macData con HMAC-SHA256 (ADR-0058): sin él, Windows y Acrobat pueden rechazar el archivo
  const macSalt = crypto.getRandomValues(new Uint8Array(16));
  const mac = await pfxMac('SHA-256', bmpPassword(opts.password), macSalt, PFX_MAC_ITERATIONS, authSafeBytes);
  const macData = derSequence(
    derSequence(derSequence(derOid(OID_SHA256), derNull()), derOctetString(mac)),
    derOctetString(macSalt),
    derIntegerFromNumber(PFX_MAC_ITERATIONS)
  );

  const pfxBytes = derSequence(derIntegerFromNumber(3), authSafeContentInfo, macData);
  const certificate = parseX509CertificateDer(certDer, keyPair.privateKey);

  return { pfxBytes, certificate };
}

interface PfxBags {
  certs: { der: Uint8Array; localKeyId?: string }[];
  keys: { pkcs8?: Uint8Array; encrypted?: DerNode; localKeyId?: string }[];
}

/** localKeyId de los atributos de un SafeBag, en hexadecimal. */
function localKeyIdOf(attrs: DerNode | undefined): string | undefined {
  if (!attrs || attrs.tag !== 0x31) return undefined;
  for (const attr of readDerChildren(attrs)) {
    const kids = readDerChildren(attr);
    if (kids.length < 2 || kids[0].tag !== 0x06 || decodeDerOid(kids[0].value) !== OID_LOCAL_KEY_ID) continue;
    const value = readDerChildren(kids[1])[0];
    if (value?.tag === 0x04) return Array.from(value.value, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return undefined;
}

/** Recorre un SafeContents (RFC 7292 §4.2): certificados X.509, claves en claro o cifradas y SafeContents anidados. */
function collectSafeBags(safeContents: Uint8Array, bags: PfxBags, depth: number): void {
  const seq = readDerNode(berToDer(safeContents));
  if (seq.tag !== 0x30) throw new Error('Corrupted PFX file: invalid SafeContents');
  for (const bag of readDerChildren(seq)) {
    const kids = readDerChildren(bag);
    if (kids.length < 2 || kids[0].tag !== 0x06 || kids[1].tag !== 0xa0) continue;
    const bagId = decodeDerOid(kids[0].value);
    const value = readDerNode(kids[1].value);
    const localKeyId = localKeyIdOf(kids[2]);
    if (bagId === OID_CERT_BAG) {
      const certBag = readDerChildren(value);
      if (certBag.length >= 2 && decodeDerOid(certBag[0].value) === OID_X509_CERTIFICATE && certBag[1].tag === 0xa0) {
        const octets = readDerNode(certBag[1].value);
        if (octets.tag === 0x04) bags.certs.push({ der: octets.value, localKeyId });
      }
    } else if (bagId === OID_KEY_BAG) {
      bags.keys.push({ pkcs8: value.raw, localKeyId });
    } else if (bagId === OID_PKCS8_SHROUDED_KEY_BAG) {
      bags.keys.push({ encrypted: value, localKeyId });
    } else if (bagId === OID_SAFE_CONTENTS_BAG && depth < 4) {
      collectSafeBags(value.raw, bags, depth + 1);
    }
  }
}

/** Módulo RSA (JWK `n`) de una clave pública SPKI o de una privada PKCS#8, para emparejar clave y certificado. */
async function rsaModulusOf(format: 'spki' | 'pkcs8', der: Uint8Array): Promise<string | undefined> {
  try {
    const usage: KeyUsage[] = format === 'spki' ? ['verify'] : ['sign'];
    const key = await crypto.subtle.importKey(format, der as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, usage);
    return (await crypto.subtle.exportKey('jwk', key)).n;
  } catch {
    return undefined;
  }
}

/** SubjectPublicKeyInfo de un certificado X.509 DER. */
function certSpki(certDer: Uint8Array): Uint8Array {
  const tbsKids = readDerChildren(readDerChildren(readDerNode(certDer))[0]);
  return tbsKids[(tbsKids[0].tag === 0xa0 ? 1 : 0) + 5].raw;
}

/**
 * Lee un archivo PKCS#12 (.pfx / .p12) con su contraseña y devuelve el certificado X.509 y su clave privada.
 * Admite los de REA y los de Windows, OpenSSL y Acrobat (ADR-0058): SafeContents en `data` y en `encryptedData`,
 * PBES2/AES, 3DES y RC2 con el KDF de PKCS#12, BER, cadenas con varios certificados y verificación del macData.
 */
export async function parsePfxCertificate(pfxBytes: Uint8Array, password: string): Promise<ParsedCertificate> {
  let root: DerNode;
  try {
    root = readDerNode(berToDer(pfxBytes));
  } catch {
    throw new Error('Invalid PFX/P12 file: not a valid ASN.1 DER structure');
  }
  if (root.tag !== 0x30) {
    throw new Error('Invalid PFX/P12 file: expected ASN.1 SEQUENCE');
  }

  // PFX ::= SEQUENCE { version, authSafe ContentInfo, macData OPTIONAL }
  const pfxKids = readDerChildren(root);
  if (pfxKids.length < 2 || pfxKids[0].tag !== 0x02 || pfxKids[1].tag !== 0x30) {
    throw new Error('Invalid PFX/P12 file: not a PKCS#12 PFX structure');
  }
  const authSafeInfo = readDerChildren(pfxKids[1]);
  if (authSafeInfo.length < 2 || decodeDerOid(authSafeInfo[0].value) !== OID_PKCS7_DATA || authSafeInfo[1].tag !== 0xa0) {
    throw new Error('Unsupported PFX/P12 integrity mode: only password-protected files are supported');
  }
  const authSafeOctets = readDerNode(authSafeInfo[1].value);
  if (authSafeOctets.tag !== 0x04) throw new Error('Corrupted PFX file: invalid AuthenticatedSafe');
  if (pfxKids[2]?.tag === 0x30) {
    await verifyPfxMac(pfxKids[2], authSafeOctets.value, password);
  }

  // AuthenticatedSafe ::= SEQUENCE OF ContentInfo (data o encryptedData)
  const bags: PfxBags = { certs: [], keys: [] };
  for (const info of readDerChildren(readDerNode(berToDer(authSafeOctets.value)))) {
    const kids = readDerChildren(info);
    const oid = kids[0]?.tag === 0x06 ? decodeDerOid(kids[0].value) : '';
    if (kids.length < 2 || kids[1].tag !== 0xa0) continue;
    if (oid === OID_PKCS7_DATA) {
      const octets = readDerNode(kids[1].value);
      if (octets.tag === 0x04) collectSafeBags(octets.value, bags, 0);
    } else if (oid === OID_PKCS7_ENCRYPTED_DATA) {
      // EncryptedData ::= SEQUENCE { version, EncryptedContentInfo { contentType, algorithm, [0] IMPLICIT content } }
      const encryptedData = readDerChildren(readDerNode(kids[1].value));
      const contentInfo = encryptedData[1] ? readDerChildren(encryptedData[1]) : [];
      if (contentInfo.length < 3) continue;
      collectSafeBags(await decryptPbe(contentInfo[1], implicitOctets(contentInfo[2]), password), bags, 0);
    } else if (oid === OID_PKCS7_ENVELOPED_DATA) {
      throw new Error('Unsupported PFX/P12 file: SafeContents encrypted with a public key (envelopedData)');
    }
  }

  if (bags.certs.length === 0) {
    throw new Error('No X.509 certificate found in PFX/P12 file');
  }
  if (bags.keys.length === 0) {
    throw new Error('No private key found in PFX/P12 file');
  }

  const keyBag = bags.keys[0];
  let pkcs8Bytes: Uint8Array;
  if (keyBag.pkcs8) {
    pkcs8Bytes = keyBag.pkcs8;
  } else {
    // EncryptedPrivateKeyInfo ::= SEQUENCE { encryptionAlgorithm, encryptedData OCTET STRING }
    const encKids = readDerChildren(keyBag.encrypted!);
    if (encKids.length < 2 || encKids[1].tag !== 0x04) throw new Error('Malformed EncryptedPrivateKeyInfo');
    pkcs8Bytes = berToDer(await decryptPbe(encKids[0], encKids[1].value, password));
  }

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

  // Certificado de la clave: el de su mismo localKeyId; si no, el único, o el de su mismo módulo RSA (cadenas con CA)
  let cert = keyBag.localKeyId ? bags.certs.find((c) => c.localKeyId === keyBag.localKeyId) : undefined;
  if (!cert && bags.certs.length === 1) cert = bags.certs[0];
  if (!cert) {
    const keyModulus = await rsaModulusOf('pkcs8', pkcs8Bytes);
    for (const c of bags.certs) {
      if (keyModulus && (await rsaModulusOf('spki', certSpki(c.der))) === keyModulus) {
        cert = c;
        break;
      }
    }
  }
  if (!cert) throw new Error('No certificate in the PFX/P12 file matches its private key');

  return parseX509CertificateDer(cert.der, privateKey);
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
  if (typeof pdfDoc.context.largestObjectNumber === 'number') {
    writer.ensureNextObjectNumber(pdfDoc.context.largestObjectNumber + 1);
  }
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
  if (isSignedSignatureField(widgetDict)) {
    throw new Error('This signature field is already signed');
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
 * Texto de una clave de la firma (/Reason, /Location): entre paréntesis o en hexadecimal, y en UTF-16 con BOM cuando
 * lleva acentos (un motivo o un lugar con "México" no cabe en el literal de PDFDocEncoding).
 */
export function readSignatureText(raw: string, key: string): string | undefined {
  const literal = new RegExp('/' + key + String.raw`\s*\(([^)]*)\)`).exec(raw);
  if (literal) return literal[1];
  const hex = new RegExp('/' + key + String.raw`\s*<([0-9A-Fa-f\s]+)>`).exec(raw);
  if (!hex) return undefined;
  const clean = hex[1].replace(/\s+/g, '');
  const bytes = (clean.match(/../g) ?? []).map((h) => parseInt(h, 16));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  return String.fromCharCode(...bytes);
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

  // La firma cubre su revisión: las actualizaciones incrementales posteriores quedan fuera (ADR-0058)
  if (r1Start !== 0 || r2Start + r2Len > pdfBytes.length || r1Len >= r2Start) {
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

  return {
    valid: digestsMatch && rsaValid,
    signerName,
    reason: readSignatureText(raw, 'Reason'),
    location: readSignatureText(raw, 'Location'),
    byteRange: [r1Start, r1Len, r2Start, r2Len],
    coversWholeDocument: r2Start + r2Len === pdfBytes.length,
  };
}
