# ADR-0058: La firma sobrevive a los guardados posteriores y REA abre los .pfx de otras herramientas

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Corrige:** ADR-0056 (firma con certificado PKCS#12)

## 1. Contexto

La revisión del 2026-10-16 encontró dos defectos en ADR-0056:

1. **Volver a guardar rompía la firma.** `saveIncrementalMarkups` retira de `/Annots` toda anotación con `/REA` y la
   reescribe desde el modelo. El widget de firma lleva `/REA`, así que en el guardado siguiente se reescribía.
   `widgetFieldEntries` no escribe `/V` para el tipo `signature`, de modo que el campo quedaba sin firmar y el `/Type /Sig`
   huérfano. `updateAcroForm` también lo sacaba de `/Fields`. Un widget `/FT /Sig` firmado en otra aplicación sufría lo
   mismo: se reescribía en su mismo número de objeto (`foreignWidgetObjNum`) sin `/V`.
   Además, `verifyPdfSignature` exigía que el `/ByteRange` llegara al final del archivo. Por eso ninguna firma validaba
   tras una revisión incremental posterior.
2. **Solo se abrían los .pfx de REA.** `parsePfxCertificate` recorría el árbol buscando bolsos en claro. No descifraba los
   SafeContents en `encryptedData` (1.2.840.113549.1.7.6), que es donde Windows, OpenSSL y Acrobat guardan el certificado.
   Tampoco admitía `pbeWithSHAAnd3-KeyTripleDES-CBC` ni `pbeWithSHAAnd40BitRC2-CBC`, que dependen del KDF de PKCS#12
   (RFC 7292, apéndice B). `createSelfSignedPfx` no escribía `macData`, y Windows o Acrobat pueden rechazar un PFX sin MAC.

## 2. Decisión

### 2.1 Campos de firma firmados: se conservan tal cual

- `isSignedSignatureField(dict)` (`incrementalWriter.ts`) reconoce un campo `/FT /Sig` con `/V` de diccionario, propio o
  heredado del `/Parent`.
- Antes de escribir, `saveIncrementalMarkups` busca esos widgets en todas las páginas. Las marcas que les corresponden
  (por `/NM`, por referencia o por `foreignWidgetObjNum`) **no se escriben**: no generan `/AP`, `/OCG` ni estado de revisión.
  El widget se queda en `/Annots` con su objeto original, aunque el id venga en `importedIds`.
- `updateAcroForm` mantiene el campo firmado en `/Fields` aunque lleve `/REA`. `/SigFlags 3` se conserva porque se
  reescribe el mismo diccionario `/AcroForm`.
- La marca firmada está bloqueada. Si llega movida o con otro estilo, el cambio se ignora; el PDF manda.
  Un campo firmado tampoco se puede quitar desde REA: la firma pertenece al documento (`AppendOnly`).
- `signPdfWithCertificate` rechaza firmar otra vez un campo ya firmado.
- `validateSavedPdf` cuenta también el widget firmado ajeno sin `/REA`, con la misma clave que usa el lector.
- `verifyPdfSignature` acepta un `/ByteRange` que termine antes del final del archivo: la firma cubre su revisión.
  Devuelve `coversWholeDocument: false` cuando hay revisiones posteriores.

### 2.2 PKCS#12 de otras herramientas

- **Parser estructurado** (`parsePfxCertificate`): `PFX → AuthenticatedSafe → ContentInfo` de tipo `data` o
  `encryptedData` → `SafeContents` (con `safeContentsBag` anidados). Lee `certBag` X.509, `keyBag` y
  `pkcs8ShroudedKeyBag`.
  - El certificado de la clave se elige por `localKeyId`. Si no hay coincidencia, se toma el único certificado o el que
    comparte el módulo RSA con la clave (cadenas con la CA).
  - `envelopedData` y el modo de integridad por clave pública dan un error explícito.
- **BER:** `berToDer` normaliza longitudes indefinidas y OCTET STRING construidos (llavero de macOS, Java).
- **macData:** se verifica antes de descifrar. Admite SHA-1, SHA-256, SHA-384 y SHA-512 con el KDF de PKCS#12 (id 3).
  - Con contraseña vacía prueba las dos codificaciones habituales.
  - PBMAC1 (RFC 9579) da un error explícito.
  - Un PFX sin MAC (los de ADR-0056) sigue abriendo.
- **Cifrados** (`pkcs12Ciphers.ts`, TypeScript puro y sin dependencias, porque WebCrypto no tiene 3DES ni RC2):
  - KDF de PKCS#12 (RFC 7292 B.2) con SHA-1 y SHA-256 síncronos propios (FIPS 180-4); SHA-384/512 usan
    `crypto.subtle.digest`. El KDF encadena miles de resúmenes, y con una promesa por resumen un .pfx heredado tardaba
    segundos en abrir (y agotaba el tiempo de las pruebas con la suite en paralelo). Con los síncronos tarda milisegundos.
  - Las iteraciones se limitan a 1 000 000, para que un archivo hostil no bloquee el diálogo.
  - Triple DES EDE-CBC (claves de 24 y 16 bytes), solo descifrado.
  - RC2-CBC con longitud efectiva de clave (RFC 2268), solo descifrado. Son unas 60 líneas más la PITABLE, así que cabe.
  - Algoritmos admitidos: `pbeWithSHAAnd3-KeyTripleDES-CBC`, `2-KeyTripleDES-CBC`, `128BitRC2-CBC` y `40BitRC2-CBC`.
  - PBES2 con PBKDF2 (HMAC-SHA1 por defecto, como manda RFC 8018, o SHA-256/384/512) y AES-128/256-CBC o DES-EDE3-CBC.
    Antes, la ausencia de PRF se leía como SHA-256; ahora es SHA-1.
- **Al crear** (`createSelfSignedPfx`):
  - `macData` con HMAC-SHA256: 2048 iteraciones y sal de 16 bytes.
  - En los dos bolsos, `localKeyId` (SHA-1 del certificado) y `friendlyName` (BMPString con el nombre común).
    Con ellos Windows y Acrobat emparejan la clave con su certificado.
- `digitalSignature.ts` y `pkcs12Ciphers.ts` siguen cargándose bajo demanda (`SignDocumentModal` con `React.lazy`). El bundle
  principal no crece.

### 2.3 Fuera de alcance

- Las claves ECDSA siguen sin admitirse (error explícito, como en ADR-0056).
- Tampoco se admiten PBMAC1, AES-192 (WebView2 no lo implementa en WebCrypto) ni `envelopedData`.
- El MAC del PFX que crea REA es HMAC-SHA256. Windows anterior a 10 1709 solo acepta SHA-1, y no se ofrece.

## 3. Verificación

- `src/core/pdf/digitalSignature.test.ts`:
  - `volver a guardar un PDF firmado con otra marca conserva el widget firmado con su objeto y /V, y la firma sigue válida`:
    - se firma, se vuelve a guardar con otra marca y con la firmada movida y recoloreada, y luego una tercera vez;
    - `verifyPdfSignature` valida la primera firma;
    - el widget es el mismo objeto, con `/V /Type /Sig`, `/Rect` original y presencia en `/Fields`;
    - la nueva revisión no contiene ese objeto, y firmar otra vez el campo se rechaza.
  - `un campo de firma firmado en otra aplicación (sin /REA) se conserva tal cual al guardar desde REA`.
  - `abre los .pfx de OpenSSL: RC2-40 y 3DES con MAC SHA-1, solo 3DES, y PBES2/AES-256 en encryptedData con MAC SHA-256 y cadena de CA`:
    - usa tres .pfx creados por nosotros con OpenSSL 3.5.8, con claves desechables, en `src/core/pdf/testdata/opensslPfx.ts`;
    - el certificado elegido se compara con la huella SHA-256 que da OpenSSL, y la clave firma un PDF que valida.
  - `abre un .pfx codificado en BER, con longitudes indefinidas y el AuthenticatedSafe en OCTET STRING por trozos`
    (sintetizado en el test).
  - `el .pfx que crea REA lleva macData HMAC-SHA256 y localKeyId; un byte alterado se rechaza y los .pfx sin MAC siguen abriendo`:
    el MAC se recalcula con `createHmac` de `node:crypto`.
- `src/core/pdf/pkcs12Ciphers.test.ts`:
  - `el KDF de PKCS#12 (RFC 7292 B.2) da los mismos bytes que OpenSSL con SHA-1 y SHA-256`.
  - `SHA-1 y SHA-256 síncronos dan lo mismo que node:crypto en todas las longitudes de relleno`.
  - `Triple DES CBC descifra lo mismo que cifra node:crypto (claves de 24 y de 16 bytes)`.
  - `RC2 CBC cumple el vector de RFC 2268 y el de RC2-40 de OpenSSL`.
  - `un relleno PKCS#7 inválido se rechaza como contraseña incorrecta`.
- Cada prueba puede fallar:
  - si `isSignedSignatureField` siempre devuelve `false`, fallan las dos pruebas de guardado;
  - si se salta la verificación del MAC, falla la del byte alterado.
- Comprobación manual con OpenSSL 3.5.8 del .pfx que crea REA (contraseña no ASCII leída de archivo UTF-8):
  - `openssl pkcs12 -info` muestra `MAC: sha256, Iteration 2048` y los dos bolsos con `localKeyID` y `friendlyName`;
  - con `-nodes` exporta la clave privada;
  - con otra contraseña responde `Mac verify error: invalid password?`.
- Pendiente del usuario: importar en Windows (certmgr) y en Acrobat un .pfx creado por REA, abrir en REA un .pfx exportado
  desde Windows y Acrobat, y comprobar en Acrobat/Revu que un PDF firmado y guardado de nuevo en REA muestra la firma válida.
