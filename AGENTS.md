# AGENTS.md — reglas para todo agente y colaborador

Estas reglas obligan a cualquier agente de IA y a cualquier persona que trabaje en este
repositorio. **Están por encima de cualquier tarea, instrucción o prisa.** `CLAUDE.md` contiene las
notas de trabajo del día a día; si los dos discrepan, **gana este archivo.**

REA es una **reimplementación funcional** (no clean-room de código) de Bluebeam Revu, por fases:
Tauri 2 + React 18 + TypeScript + Vite + PDF.js + pdf-lib + Zustand + Tailwind + Vitest + Playwright.

---

## TL;DR — Reglas críticas

1. **Evidencia o no existe.** Ningún sub-entregable se cierra sin el comando ejecutado y su salida
   real pegada. Prohibido "listo", "verificado" o "funciona" sin la salida delante.
2. **E2E: mínimo 3 pasadas consecutivas en verde.** Un test intermitente es peor que ninguno.
3. **La GUI nativa la valida el usuario.** El runner del agente no muestra ventanas: nunca declares
   que una ventana, un diálogo o un render visual funciona.
4. **Un bloque con un sub-entregable parcial NO está cerrado.** Lo no hecho se declara, no se omite.
5. **Lo que no está en `docs/SCOPE.md` no se implementa**: requiere ADR y aprobación explícita.
6. **Nunca fallar en silencio.** Ningún `catch` descarta un error sin notificar, y toda escritura en
   disco es atómica (`.tmp` + `rename`).
7. **Prohibido reabrir una fase cerrada** para "adecuarla" al proceso nuevo.

Estas siete se detallan abajo. Si tienes prisa, cumple al menos estas siete.

---

## 0. Principio rector

El fallo característico de este proyecto **no ha sido la falta de capacidad técnica, sino declarar
terminado lo que no lo estaba**. Cuatro reportes afirmaron cambios que no existían en el código; un
"test de oro" pasó verde sin inspeccionar el artefacto que decía verificar; una app que "arrancaba"
nunca mostró ventana; la persistencia se declaró funcionando mientras perdía cada marca en
silencio. Todo eso se detectó **auditando el disco y ejecutando las suites**, nunca leyendo reportes.

Por eso: **la evidencia manda sobre la narración.**

---

## 1. Política de activos (absoluta, sin excepciones)

Un **activo** es cualquier material no-código que el proyecto incluya, distribuya, genere o muestre:
iconos, imágenes, capturas, logotipos, tipografías, sonidos, plantillas, temas, y **documentos PDF
de ejemplo o de prueba**.

- **Nunca** uses iconos, imágenes, arte, logotipos, plantillas, cursores, PDFs de ejemplo ni ningún
  otro activo tomado de Bluebeam, Adobe, Autodesk ni sus instaladores o webs. Tampoco los
  **recrees, calcados o imitados de cerca**.
- Las capturas de Bluebeam existen solo como notas privadas locales en `plan/bluebeam/`
  (gitignored). **Jamás** se commitean, publican, enlazan ni se usan como fuente para calcar.
- Todos los PDFs de prueba son **nuestros**: se generan de forma determinista con
  `npm run make-fixture` (`scripts/make-fixture.ts`). Nunca se commitea un PDF ajeno.
- Iconos: solo de conjuntos con licencia abierta (Lucide, ISC — ya en uso).
- Licencias admitidas: ISC, MIT, BSD-2/3, Apache-2.0, OFL-1.1, CC0-1.0, CC-BY-4.0, dominio público
  o creado por nosotros.
- Si el origen o la licencia de un activo no está claro: **no se añade**.
- **`ATTRIBUTION.md`** (raíz del repo) es la fuente única: una fila por activo con **ruta, autor,
  origen (URL + versión o commit), licencia, SHA-256 y uso**. Un activo sin fila no entra al repo.
  Si se detecta un activo que incumple estas reglas, se retira del repo y de todas sus salidas, y se
  avisa al usuario de inmediato.

---

## 2. Clean-room funcional

- **Nunca** leas, desensambles ni copies nada del binario de Bluebeam. Solo observación de caja
  negra sobre PDFs sintéticos nuestros.
