# ATTRIBUTION.md — Inventario de Activos y Licencias

Este documento es la **fuente única de verdad** sobre los activos no-código incorporados, distribuidos o generados en este repositorio, conforme a la política absoluta de activos establecida en `AGENTS.md` (§1).

**Regla estricta:** Todo activo debe contar con una fila explícita que documente su ruta, autor, origen, licencia demostrable, hash criptográfico SHA-256 y caso de uso. **Un activo sin fila o sin licencia demostrable no entra al repositorio.**

---

## 1. Inventario de Activos

| Ruta | Autor | Origen (URL / Script) | Licencia | SHA-256 | Uso |
|---|---|---|---|---|---|
| `fixtures/test-blueprint.pdf` | pdfrev Contributors | Generado deterministamente vía `scripts/make-fixture.ts` | MIT / Propia del proyecto | `868ACBDC038920C0C0D37E5037D46F5B29280B3DB2D0D7F37D0B3A44E99AE231` | Plano sintético de 3 páginas (800x600 pt) para calibración y pruebas E2E/Vitest (página 3 sin texto) |
| `public/fixtures/test-blueprint.pdf` | pdfrev Contributors | Copia estática servida por Vite desde `scripts/make-fixture.ts` | MIT / Propia del proyecto | `868ACBDC038920C0C0D37E5037D46F5B29280B3DB2D0D7F37D0B3A44E99AE231` | Fixture servido al WebView en modo desarrollo y tests Playwright |
| `fixtures/test-blueprint.meta.json` | pdfrev Contributors | Generado en tándem por `scripts/make-fixture.ts` | MIT / Propia del proyecto | `9E7F8E504C68251E6DAF70691865044E5A17C645A781504171AAB793C06F48A6` | Metadatos y rectángulo de control conocido (coordenadas PDF y normalizadas) |
| `public/fixtures/test-blueprint.meta.json` | pdfrev Contributors | Copia estática servida por Vite desde `scripts/make-fixture.ts` | MIT / Propia del proyecto | `9E7F8E504C68251E6DAF70691865044E5A17C645A781504171AAB793C06F48A6` | Metadatos del plano servidos para comprobaciones en frontend |
| `fixtures/test-blueprint.bbx.json` | pdfrev Contributors | Serialización del fixture en formato `.bbx.json` 1.1.0 | MIT / Propia del proyecto | `F2977D6BD4392E78678C047B623B4EC8F0B871C5C9A672C60EFE20ABCD976EE8` | Archivo de anotaciones de prueba con marca de calibración |
| `fixtures/test-blueprint-rotated.pdf` | pdfrev Contributors | Generado deterministamente vía `scripts/make-fixture.ts` | MIT / Propia del proyecto | `73CA04D87B1D9A2BAFFEF9E7C2716F9BAA0508BA3917479ECC84F80FBC7A8C03` | Plano sintético con rotación intrínseca de 90° para validar Sub-entregable 0.5 |
| `fixtures/test-blueprint-rotated.meta.json` | pdfrev Contributors | Generado en tándem por `scripts/make-fixture.ts` | MIT / Propia del proyecto | `1A466BDDE480B3907625EE6DD46FE3936FE7E392A7B4167DB96880EFBC4D74FD` | Metadatos del plano rotado (rotation=90, dimensiones físicas y normalizadas) |
| `fixtures/large-blueprint-e-size.pdf` | pdfrev Contributors | Generado deterministamente vía `scripts/make-large-fixtures.ts` (ADR-0088 / Hito D.1) | MIT / Propia del proyecto | `F87C2124A78073636E1E323A138E7BA3A1CA80B5FB024C1D799D113660C4AAF6` | Plano sintético E-Size (3600x2400 pt) con trazos vectoriales para el banco de pruebas de rendimiento |
| `fixtures/large-blueprint-e-size.meta.json` | pdfrev Contributors | Generado en tándem por `scripts/make-large-fixtures.ts` | MIT / Propia del proyecto | `B6D9CA54BEC85AF96D79FE84E5B595DDC053AD15F47969FFFFF1D235A124F949` | Metadatos del plano E-size (dimensiones 3600x2400 pt, 5 000 marcas, semilla PRNG 42) |
| `fixtures/large-blueprint-e-size.bbx.json` | pdfrev Contributors | Serialización del fixture en formato `.bbx.json` con 5 000 marcas sintéticas (generado bajo demanda vía `npx tsx scripts/make-large-fixtures.ts`) | MIT / Propia del proyecto | `5E53879255E5A67F3F699C01840C0496925E54F941040E72BEBEB426D3D2B977` | Archivo de anotaciones de prueba con 5 000 marcas para benchmarking de hit-testing y guardado |
| `src-tauri/icons/icon.ico` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `A5C3DE5DB3F9BA69B5D3ABBB3C2E7B54CE6F9384BB197D6D8768719384FE045F` | Icono de aplicación para el ejecutable Windows de Tauri |
| `src-tauri/icons/pdfrev.ico` | pdfrev Contributors | Copia directa de `icon.ico` vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `A5C3DE5DB3F9BA69B5D3ABBB3C2E7B54CE6F9384BB197D6D8768719384FE045F` | Icono multi-resolución para el instalador NSIS y accesos directos de Windows |
| `src-tauri/icons/icon.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `58F904F9C6DA73130227E9E4093CC65023CE60A74E010554994F49F988F295C9` | Icono maestro 512x512 para empaquetado nativo |
| `src-tauri/icons/32x32.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `9A7479E0C52D94FF13FA3D883C5D34A5EB30DB7146E4AA4AC14992FDB132AC72` | Icono 32x32 para barra de tareas |
| `src-tauri/icons/64x64.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `EE7644E43ADADF3EA9FC1175C3FF8275D69605E5F82706A10B440C4263A4F83C` | Icono 64x64 para menú contextual y pantallas de alta densidad |
| `src-tauri/icons/128x128.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `F837A8FF451A8C66F12D75293D3B9A65D077C8CC685EA15EEC7F729E388D859D` | Icono 128x128 para empaquetado Linux/macOS |
| `src-tauri/icons/128x128@2x.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `F6FD58ACB2F229B55E4FA347FCAD2A19399A8E36EF48909F97A7FB55A85889B1` | Icono 256x256 Retina para macOS |
| `src-tauri/icons/icon.icns` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `BFC121A5206E14F267082C9F5524233E9A97C5A88064281F395B840D8590DC65` | Formato ICNS para macOS bundle |
| `src-tauri/icons/StoreLogo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `ADA37DF64FA1B85074FF505A4D3246ABF741E8A2DD1FE9C46BB4B69CA2FEDEBB` | Icono para manifiesto de Windows Store / MSIX |
| `src-tauri/icons/Square30x30Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `CE02B1D7522F390DD7777222BCB42253223141C9EF2CEFCBA80BF427CD62D166` | Icono cuadrado para tiles de Windows |
| `src-tauri/icons/Square44x44Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `CA87BBD935E887768D284C8DE31AA9AFE84053FB345548C98E3F1D3E6B2A85B4` | Icono cuadrado para lista de aplicaciones de Windows |
| `src-tauri/icons/Square71x71Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `49D3EDEDA49D6BDD436FDCD461486A267A78FF33990F1073A742CC2CD4D060F6` | Icono para Windows app tiles |
| `src-tauri/icons/Square89x89Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `28048BAF496921832107B2A0C39975AABFB006277BFA8DF1B5E940BC6F017E4C` | Icono para Windows app tiles |
| `src-tauri/icons/Square107x107Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `C904955F3D4BB3A2DDBBF416808A14232D5B6024F018814459D24862CDD224F5` | Icono para Windows app tiles |
| `src-tauri/icons/Square142x142Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `499981FF24A71FC340F1E95882250FA8C93AB881367751DEBCFCA9CDCE44AA66` | Icono para Windows app tiles |
| `src-tauri/icons/Square150x150Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `25F64DB3692AFD6D732F6336CD2B49AFD0F1FDE857172EAE70D942A4E3A89859` | Icono para Windows app tiles |
| `src-tauri/icons/Square284x284Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `DB846E1E3BF507DC179CE8CA31CA89C0988D5C16987534B8A1DD2711E03BAE56` | Icono para Windows app tiles |
| `src-tauri/icons/Square310x310Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `ACEF2EC46A38296F2E7A5F3A61A0D62BC206B8A14D8FD06458429D3B8236BDF9` | Icono para Windows app tiles |
| `src-tauri/nsis-header.bmp` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-nsis-assets.mjs` | MIT / Propia del proyecto | `3A50247F385092F2EDBD68A85E320956347AB5507AD23501C2DB89D0BD321DC2` | Banner de cabecera blanco puro para el instalador NSIS de Windows |
| `src-tauri/nsis-sidebar.bmp` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-nsis-assets.mjs` | MIT / Propia del proyecto | `7020B498A18C3863927B220B0A3E8F70B45E0A9FFF70D1B9CD221B0D535180DC` | Banner lateral de alta definición (3x) para el instalador NSIS de Windows |
| `docs/assets/logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `58F904F9C6DA73130227E9E4093CC65023CE60A74E010554994F49F988F295C9` | Logotipo oficial de alta resolución para documentación y README |
| `docs/assets/screenshot-dark.png` | pdfrev Contributors | Capturado de la ventana nativa mediante `scripts/generate-clean-screenshots.mjs` | MIT / Propia del proyecto | `DBB5274A0052670D12741483173653B1EF9D6D805B3E56A75126FBFE2ABABAAD` | Captura de pantalla oficial en modo oscuro con tema de ingeniería |
| `docs/assets/screenshot-light.png` | pdfrev Contributors | Capturado de la ventana nativa mediante `scripts/generate-clean-screenshots.mjs` | MIT / Propia del proyecto | `A4E553D12DB07C9B14D51182C7A6722710E1FFF039AFBF8081990B5D02ECAC9B` | Captura de pantalla oficial en modo claro con tema plano |
| `src/assets/fonts/IBMPlexSans-Regular.woff2` | IBM Corp. (IBM Plex) | npm `@ibm/plex-sans@1.1.0` (`fonts/complete/woff2/`), publicado desde https://github.com/ibm/plex, commit `1da12f02587b630c07e92692d21492d722f53614` | OFL-1.1 | `BA711A3085FF9F27440B6B9C4550CFC47C97BF36591D5DA958B975BB3ADD8C1A` | Tipografía de interfaz, peso 400 (ADR-0065); nunca entra en los PDF |
| `src/assets/fonts/IBMPlexSans-Medium.woff2` | IBM Corp. (IBM Plex) | npm `@ibm/plex-sans@1.1.0` (`fonts/complete/woff2/`), publicado desde https://github.com/ibm/plex, commit `1da12f02587b630c07e92692d21492d722f53614` | OFL-1.1 | `5660F8A658F8BB50DBC005232F885EADFFD2BC1C235C4F6FBB63469D1F9CDE6D` | Tipografía de interfaz, peso 500 (ADR-0065) |
| `src/assets/fonts/IBMPlexSans-SemiBold.woff2` | IBM Corp. (IBM Plex) | npm `@ibm/plex-sans@1.1.0` (`fonts/complete/woff2/`), publicado desde https://github.com/ibm/plex, commit `1da12f02587b630c07e92692d21492d722f53614` | OFL-1.1 | `F78048030EAB62E860EFA39A0DF79E2E5581BF122EB95B9BC42C0B8A4988D205` | Tipografía de interfaz, peso 600 (ADR-0065) |
| `src/assets/fonts/IBMPlexSans-LICENSE.txt` | IBM Corp. (IBM Plex) | npm `@ibm/plex-sans@1.1.0` (`fonts/complete/woff2/`), publicado desde https://github.com/ibm/plex, commit `1da12f02587b630c07e92692d21492d722f53614` (`LICENSE.txt`) | OFL-1.1 | `7E6B2818EDBD8F6A01AE80641CC8F16A51080D08FB4E532BE3A0B6F74ADB07DA` | Texto de la licencia OFL-1.1 que acompaña a IBM Plex Sans |
| `src/assets/fonts/IBMPlexMono-Regular.woff2` | IBM Corp. (IBM Plex) | npm `@ibm/plex-mono@2.5.0` (`fonts/complete/woff2/`), publicado desde https://github.com/ibm/plex, commit `2f9ba1b25957d958db71a849e85d72e3ecfb845a` | OFL-1.1 | `BA204497F16B6D334CEE9D1E963A831B73E3A56E1D6300A8489D18DF7214B350` | Datos de la interfaz (coordenadas, medidas, escalas, zoom, cifras), peso 400 (ADR-0065) |
| `src/assets/fonts/IBMPlexMono-Medium.woff2` | IBM Corp. (IBM Plex) | npm `@ibm/plex-mono@2.5.0` (`fonts/complete/woff2/`), publicado desde https://github.com/ibm/plex, commit `2f9ba1b25957d958db71a849e85d72e3ecfb845a` | OFL-1.1 | `33FAF307FA6031FB4062276D7320A6D632DE890CBB347576FD80CFA01077BC25` | Datos de la interfaz, peso 500 (ADR-0065) |
| `src/assets/fonts/IBMPlexMono-LICENSE.txt` | IBM Corp. (IBM Plex) | npm `@ibm/plex-mono@2.5.0` (`fonts/complete/woff2/`), publicado desde https://github.com/ibm/plex, commit `2f9ba1b25957d958db71a849e85d72e3ecfb845a` (`LICENSE.txt`) | OFL-1.1 | `7E6B2818EDBD8F6A01AE80641CC8F16A51080D08FB4E532BE3A0B6F74ADB07DA` | Texto de la licencia OFL-1.1 que acompaña a IBM Plex Mono |

