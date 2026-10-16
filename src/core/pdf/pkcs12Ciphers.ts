/**
 * Primitivas de los PKCS#12 heredados (ADR-0058), en TypeScript puro y sin dependencias: WebCrypto no ofrece 3DES
 * ni RC2, que son los cifrados con los que Windows, OpenSSL 1.x y Acrobat guardan el certificado y la clave.
 * - KDF de PKCS#12 (RFC 7292, apéndice B.2), con SHA-1 y SHA-256 síncronos propios.
 * - Triple DES EDE en CBC (FIPS 46-3 / SP 800-67), solo descifrado.
 * - RC2 en CBC (RFC 2268) con longitud efectiva de clave, solo descifrado.
 */

export type Pkcs12Hash = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/** Longitud del resumen (u) y del bloque (v) en bytes de cada hash, como los define RFC 7292 B.2. */
const HASH_SIZES: Record<Pkcs12Hash, { u: number; v: number }> = {
  'SHA-1': { u: 20, v: 64 },
  'SHA-256': { u: 32, v: 64 },
  'SHA-384': { u: 48, v: 128 },
  'SHA-512': { u: 64, v: 128 },
};

/** Contraseña de PKCS#12: BMPString (UTF-16BE) con los dos bytes nulos de cierre (RFC 7292 B.1). */
export function bmpPassword(password: string): Uint8Array {
  const out = new Uint8Array((password.length + 1) * 2);
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i);
    out[i * 2] = c >> 8;
    out[i * 2 + 1] = c & 0xff;
  }
  return out;
}

// --- SHA-1 y SHA-256 síncronos (FIPS 180-4) ---
// El KDF encadena miles de resúmenes de 20-32 bytes: con crypto.subtle cada uno es una promesa y un archivo heredado
// tardaba segundos en abrir. Los síncronos lo hacen en milisegundos. SHA-384/512 (raros aquí) siguen en WebCrypto.

const SHA256_K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Mensaje con el relleno de SHA-1/SHA-256: 0x80, ceros y la longitud en bits (64 bits big-endian). */
function mdPad(msg: Uint8Array): DataView {
  const len = (((msg.length + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(len);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = msg.length * 8;
  dv.setUint32(len - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(len - 4, bits >>> 0);
  return dv;
}

function wordsOut(h: number[]): Uint8Array {
  const out = new Uint8Array(h.length * 4);
  const dv = new DataView(out.buffer);
  h.forEach((v, i) => dv.setUint32(i * 4, v >>> 0));
  return out;
}

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha1(msg: Uint8Array): Uint8Array {
  const dv = mdPad(msg);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Int32Array(80);
  for (let off = 0; off < dv.byteLength; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getInt32(off + t * 4);
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = h;
    for (let t = 0; t < 80; t++) {
      const f =
        t < 20 ? ((b & c) | (~b & d)) + 0x5a827999 : t < 40 ? (b ^ c ^ d) + 0x6ed9eba1 : t < 60 ? ((b & c) | (b & d) | (c & d)) + 0x8f1bbcdc : (b ^ c ^ d) + 0xca62c1d6;
      const tmp = (rotl(a, 5) + f + e + w[t]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = tmp;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
  }
  return wordsOut(h);
}

export function sha256(msg: Uint8Array): Uint8Array {
  const dv = mdPad(msg);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Int32Array(64);
  for (let off = 0; off < dv.byteLength; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getInt32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }
  return wordsOut(h);
}

async function digest(hash: Pkcs12Hash, data: Uint8Array): Promise<Uint8Array> {
  if (hash === 'SHA-1') return sha1(data);
  if (hash === 'SHA-256') return sha256(data);
  return new Uint8Array(await crypto.subtle.digest(hash, data as BufferSource));
}

function repeatTo(src: Uint8Array, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = src[i % src.length];
  return out;
}

/**
 * KDF de PKCS#12 (RFC 7292 B.2). `id` 1 = clave de cifrado, 2 = vector inicial, 3 = clave del MAC.
 * `password` ya codificada (ver `bmpPassword`).
 */
export async function pkcs12Kdf(
  hash: Pkcs12Hash,
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  id: 1 | 2 | 3,
  n: number
): Promise<Uint8Array> {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Invalid PKCS#12 iteration count');
  const { u, v } = HASH_SIZES[hash];
  const d = new Uint8Array(v).fill(id);
  const s = salt.length > 0 ? repeatTo(salt, v * Math.ceil(salt.length / v)) : new Uint8Array(0);
  const p = password.length > 0 ? repeatTo(password, v * Math.ceil(password.length / v)) : new Uint8Array(0);
  const i = new Uint8Array(s.length + p.length);
  i.set(s);
  i.set(p, s.length);

  const blocks = Math.ceil(n / u);
  const out = new Uint8Array(blocks * u);
  const di = new Uint8Array(v + i.length);
  for (let b = 0; b < blocks; b++) {
    di.set(d);
    di.set(i, v);
    let a = await digest(hash, di);
    for (let r = 1; r < iterations; r++) a = await digest(hash, a);
    out.set(a, b * u);
    if (b === blocks - 1) break;
    // I_j = (I_j + B + 1) mod 2^(8v) para cada bloque de v bytes de I
    const bb = repeatTo(a, v);
    for (let j = 0; j < i.length; j += v) {
      let carry = 1;
      for (let k = v - 1; k >= 0; k--) {
        const sum = i[j + k] + bb[k] + carry;
        i[j + k] = sum & 0xff;
        carry = sum >> 8;
      }
    }
  }
  return out.subarray(0, n);
}

/** Quita el relleno PKCS#7; un relleno inválido casi siempre significa contraseña incorrecta. */
export function stripPkcs7Padding(data: Uint8Array, blockSize: number): Uint8Array {
  const pad = data.length > 0 ? data[data.length - 1] : 0;
  if (data.length === 0 || data.length % blockSize !== 0 || pad < 1 || pad > blockSize) {
    throw new Error('Invalid certificate password or corrupted PFX file');
  }
  for (let k = data.length - pad; k < data.length; k++) {
    if (data[k] !== pad) throw new Error('Invalid certificate password or corrupted PFX file');
  }
  return data.subarray(0, data.length - pad);
}

// --- DES (FIPS 46-3) ---

// Permutación inicial: filas 58, 60, 62, 64, 57, 59, 61, 63 bajando de 8 en 8; la final es su inversa
const DES_IP: number[] = [];
for (let r = 0; r < 8; r++) {
  const start = r < 4 ? 58 + 2 * r : 57 + 2 * (r - 4);
  for (let k = 0; k < 8; k++) DES_IP.push(start - 8 * k);
}
const DES_FP: number[] = new Array(64);
DES_IP.forEach((src, dst) => {
  DES_FP[src - 1] = dst + 1;
});
// Expansión E: cada grupo de 6 bits toma 4 bits de R y uno de cada vecino
const DES_E: number[] = [];
for (let g = 0; g < 8; g++) for (let j = 0; j < 6; j++) DES_E.push(((4 * g + j - 1 + 32) % 32) + 1);
const DES_P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25];
const DES_PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];
const DES_PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
  41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];
const DES_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const DES_S: number[][] = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
];

function toBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (const b of bytes) for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1);
  return bits;
}