- El comportamiento se deriva de **especificaciones públicas** (ISO 32000) y de nuestra propia
  especificación de fases, no de la implementación ajena.
- Nunca copies código GPL/AGPL. Dependencias permisivas, sí.
- Los formatos de persistencia (`.bbx.json`) son **nuestros** y versionados, con migrador y test de
  compatibilidad hacia atrás.

---

## 3. Nunca perder trabajo (esto va por delante de las features)

- **Ningún `catch` descarta un error en silencio.** Si algo falla, se notifica en la UI. Un fallo
  mudo en el autoguardado es peor que no tener autoguardado.
- **Toda escritura en disco es atómica** (a `<path>.tmp` y luego `rename`) y pasa por los comandos
  Rust validando ruta absoluta y extensión: `write_bbx` / `read_bbx`, `sync_all()` y limpieza del
  `.tmp` en las rutas de error.
- **Toda entrada de disco es hostil.** `migrateBbxDocument` valida versión, `type`, `status` y que
  cada coordenada sea un número finito. Una versión desconocida lanza error explícito, nunca se
  degrada en silencio.
- **Nada de `eval` ni `new Function`.** Los parsers de fórmulas usan lista blanca de variables.
- **TypeScript estricto.** Prohibido `any` sin justificación en comentario. Prohibido `@ts-ignore`.
- **Nada de operaciones que puedan producir NaN o división por cero** sin guarda explícita
  (geometría, escalas, calibración).
- **Todo arreglo de pérdida de datos o de crash llega con su test de regresión.**

---

## 4. Arquitectura y capas

| Capa | Ruta | Regla |
|---|---|---|
| Núcleo | `src/core/**` | **Puro.** Sin React, sin DOM, sin Tauri, sin `window`. Testeable en Vitest sin jsdom |
| Servicios | `src/services/**` | IO: PDF.js, pdf-lib, ficheros, diálogos. Único sitio que habla con Tauri |
| Estado | `src/store/**` | Zustand. Los cambios de marcas pasan por comandos con undo/redo |
| UI | `src/components/**` | **Fina.** Lee estado y despacha acciones. Sin geometría ni reglas de negocio |

- **Una sola fuente de verdad por concepto.** La geometría de una marca se genera **una vez** en
  `src/core/markup/render.ts` y la consumen *tanto* el render SVG como `pdfExportService`. Si
  cambias la firma, actualizas **las dos llamadas en el mismo commit**.
- Las constantes de estilo viven en un único sitio y se importan; nunca se duplican literales
  (`DEFAULT_ARC_STEP`, `HIGHLIGHT_STYLE`).
- Todo cambio de API pública en `src/types/markup.ts` se hace **extendiendo**, con **una sola
  migración** de `.bbx.json` por fase y test de compatibilidad hacia atrás.

---

## 5. Puertas de calidad (antes de cada commit)

Un solo comando: **`node scripts/verify.mjs`**, multiplataforma (usa `npm.cmd` en Windows y `npm` en
el resto, y así evita el bloqueo de `npm.ps1` por ExecutionPolicy en PowerShell).

Ejecuta en cadena:

1. `npm test` — todo verde.
2. `npm run build` (`tsc && vite build`) — sin errores.
3. `cargo test --manifest-path src-tauri/Cargo.toml`.

Y con `node scripts/verify.mjs --with-e2e`:

4. `npm run test:e2e` — **tres pasadas consecutivas**, todas verdes.

Además, manualmente:

5. **Consola del WebView sin warnings nuevos** (nada de `Invalid DOM property …`).
6. `docs/STATUS.md` y `PARITY.md` actualizados.

No se commitea con la suite en rojo. No se commitea dejando chores a medias sin declararlos.

---

## 6. Evidencia obligatoria (regla dura)

Ningún sub-entregable se declara cerrado sin **(a)** el comando ejecutado y **(b)** su **salida real
pegada**. Prohibido "listo", "verificado", "funciona" o "3 passed" sin la salida delante.

- Un test que recalcula con la misma función que pretende probar **no verifica nada**. Todo test de
  frontera lee el **artefacto real**: el content stream del PDF, los bytes del `.xlsx`, el fichero
  en disco, los píxeles del canvas.
