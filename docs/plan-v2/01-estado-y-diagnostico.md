# 01 — Estado real y diagnóstico (base del plan)

> Todo lo marcado **[V]** fue **verificado en disco** el 2026-10-10 (lectura de archivos, `git`, ejecución de
> `vitest`). Lo marcado **[U]** lo **reportó el usuario** y no lo verifiqué. Lo marcado **[H]** es hipótesis o
> inferencia mía. Un agente que continúe debe **re-verificar** lo que vaya a usar (el árbol cambia).

---

## 1. Método y límites de esta auditoría

**Qué hice:** leí `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `docs/STATUS.md`, `docs/SCOPE.md`, `PARITY.md`, los 8
ADR (cabeceras), `git log` completo, el diff de `P2-C.2`, `package.json`, `src-tauri/{Cargo.toml,src/lib.rs,
tauri.conf.json,capabilities}`, y partes de `src/types/markup.ts`, `src/services/{pdfService,pdfExportService,
fileDialogService}.ts`, `src/core/markup/render.ts`, `src/components/PdfViewer.tsx`, `src/hooks/useAutoSave.ts`,
`src/utils/markupFilterSort.ts`, `scripts/{verify,parity-check}.mjs`, `tests/e2e/pdf-viewer.spec.ts` (test C.2).
Ejecuté `vitest` (todo verde con los cambios de C.2 presentes) y `scripts/parity-check.mjs` (OK).

**Qué NO hice:** no corrí E2E (el puerto 1421 estaba ocupado por otra sesión y `reuseExistingServer:false`), ni
`cargo test`, ni `verify.mjs` completo, ni la app nativa, ni abrí nada en Revu/Acrobat. No leí a fondo
`coordinates.ts`, `PdfViewer.tsx` completo, `toolChestService.ts`, ni el código Rust fuera de `lib.rs`.

## 2. Instantánea del repositorio

- **[V]** Rama `master`, HEAD `d310a87` ("feat(p2-c.2): menu contextual de estados tecnicos…"), sobre
  `d3b8d55` (C.1) y `dc4a4df` (P2-X). 46+ commits entre 2026-10-09 22:00 y 2026-10-10 ~19:30.
- **[V]** Dependencias de producción: `pdfjs-dist ^4.10.38`, `pdf-lib ^1.17.1`, `react ^18.3`, `zustand ^4.5`,
  `lucide-react`, `uuid`, `@tauri-apps/{api,plugin-dialog,plugin-fs}`. Rust: `tauri 2.12`, `serde_json`,
  `tauri-plugin-{dialog,fs,log}`. **No hay** librería de PDF en Rust, ni de XLSX, ni de ZIP.
- **[U]** 259 tests unitarios en 15 suites · 12 E2E · 4 de Rust · smoke nativo. (**[V]** Mi corrida con
  `P2-C.2` aún sin commitear dio 269 en 16 archivos; reconciliar corriendo `npm test`.)
- **[V]** Puertas: `node scripts/verify.mjs [--with-e2e] [--with-native]` y `scripts/parity-check.mjs`
  (22 filas `shipped` verificadas literalmente + 3 `todo` con guion, antes de C.2).
- **[V]** Fixtures: `fixtures/test-blueprint.pdf` (2.5 kB, 3 págs, 800×600 pt, la 3.ª sin texto),
  `test-blueprint-rotated.pdf` (1 kB). **Son diminutos: no hay fixture de plano grande, ni PDF con
  anotaciones, ni PDF firmado/cifrado.** Esto es una brecha de pruebas para todo el plan.

## 3. Estado por fase y bloque

| Fase / bloque | Estado | Fuente |
|---|---|---|
| Fase 1 (visor, coordenadas/rotación, hit-testing, export vectorial, persistencia atómica, historial) | **CERRADA** | [V] STATUS/ROADMAP + commits |
| Fase 2 · Bloque A (A.0–A.6: mover/transformar, nubes+Cloud+, marquee, callout, nota adhesiva, resaltador vectorial, resaltado de texto) | **CERRADO**, verificado nativo por el usuario | [V] PARITY filas 10–20 |
| Fase 2 · Bloque B (Tool Chest B.1–B.5) | **CERRADO y verificado por el usuario** | [U]; **[V]** `STATUS.md` y fila de `PARITY.md` aún dicen "pendiente" |
| Hito P2-X (smoke nativo `tauri-driver`, ADR-0008) | Cerrado y verificado en frío | [U]; [V] código y ADR existen |
| Fase 2 · Bloque C · `P2-C.1` (filtro/orden, motor puro) | Entregado (`d3b8d55`); verificación nativa pendiente | [V] |
| Fase 2 · Bloque C · `P2-C.2` (menú contextual de estados + comando atómico + grupos) | **Commiteado (`d310a87`)**; verificación nativa pendiente. En el momento de mi auditoría el E2E del hito había fallado una vez y se re-ejecutaba | [V] commit; [V] `.last-run.json` = failed a las 19:23 |
| Fase 2 · Bloque C · `C.3` columnas, `C.4` exportación, `C.5` E2E+nativo | No empezados | [V] |
| Fase 2 · Bloque D (capas, sellos) | No empezado | [V] |

Avance en sub-entregables de Fase 2 **[U]**: 13 de 19 (7 A + 5 B + C.1) ≈ 68 %; con C.2 commiteado serían 14/19
(pendiente de verificación nativa del usuario).

## 4. Arquitectura real hoy (lo que hay que conocer antes de cambiar nada)

### 4.1 Capas del código **[V]**

| Capa | Ruta | Notas |
|---|---|---|
| Núcleo "puro" | `src/core/markup/{render.ts, helveticaMetrics.ts}` | `render.ts` (≈29 kB) genera descriptores SVG de las 14 marcas. **Ojo:** `src/utils/coordinates.ts` (≈24 kB, hit-testing, conversión, marquee) vive en `utils`, no en `core`, aunque es lógica pura. |
| Servicios (IO) | `src/services/{pdfService, pdfExportService, bbxPersistenceService, fileDialogService, toolChestService, toastService}.ts` | `pdfExportService` ≈28 kB. |
| Estado | `src/store/{useMarkupStore, useDocumentStore, useToolStore, useToolChestStore, testHooks}.ts`, `store/history/{command, UpdateMarkupStatusCommand}.ts` | Cambios de marcas por comandos con undo/redo, tope 50. |
| UI | `src/components/{PdfViewer (≈64 kB), MarkupsList (≈24 kB), TopBar, ThumbnailsSidebar, markup/*, toolchest/*}` | `PdfViewer.tsx` es un monolito: cualquier refactor multipágina debe empezar partiéndolo. |
| Rust | `src-tauri/src/lib.rs` | **Solo dos comandos:** `write_bbx` y `read_bbx` (ruta absoluta, extensión `.bbx.json`, `.tmp` + `sync_all` + `rename`). |

### 4.2 Flujos clave **[V]**

- **Abrir PDF** (`fileDialogService.openPdfDialog` → `loadPdfData`): lee el archivo **completo** con
  `plugin-fs.readFile` a un `Uint8Array`, lo carga en PDF.js (`loadPdfDocument`) y lo guarda en
  `useDocumentStore`. Después busca el `.bbx.json` hermano y carga marcas (si falla, `setMarkups([])` y
  `console.error`: **hay un fallo silencioso parcial** frente a la regla de "nunca fallar en silencio" si el
  JSON existe pero está corrupto; verificar si se notifica en UI).
- **Render** (`pdfService.renderPageToCanvas`): **una página a la vez** (`currentPageIndex`), canvas offscreen
  a `scale × devicePixelRatio`, con `page.render({canvasContext, viewport})` **sin `annotationMode`** (por
  defecto PDF.js dibuja las anotaciones del PDF). Capa de texto por `TextLayer` de PDF.js 4.x. **[H]** A zoom
  alto sobre planos grandes el canvas único puede exceder los límites del navegador (verificar zoom máximo en
  `useDocumentStore`/`TopBar`).
- **Marcas:** modelo `Markup` con coordenadas **normalizadas 0..1** (origen arriba-izquierda), estilo, estado,
  `groupId`, `leaders`, `layer?`, `customFields?`, `stampId?`, `resolvedFields?` (los dos últimos son reserva
  de Bloque D). Overlay SVG sobre el canvas, generado desde `getMarkupSvgDescriptor` (ADR-0006).
- **Persistencia:** `.bbx.json` v1.1.0 junto al PDF, vía comandos Rust; **autoguardado cada 30 s** si hay
  cambios (`useAutoSave`). `migrateBbxDocument` valida versión (1.0.0/1.1.0), tipo, estado y puntos finitos.
  **Los tipos y estados desconocidos se degradan en silencio** (`type` → `rectangle`, `status` → `pending`).
- **Exportación** (`exportMarkupsToPdf`): carga el PDF con `pdf-lib` y **dibuja las marcas como contenido de
  página** (`drawSvgPath`, `pushOperators` con `re/m/l/f/rg/RG`, `ExtGState` para opacidad y `/BM /Multiply`).
  **Deliberadamente no escribe `/Annots`** (A.4 lo exige y hay tests que lo verifican). Resultado: un PDF
  **aplanado**, no editable como anotaciones.
- **Tauri:** `dragDropEnabled:false` (necesario para el arrastre HTML5 del Tool Chest), `csp:null`,
  capacidades `fs:allow-read-file` y `fs:allow-write-file` **amplias** (escritura no atómica, sin límite de
  ruta) además de los comandos acotados. **[H]** `csp:null` y `fs:allow-write-file` global deberían
  endurecerse antes de distribuir (pista de seguridad, ver `03` §Transversal T1).

### 4.3 Qué hace bien este proyecto (activos reales)

1. **Una sola geometría** para visor y exportación (ADR-0006). Es el activo que permite generar `/AP`
   (apariencia) de anotaciones sin duplicar dibujo.
2. **Pruebas de frontera sobre artefactos reales** (content stream descomprimido, bytes del PDF, `.bbx.json` en
   disco). Es la cultura necesaria para probar interoperabilidad.
3. **Coordenadas normalizadas con rotación unificada** probada en 4 orientaciones (ADR-0002) y comando
   `getPageTransformFromPdfLib` (`originX/originY/widthPt/heightPt/rotation`).
4. **Historial por comandos atómicos**, motor de filtro/orden puro e inmutable, Tool Chest con IndexedDB y
   fallback ruidoso, smoke nativo con `tauri-driver`.
5. **Gobernanza** (`AGENTS.md` + `parity-check.mjs` + `verify.mjs`) que ya detectó falsos verdes.

## 5. Brechas frente a Revu (resumen; matriz completa en `06`)

**Cobertura estimada** (juicio mío, no medición): marcado ≈ 40–50 %, Tool Chest ≈ 50 %, lista de marcas ≈ 40 %,
medición 0 %, comparación 0 %, gestión de páginas 0 %, navegación ≈ 10–15 %, interoperabilidad con PDFs ajenos
muy baja, formularios/firmas/OCR/redacción/Studio 0 %. Global ≈ 5–10 % de la superficie de Revu.

Brechas **estructurales** (condicionan el resto):

| # | Brecha | Efecto | Se resuelve en |
|---|---|---|---|
| G-1 | Marcas no son anotaciones PDF; export aplanado | PDF no editable en Revu/Acrobat | Fase 3 |
| G-2 | No se importan anotaciones de PDFs ajenos | No sirve para revisar planos de otros | Fase 3 (C) |
| G-3 | Visor de una página, un documento | No es un flujo de trabajo de planos (hojas, pestañas) | Fase 5 |
| G-4 | Sin medición ni escala | Sin takeoff (núcleo del público objetivo) | Fase 4 |
| G-5 | Sin inspector de propiedades | Editar color/grosor de una marca existente es imposible | `P2-C.6` |
| G-6 | Sin rendimiento probado en planos grandes | Riesgo de inutilidad en planos reales | `P5-A` (y spike en Fase 3) |
| G-7 | Sin operaciones de páginas | Flujos de hojas/sets incompletos | Fase 5 (C) |
| G-8 | Sin comparación/superposición | Revisión de revisiones de plano incompleta | Fase 6 |
| G-9 | Sin hilos de comentarios (respuestas) | Revisión colaborativa incompleta | `P3-E.2` |
| G-10 | Una sola vía de entrada de archivos (diálogo) | Sin "Abrir con…", sin argumentos, sin recientes | Fase 5 (B) |

## 6. Contradicciones documentales encontradas **[V]**

| # | Documento | Problema | Corrección propuesta (Z.0) |
|---|---|---|---|
| DOC-1 | `ROADMAP.md` | Define `P2-C.2` = columnas y `P2-C.3` = estados; el plan aprobado/commits/`PARITY.md` usan `C.2` = estados, `C.3` = columnas. Solo llega a `C.4` (sin `C.5`). | Renumerar a C.1–C.5 (+C.6 si se aprueba el inspector) |
| DOC-2 | `ROADMAP.md` | Marca A.6 como "NO EMPEZADO" y Bloque B y C.1 como "NO EMPEZADO"; todo está cerrado/entregado | Alinear con `STATUS.md` + commits |
| DOC-3 | `ROADMAP.md` | Define B como B.1–B.3; en realidad hay B.1–B.5 | Alinear |
| DOC-4 | `docs/STATUS.md` | Bloque B "pendiente de verificación nativa final" (ya verificado **[U]**); Bloque C "no empezado"; 235 tests | Actualizar |
| DOC-5 | `PARITY.md` | Fila Tool Chest sin la verificación nativa del arrastre; C.1/C.2 sin ella (correcto hasta que el usuario verifique) | Actualizar tras verificación |
| DOC-6 | `AGENTS.md` §5 | Lista 3 pasos de `verify.mjs`; el script ya hace tests, parity, build, (bundle), cargo | Alinear |
| DOC-7 | `docs/SCOPE.md` | `OUT #2` ("adelanto de bloques") redactado para el Bloque A; el prerrequisito de C ("B cerrado y verificado") ya se cumple **[U]**; `cancelled` y el inspector no figuran | Actualizar |
| DOC-8 | `ADR-0003` | Argumenta el sidecar "para no alterar planos con firma digital"; la propuesta lo reconcilia con guardado incremental | Nuevo ADR que lo matice, no que lo borre |
| DOC-9 | `CLAUDE.md` | Título dice "Revu Engineering Architecture": evoca marca de terceros | Ver decisión D-8 |

## 7. Deuda técnica y riesgos conocidos

**Reportados por el usuario [U]:**

- **Bloqueante del migrador (antes de C.3):** `customColumns` no sobrevive a `migrateBbxDocument` ni existe en
  `BbxDocumentFile` → se perdería **en silencio** al reabrir. → `Z.2`.
- **Puerta de tamaño de bundle:** nadie la mide de verdad (la cifra del informe previo era inventada).
  **[V]** Hay una versión sin commitear en `scripts/verify.mjs` (`checkBundleSize`, umbral 800 kB; el chunk
  principal medido era ≈626 kB en mi inspección, [U] 641 kB). Falta decidir si entra en `AGENTS.md` §5 y
  desacoplarla del commit de C.2 (un commit por sub-entregable).
- **Crecimiento del bundle:** chunk principal ≈641 kB, `pdfExportService` ≈441 kB (ya diferido). Con C.4 y
  nuevas fases conviene más división de chunks.
- **Cosmético:** `HIGHLIGHT_STYLE` (un valor) vive en `src/types/markup.ts` (archivo de tipos).
- **Menor:** tres herramientas del Tool Chest salen con el mismo nombre autogenerado ("Herramienta callout" ×3).

**Detectados en esta auditoría [V] (re-verificar si persisten tras `d310a87`):**

- `migrateBbxDocument` degrada tipos/estados desconocidos **sin avisar** (contradice AGENTS §3 "nunca
  degradar en silencio"). Con `cancelled` nuevo y misma versión de esquema `1.1.0`, un archivo guardado con
  `cancelled` y abierto en una compilación anterior pierde ese estado sin aviso. → `Z.2`.
- `updateMarkupStatus` aplica el cambio a **toda la selección** si la fila editada está en ella (también desde
  el `<select>` de la fila). Decidir si es intencional y documentarlo/testearlo.
- `UpdateMarkupStatusCommand` fija `updatedAt` al ejecutar; **undo no restaura el `updatedAt` previo** y
  redo reutiliza la fecha original.
- `markupFilterSort.test.ts` (lista de estados) no incluía `cancelled`.
- El E2E de `P2-C.2` depende de datos de demostración (`calibration-markup-1` con estado `accepted`); frágil
  si cambia la demo.
- `ADR`: el motor de filtros ya soporta `layer` aunque las capas llegan con Bloque D/Fase 3.
- Avisos `LF will be replaced by CRLF` en varios archivos: definir `.gitattributes`.
- El README/commit de C.1 habla de "<15 ms" y `PARITY.md` de "< 10 ms": unificar cifra.
- **Pruebas:** no hay fixtures grandes, anotados, firmados ni cifrados (ver §2).

## 8. Riesgos de proceso

1. **Verificación del usuario como cuello de botella.** Cada hito nativo espera una confirmación manual. El
   plan propone agruparlas en ventanas por bloque (`04` §5).
2. **Ceremonia por hito.** ADR + `PARITY` + `STATUS` + E2E×3 por función pequeña frena el avance cuando el
   backlog es de decenas de funciones. Propuesta: mantener todas las puertas, pero ADR **por decisión**, no por
   hito, y `PARITY/STATUS` actualizados **por bloque** salvo en hitos que cambian API pública (`04` §3).
3. **Dos fuentes de verdad documentales** (`ROADMAP` vs `STATUS` vs `PARITY`) que ya divergieron. El hito `Z.0`
   las alinea y propone que `parity-check.mjs` también valide ids contra `ROADMAP.md`.
4. **Sesiones concurrentes sobre el mismo árbol** (visto hoy): riesgo de commits mezclados. Regla propuesta:
   un agente por bloque, commits por hito, `git status` antes de cada `git add` explícito (nunca `-A`).
