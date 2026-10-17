# ATTRIBUTION.md — Inventario de Activos y Licencias

Este documento es la **fuente única de verdad** sobre los activos no-código incorporados, distribuidos o generados en este repositorio, conforme a la política absoluta de activos establecida en `AGENTS.md` (§1).

**Regla estricta:** Todo activo debe contar con una fila explícita que documente su ruta, autor, origen, licencia demostrable, hash criptográfico SHA-256 y caso de uso. **Un activo sin fila o sin licencia demostrable no entra al repositorio.**

---

## 1. Inventario de Activos

| Ruta | Autor | Origen (URL / Script) | Licencia | SHA-256 | Uso |
|---|---|---|---|---|---|
| `fixtures/test-blueprint.pdf` | Equipo REA | Generado deterministamente vía `scripts/make-fixture.ts` | MIT / Propia del proyecto | `868ACBDC038920C0C0D37E5037D46F5B29280B3DB2D0D7F37D0B3A44E99AE231` | Plano sintético de 3 páginas (800x600 pt) para calibración y pruebas E2E/Vitest (página 3 sin texto) |
| `public/fixtures/test-blueprint.pdf` | Equipo REA | Copia estática servida por Vite desde `scripts/make-fixture.ts` | MIT / Propia del proyecto | `868ACBDC038920C0C0D37E5037D46F5B29280B3DB2D0D7F37D0B3A44E99AE231` | Fixture servido al WebView en modo desarrollo y tests Playwright |
| `fixtures/test-blueprint.meta.json` | Equipo REA | Generado en tándem por `scripts/make-fixture.ts` | MIT / Propia del proyecto | `9E7F8E504C68251E6DAF70691865044E5A17C645A781504171AAB793C06F48A6` | Metadatos y rectángulo de control conocido (coordenadas PDF y normalizadas) |
| `public/fixtures/test-blueprint.meta.json` | Equipo REA | Copia estática servida por Vite desde `scripts/make-fixture.ts` | MIT / Propia del proyecto | `9E7F8E504C68251E6DAF70691865044E5A17C645A781504171AAB793C06F48A6` | Metadatos del plano servidos para comprobaciones en frontend |
| `fixtures/test-blueprint.bbx.json` | Equipo REA | Serialización del fixture en formato `.bbx.json` 1.1.0 | MIT / Propia del proyecto | `F2977D6BD4392E78678C047B623B4EC8F0B871C5C9A672C60EFE20ABCD976EE8` | Archivo de anotaciones de prueba con marca de calibración |
| `fixtures/test-blueprint-rotated.pdf` | Equipo REA | Generado deterministamente vía `scripts/make-fixture.ts` | MIT / Propia del proyecto | `73CA04D87B1D9A2BAFFEF9E7C2716F9BAA0508BA3917479ECC84F80FBC7A8C03` | Plano sintético con rotación intrínseca de 90° para validar Sub-entregable 0.5 |
| `fixtures/test-blueprint-rotated.meta.json` | Equipo REA | Generado en tándem por `scripts/make-fixture.ts` | MIT / Propia del proyecto | `1A466BDDE480B3907625EE6DD46FE3936FE7E392A7B4167DB96880EFBC4D74FD` | Metadatos del plano rotado (rotation=90, dimensiones físicas y normalizadas) |
| `src-tauri/icons/icon.ico` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `E38CA88E1D5490F3DCBC3C3FA525F7FCB7B80FFF3CB2F3A4EB1B2D018C0915C1` | Icono de aplicación para el ejecutable Windows de Tauri |
| `src-tauri/icons/icon.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `6413BFE9D546E5225FC9256A0ECEC48DF3A1272EA4BDC91C15B8E000222A95D3` | Icono maestro 512x512 para empaquetado nativo |
| `src-tauri/icons/32x32.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `AAA96D0C53B756B77C7F46AEB72290F42256C786C69BE68F6BCDEB9C7492A48E` | Icono 32x32 para barra de tareas |
| `src-tauri/icons/128x128.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `EEEBF55D8FFE07348786B9057AF253E3CA08C56B6A8F8893826381430E3C0B7B` | Icono 128x128 para empaquetado Linux/macOS |
| `src-tauri/icons/128x128@2x.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `2998B41D0C9278B08E8B3874E094920034FE983A46053C9D62764225F58AB7B0` | Icono 256x256 Retina para macOS |
| `src-tauri/icons/icon.icns` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `1535D355994F8EE82DA91384D2A29E04D5B4440F3E6051B5C8B06E7A62283693` | Formato ICNS para macOS bundle |
| `src-tauri/icons/StoreLogo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `9F84D0CE09DF51BAC0A4855042B3E49B190CC2B9761CD5EAB61EBEC5CD343820` | Icono para manifiesto de Windows Store / MSIX |
| `src-tauri/icons/Square30x30Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `68BC1B585F5685E0922F14B1CA7EB2D618213C684C89E759C6A5EB8578C3FE8D` | Icono cuadrado para tiles de Windows |
| `src-tauri/icons/Square44x44Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `C46208286B1EA1B4841B714972F3CB0A8ABC6D3BFA71A29238F7B4D62F511F89` | Icono cuadrado para lista de aplicaciones de Windows |
| `src-tauri/icons/Square71x71Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `CB0EA93CBD13509D32C6BC06DA71687E73D673D166FDE91B23061771ABE16B86` | Icono para Windows app tiles |
| `src-tauri/icons/Square89x89Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `2208DA1D741A20E902A59D7C39A5E58AF74EC823DB13113BF8AC6F555FA25BCA` | Icono para Windows app tiles |
| `src-tauri/icons/Square107x107Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `33446A858D982A529554E562114673F8B15620588137CF0BF6C56A7441C78CD7` | Icono para Windows app tiles |
| `src-tauri/icons/Square142x142Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `633D6DBA504FAA844B309E01272386E4523CDDD4A3639C77C0EB5D2CE3EAC752` | Icono para Windows app tiles |
| `src-tauri/icons/Square150x150Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `D90061AD71E6F5882B759D80CF58CC16AA5021FA29BA4B2614ADEA982A4D7EE5` | Icono para Windows app tiles |
| `src-tauri/icons/Square284x284Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `5FEAA4F18F404843551756DD2791D7654EF471B6B007767AE40F60C7AEBCAD5B` | Icono para Windows app tiles |
| `src-tauri/icons/Square310x310Logo.png` | Tauri Contributors | Template `create-tauri-app` (https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT | `5DF8D779AB57C63EE06ED237B94C3C0954711E88117DCCFA72B2AEC5D83B0D80` | Icono para Windows app tiles |
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