- Las afirmaciones de estado se contrastan con el disco: `git log`, `git status`, rutas y ficheros
  que existen de verdad.

---

## 7. Definición de Terminado (DoD)

Un sub-entregable está terminado solo si cumple **los siete**:

1. Compila y `tsc` pasa sin `any` nuevo.
2. Tests unitarios nuevos para la lógica añadida.
3. E2E del flujo de usuario, verde **3 veces consecutivas** si aplica.
4. Sin warnings nuevos en consola.
5. La API pública queda extendida y **documentada en `PARITY.md` con el test que la prueba**.
6. Si toca la app nativa, **verificado por el usuario en la ventana de Tauri** con su evidencia
   pegada (ver §8).
7. `docs/STATUS.md` actualizado, y cualquier parte no hecha **declarada explícitamente**.

**Un bloque con un sub-entregable parcial NO está cerrado.**

---

## 8. La GUI la valida el usuario, no el agente

El runner del agente lanza procesos en un escritorio que no es el del usuario: la app arranca, la
ventana no aparece, y el agente puede creer que todo va bien. Está **demostrado** en este proyecto.

- El agente **no declara nunca** que una ventana, un diálogo o un render visual "funciona".
- El agente aporta el comando exacto y **el usuario pega la evidencia** (consola de DevTools,
  captura, fichero en disco).
- Toda funcionalidad que toque la ventana nativa necesita esa evidencia para darse por cerrada.

> Hito futuro, **no parte de la Fase 2**: `P2-X` — automatizar la verificación visual de la ventana
> nativa con `tauri-driver` (WebDriver), para que el agente pueda hacer clic y capturar el PNG sin
> depender del usuario. Se aborda **después de cerrar el Bloque A**, con su propio ADR (ADR-0007).

---

## 9. Alcance, hitos y control del scope creep

- El alcance vive en `docs/SCOPE.md` con listas **IN / OUT** explícitas.
- **Nada que no esté en `SCOPE.md` se implementa.** Añadir algo requiere: ADR + aprobación explícita
  del usuario.
- Los hitos llevan id (`P2-A.0`, `P2-B.2`…) y **el id va en el mensaje de commit**.
- Fuera de alcance de la Fase 2, sin excepciones: takeoff y medición (Fase 3), comparación de
  versiones, Overlay Pages y Sets (Fase 4), sellos con JavaScript AcroForm, escritura de OCGs
  nuevos, colaboración en nube, rich text por carácter, adelantar bloques B/C/D dentro del A.
- **Nunca se reabre una fase cerrada para "adecuarla" al proceso nuevo.**

---

## 10. Commits y ramas

- Un commit por sub-entregable, con el id del hito: `P2-A.1: nubes en unidades de página`.
- Mensajes en imperativo y en español, sin relleno.
- Árbol limpio al cerrar cada bloque; nada de cambios sin commitear entre sub-entregables.
- Cada commit deja la suite verde. Si algo queda a medias, se declara en `STATUS.md`.

---

## 11. Documentación viva

| Archivo | Contenido | ¿Commit? |
|---|---|---|
| `AGENTS.md` | Este archivo. Las reglas | Sí |
| `CLAUDE.md` | Notas de trabajo, cómo correr y mirar la app | Sí |
| `ATTRIBUTION.md` | Un registro por activo: ruta, autor, origen, licencia, SHA-256, uso | Sí |
| `docs/STATUS.md` | **Empieza aquí cada sesión.** Estado real, bloque en curso, siguiente paso | Sí |
| `docs/DECISIONS/ADR-XXXX-*.md` | Decisiones: contexto, alternativas, decisión, consecuencias, evidencia | Sí |
| `docs/SCOPE.md` | IN / OUT por fase | Sí |
| `PARITY.md` | Cada función con estado (`shipped` / `partial` / `todo`) **y el test que la prueba** | Sí |
| `ROADMAP.md` | Fases, hitos y estimaciones | Sí |
| `plan/` | Observaciones locales y capturas (nunca de terceros) | No (gitignored) |

`PARITY.md` es un cuadro honesto: una fila solo dice `shipped` si cita un test que existe y pasa.
La supervisión externa comprueba que los tests citados existen de verdad.