---

## 2. Dependencias de Activos en Paquetes Externos

- **Iconografía Vectorial en UI (`lucide-react`):**
  - **Autor:** Lucide Contributors.
  - **Origen:** https://github.com/lucide-icons/lucide
  - **Licencia:** ISC License (`https://github.com/lucide-icons/lucide/blob/main/LICENSE`).
  - **Uso:** Iconos SVG renderizados como componentes React en la barra de herramientas (`TopBar.tsx`), miniaturas (`ThumbnailsSidebar.tsx`) y tabla técnica (`MarkupsList.tsx`).
- **Simulador en Memoria de IndexedDB para Pruebas Unitarias (`fake-indexeddb`):**
  - **Autor:** Jeremy Scheff (dumbmatter) y colaboradores.
  - **Origen:** https://github.com/dumbmatter/fakeIndexedDB
  - **Licencia:** Apache-2.0 (`https://github.com/dumbmatter/fakeIndexedDB/blob/master/LICENSE.md`).
  - **Uso:** Implementación pura en JavaScript de la API de IndexedDB utilizada como `devDependency` en Vitest para ejecutar flujos reales de IndexedDB (`onupgradeneeded`, transacciones ACID, almacenes de objetos, cursores e índices) sin depender de un navegador real ni caer en mocks simplistas con mapas en memoria.

---

## 3. Tipografías

- **Fuentes del Sistema:** La aplicación utiliza pilas tipográficas estándar del sistema operativo a través de clases Tailwind CSS (`ui-sans-serif, system-ui, sans-serif, monospace`). No se incluye ni distribuye ningún archivo de fuente web (`.woff`, `.woff2`, `.ttf`, `.otf`) en el repositorio.
- **Exportación PDF:** Se utilizan exclusivamente las 14 fuentes estándar de PDF (Helvetica / WinAnsiEncoding provista nativamente por `pdf-lib` y especificación ISO 32000), sin incrustación de binarios tipográficos externos.