function fromBits(bits: number[]): Uint8Array {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) out[i >> 3] |= bits[i] << (7 - (i & 7));
  return out;
}

function desSubkeys(key8: Uint8Array): number[][] {
  const kb = toBits(key8);
  const cd = DES_PC1.map((p) => kb[p - 1]);
  let c = cd.slice(0, 28);
  let d = cd.slice(28);
  const subkeys: number[][] = [];
  for (const shift of DES_SHIFTS) {
    c = [...c.slice(shift), ...c.slice(0, shift)];
    d = [...d.slice(shift), ...d.slice(0, shift)];
    const joined = [...c, ...d];
    subkeys.push(DES_PC2.map((p) => joined[p - 1]));
  }
  return subkeys;
}

function desBlock(block: Uint8Array, subkeys: number[][], decrypt: boolean): Uint8Array {
  const bits = toBits(block);
  const ip = DES_IP.map((p) => bits[p - 1]);
  let l = ip.slice(0, 32);
  let r = ip.slice(32);
  for (let round = 0; round < 16; round++) {
    const k = subkeys[decrypt ? 15 - round : round];
    const e = DES_E.map((p, idx) => r[p - 1] ^ k[idx]);
    const sOut: number[] = [];
    for (let s = 0; s < 8; s++) {
      const six = e.slice(s * 6, s * 6 + 6);
      const val = DES_S[s][(six[0] * 2 + six[5]) * 16 + six[1] * 8 + six[2] * 4 + six[3] * 2 + six[4]];
      sOut.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
    }
    const f = DES_P.map((p) => sOut[p - 1]);
    const next = l.map((bit, idx) => bit ^ f[idx]);
    l = r;
    r = next;
  }
  const pre = [...r, ...l];
  return fromBits(DES_FP.map((p) => pre[p - 1]));
}

