import { describe, it, expect } from 'vitest';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { bmpPassword, pkcs12Kdf, rc2CbcDecrypt, sha1, sha256, stripPkcs7Padding, tripleDesCbcDecrypt } from './pkcs12Ciphers';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('Cifrados de PKCS#12 heredados en TypeScript puro (ADR-0058)', () => {
  it('el KDF de PKCS#12 (RFC 7292 B.2) da los mismos bytes que OpenSSL con SHA-1 y SHA-256', async () => {
    // Vectores obtenidos con `openssl kdf ... PKCS12KDF` (OpenSSL 3.5) sobre la contraseña en BMPString
    expect(toHex(bmpPassword('smeg'))).toBe('0073006d006500670000');
    expect(toHex(await pkcs12Kdf('SHA-1', bmpPassword('smeg'), hex('0a58cf64530d823f'), 1, 1, 24))).toBe(
      '8aaae6297b6cb04642ab5b077851284eb7128f1a2a7fbca3'
    );
    expect(toHex(await pkcs12Kdf('SHA-1', bmpPassword('smeg'), hex('0a58cf64530d823f'), 1, 2, 8))).toBe('79993dfe048d3b76');
    expect(toHex(await pkcs12Kdf('SHA-1', bmpPassword('queeg'), hex('05dec959acff72f7'), 1000, 1, 24))).toBe(
      'ed2034e36328830ff09df1e1a07dd357185dac0d4f9eb3d4'
    );
    expect(toHex(await pkcs12Kdf('SHA-256', bmpPassword('rea'), hex('0102030405060708'), 2048, 3, 32))).toBe(
      'd79ed52dd2f16a8e187da045bd68cf220f4ff1de98cdc1626728de6e18e78016'
    );
  });

  it('SHA-1 y SHA-256 síncronos dan lo mismo que node:crypto en todas las longitudes de relleno', () => {
    for (let len = 0; len <= 200; len++) {
      const msg = randomBytes(len);
      expect(toHex(sha1(new Uint8Array(msg)))).toBe(createHash('sha1').update(msg).digest('hex'));
      expect(toHex(sha256(new Uint8Array(msg)))).toBe(createHash('sha256').update(msg).digest('hex'));
    }
  });

  it('Triple DES CBC descifra lo mismo que cifra node:crypto (claves de 24 y de 16 bytes)', () => {
    for (const [alg, keyLen] of [['des-ede3-cbc', 24], ['des-ede-cbc', 16]] as const) {
      const key = randomBytes(keyLen);
      const iv = randomBytes(8);
      const plain = randomBytes(203);
      const c = createCipheriv(alg, key, iv);
      const cipher = new Uint8Array(Buffer.concat([c.update(plain), c.final()]));
      const out = stripPkcs7Padding(tripleDesCbcDecrypt(new Uint8Array(key), new Uint8Array(iv), cipher), 8);
      expect(toHex(out)).toBe(plain.toString('hex'));
    }
  });

  it('RC2 CBC cumple el vector de RFC 2268 y el de RC2-40 de OpenSSL', () => {
    // RFC 2268 §5: clave 88bca90e90875a7f0f79c384627bafb2, 128 bits efectivos, texto en claro cero
    expect(toHex(rc2CbcDecrypt(hex('88bca90e90875a7f0f79c384627bafb2'), 128, new Uint8Array(8), hex('2269552ab0f85ca6')))).toBe(
      '0000000000000000'
    );
    // `openssl enc -rc2-40-cbc -K 0102030405 -iv 0001020304050607 -nopad` sobre 00…00 11223344 55667788
    expect(toHex(rc2CbcDecrypt(hex('0102030405'), 40, hex('0001020304050607'), hex('811435a5bf3ea2f8cbb4a7cfc5a1b046')))).toBe(
      '00000000000000001122334455667788'
    );
  });

  it('un relleno PKCS#7 inválido se rechaza como contraseña incorrecta', () => {
    expect(toHex(stripPkcs7Padding(hex('4142430505050505'), 8))).toBe('414243');
    expect(() => stripPkcs7Padding(hex('4142430505050504'), 8)).toThrow(/Invalid certificate password/);
    expect(() => stripPkcs7Padding(hex('4142434445464700'), 8)).toThrow(/Invalid certificate password/);
  });
});
