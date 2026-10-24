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
| `src-tauri/icons/icon.ico` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `162F887BE0E5EF0F5ED61BAE14B51B0305CDA9325D70CFEF22D2CDC1DF1289DE` | Icono de aplicación para el ejecutable Windows de Tauri |
| `src-tauri/icons/pdfrev.ico` | pdfrev Contributors | Copia directa de `icon.ico` vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `162F887BE0E5EF0F5ED61BAE14B51B0305CDA9325D70CFEF22D2CDC1DF1289DE` | Icono multi-resolución para el instalador NSIS y accesos directos de Windows |
| `src-tauri/icons/icon.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `D9B4B145A64DEDD64B9BCF0175CFD84D8695C9ABD1D3D44C2C4FBDD026BDAF26` | Icono maestro 512x512 para empaquetado nativo |
| `src-tauri/icons/32x32.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `B7A8D39BF5202E6BC8EB60CB252330417788B017845E921445F9DD5125CB3960` | Icono 32x32 para barra de tareas |
| `src-tauri/icons/64x64.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `9BC455A351537AC876C45C43D6F09AE34F9C4756240DFECC147970EF752D0A18` | Icono 64x64 para menú contextual y pantallas de alta densidad |
| `src-tauri/icons/128x128.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `C4C9890710DE6BBACA7AFFDE56227D2DFE48525A05C93659E63176DF9FD2D1EB` | Icono 128x128 para empaquetado Linux/macOS |
| `src-tauri/icons/128x128@2x.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `F21902BA7B97AD2B6298669F8539F21AF37356F889B0E6A96B6A124402FA23E6` | Icono 256x256 Retina para macOS |
| `src-tauri/icons/icon.icns` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `711C4B02F5497283EE00925860545921A51A649D45B22137593C27FACE93F82E` | Formato ICNS para macOS bundle |
| `src-tauri/icons/StoreLogo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `A0BD3DA304B7C050523A9E1F51000D405F56D7434A690E65C4738DC129E5D46D` | Icono para manifiesto de Windows Store / MSIX |
| `src-tauri/icons/Square30x30Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `21122435DDB89A0405C591277905FA76A30ABE9652C42932465CF542DAA30C98` | Icono cuadrado para tiles de Windows |
| `src-tauri/icons/Square44x44Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `BA1CD8759C07AA4CD23724B423AB9EBD61D474BFBD61103D76EA2080D276EDC6` | Icono cuadrado para lista de aplicaciones de Windows |
| `src-tauri/icons/Square71x71Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `DC70B7B5D8638ECD1B918983A83C62CA47A629780D76FFD18AB37A9420FC4ADB` | Icono para Windows app tiles |
| `src-tauri/icons/Square89x89Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `F652C6751E84DD68BD8E41B953CB3DC7D2F14218F99A82E309CB8C9A33C9E18F` | Icono para Windows app tiles |
| `src-tauri/icons/Square107x107Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `986B500388B218CE3A700668BC2A58C90952BDE9B8796BF27E667423A52F7023` | Icono para Windows app tiles |
| `src-tauri/icons/Square142x142Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `69012E6303DBA2703DBF2FFE0567960BFC4AC2816C4DFF710EC75C9F1489E546` | Icono para Windows app tiles |
| `src-tauri/icons/Square150x150Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `3016D15A0D718CBE2784A85671B5CB1251AED94693FAD91502AE2D917569FA27` | Icono para Windows app tiles |
| `src-tauri/icons/Square284x284Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `C51B4D9C0B118020646E862A79223B1A9C60648C818607AB44BE6EC5D8561D55` | Icono para Windows app tiles |
| `src-tauri/icons/Square310x310Logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `229EBC0ADE51EB159090A7C0064511EF9FC26AAC6D242B4853AF1A71535B9408` | Icono para Windows app tiles |
| `src-tauri/nsis-header.bmp` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `AC3C7A67D9389A97E5D5724D3BBB362516F2D008BFF8D1CAD00CD785DBC30B2C` | Banner de cabecera para el instalador NSIS de Windows |
| `src-tauri/nsis-sidebar.bmp` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `D21E95EFCFF0DB19DBF1202AEE0C122228D4B3EB83695DF85475A6E8D1CE60C9` | Banner lateral para el instalador NSIS de Windows |
| `docs/assets/logo.png` | pdfrev Contributors | Generado deterministamente vía `scripts/generate-brand-icons.mjs` | MIT / Propia del proyecto | `D9B4B145A64DEDD64B9BCF0175CFD84D8695C9ABD1D3D44C2C4FBDD026BDAF26` | Logotipo oficial de alta resolución para documentación y README |
| `docs/assets/screenshot-dark.png` | pdfrev Contributors | Capturado de la ventana nativa mediante `scripts/native-smoke.mjs` | MIT / Propia del proyecto | `8F1A74D229564F3C41DF90CEC856CECD62BE2FFA14611E633CEDF7F095B70F36` | Captura de pantalla oficial en modo oscuro con tema de ingeniería |
| `docs/assets/screenshot-light.png` | pdfrev Contributors | Capturado de la ventana nativa mediante `scripts/native-smoke.mjs` | MIT / Propia del proyecto | `2521F56970385A074DF2F48F503BD2373A7D299D5CD07392A7FB1CFB882D6022` | Captura de pantalla oficial en modo claro con tema plano |
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