/** Descifra Triple DES EDE en CBC (clave de 24 bytes, o de 16 con K3 = K1), sin quitar el relleno. */
export function tripleDesCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length !== 24 && key.length !== 16) throw new Error('Triple DES key must be 16 or 24 bytes');
  if (iv.length !== 8 || data.length % 8 !== 0) throw new Error('Corrupted PFX file: invalid Triple DES block size');
  const k1 = desSubkeys(key.subarray(0, 8));
  const k2 = desSubkeys(key.subarray(8, 16));
  const k3 = key.length === 24 ? desSubkeys(key.subarray(16, 24)) : k1;
  const out = new Uint8Array(data.length);
  let prev = iv;
  for (let off = 0; off < data.length; off += 8) {
    const c = data.subarray(off, off + 8);
    const p = desBlock(desBlock(desBlock(c, k3, true), k2, false), k1, true);
    for (let k = 0; k < 8; k++) out[off + k] = p[k] ^ prev[k];
    prev = c;
  }
  return out;
}

// --- RC2 (RFC 2268) ---

// PITABLE de RFC 2268 §2: permutación de 0..255 derivada de los dígitos de pi
const RC2_PITABLE = Uint8Array.from(
  (
    'd978f9c419ddb5ed28e9fd794aa0d89dc67e37832b76538e624c6488448bfba2179a59f587b34f1361456d8d09817d32' +
    'bd8f40eb86b77b0bf09521225c6b4e8254d66593ce60b21c7356c014a78cf1dc1275ca1f3bbee4d1423dd430a33cb626' +
    '6fbf0eda4669075727f21d9bbc944303f811c7f690ef3ee706c3d52fc8661ed708e8eade8052eef784aa72ac354d6a2a' +
    '961ad2715a1549744b9fd05e0418a4ecc2e0416e0f51cbcc2491af50a1f47039997c3a8523b8b47afc02365b25559731' +
    '2d5dfa98e38a92ae05df2910676cbac9d300e6cfe19ea82c6316013f58e289a90d38341bab33ffb0bb480c5fb9b1cd2e' +
    'c5f3db47e5a59c770aa62068fe7fc1ad'
  )
    .match(/../g)!
    .map((h) => parseInt(h, 16))
);

function rc2ExpandKey(key: Uint8Array, effectiveBits: number): Uint16Array {
  const t = key.length;
  if (t < 1 || t > 128 || effectiveBits < 1 || effectiveBits > 1024) throw new Error('Invalid RC2 key');
  const l = new Uint8Array(128);
  l.set(key);
  for (let i = t; i < 128; i++) l[i] = RC2_PITABLE[(l[i - 1] + l[i - t]) & 0xff];
  const t8 = Math.ceil(effectiveBits / 8);
  const tm = 0xff >> (8 * t8 - effectiveBits);
  l[128 - t8] = RC2_PITABLE[l[128 - t8] & tm];
  for (let i = 127 - t8; i >= 0; i--) l[i] = RC2_PITABLE[l[i + 1] ^ l[i + t8]];
  const k = new Uint16Array(64);
  for (let i = 0; i < 64; i++) k[i] = l[2 * i] | (l[2 * i + 1] << 8);
  return k;
}

function rc2DecryptBlock(k: Uint16Array, block: Uint8Array): Uint8Array {
  const r = [0, 1, 2, 3].map((i) => block[2 * i] | (block[2 * i + 1] << 8));
  const s = [1, 2, 3, 5];
  let j = 63;
  const mixRound = () => {
    for (let i = 3; i >= 0; i--) {
      r[i] = ((r[i] >>> s[i]) | (r[i] << (16 - s[i]))) & 0xffff;
      r[i] = (r[i] - k[j] - (r[(i + 3) % 4] & r[(i + 2) % 4]) - (~r[(i + 3) % 4] & r[(i + 1) % 4])) & 0xffff;
      j--;
    }
  };
  const mashRound = () => {
    for (let i = 3; i >= 0; i--) r[i] = (r[i] - k[r[(i + 3) % 4] & 63]) & 0xffff;
  };
  for (let n = 0; n < 5; n++) mixRound();
  mashRound();
  for (let n = 0; n < 6; n++) mixRound();
  mashRound();
  for (let n = 0; n < 5; n++) mixRound();
  const out = new Uint8Array(8);
  for (let i = 0; i < 4; i++) {
    out[2 * i] = r[i] & 0xff;
    out[2 * i + 1] = r[i] >> 8;
  }
  return out;
}

/** Descifra RC2 en CBC con la longitud efectiva de clave dada (40 en pbeWithSHAAnd40BitRC2-CBC), sin quitar el relleno. */
export function rc2CbcDecrypt(key: Uint8Array, effectiveBits: number, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (iv.length !== 8 || data.length % 8 !== 0) throw new Error('Corrupted PFX file: invalid RC2 block size');
  const k = rc2ExpandKey(key, effectiveBits);
  const out = new Uint8Array(data.length);
  let prev = iv;
  for (let off = 0; off < data.length; off += 8) {
    const c = data.subarray(off, off + 8);
    const p = rc2DecryptBlock(k, c);
    for (let b = 0; b < 8; b++) out[off + b] = p[b] ^ prev[b];
    prev = c;
  }
  return out;
}
