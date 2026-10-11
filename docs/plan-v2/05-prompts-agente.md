# 05 — Prompts listos para delegar a otro agente

> Copiar y pegar. Cada prompt es autosuficiente: asume que el agente **no** ha visto la conversación que originó
> este plan. Antes de pegar cualquiera, comprobar en `README.md` §4 que las decisiones D-* que lo afectan
> están **aprobadas**. Los prompts de Fase 3+ **no deben usarse** sin aprobación de D-1.

---

## 0. Preámbulo común (pegar al inicio de CUALQUIER prompt)

```
Trabajas en el repositorio C:\dev\rea (REA: reimplementación funcional de un editor de marcado de PDF
para planos; Tauri 2 + React 18 + TypeScript + Vite + PDF.js + pdf-lib + Zustand + Vitest + Playwright).
Idioma: español. Sistema: Windows (PowerShell; usa npm.cmd / node scripts/verify.mjs).

ANTES DE HACER NADA lee, en este orden: AGENTS.md (manda sobre todo), CLAUDE.md, docs/STATUS.md,
docs/plan-v2/README.md y el archivo de docs/plan-v2 que cite tu tarea. Contrasta el estado con el disco:
git status, git log -10. Si otra sesión tiene cambios sin commitear en archivos que vas a tocar, DETENTE y avisa.

REGLAS NO NEGOCIABLES (resumen de AGENTS.md):
1. Evidencia o no existe: pega el comando ejecutado y su salida literal. Prohibido "listo/funciona/3 passed" sin salida.
   Si una salida llega truncada, léela del log en disco; nunca la reconstruyas.
2. E2E: tres pasadas consecutivas en verde (puerto 1421, reuseExistingServer:false) cuando el hito toque un flujo de usuario.
3. NO declares que una ventana, diálogo, render visual, Revu o Acrobat "funciona": eso lo valida el usuario.
   Entrega comando + checklist y deja la fila en PENDIENTE DE VERIFICAR.
4. Todo sub-chequeo debe poder fallar (aserciones estrictas; nada de console.log como prueba).
5. Nunca fallar en silencio. Toda escritura en disco es atómica (.tmp + rename). TypeScript estricto, sin any ni @ts-ignore.
6. El conteo de tests no baja sin justificarlo. No reabras fases cerradas. Lo que no está en docs/SCOPE.md requiere ADR + aprobación.
7. Activos de terceros prohibidos (incluidas capturas de Bluebeam/Adobe). Fixtures solo generados por scripts nuestros.
8. Un commit por hito con el id en el mensaje (español, imperativo). git add EXPLÍCITO (nunca -A). No edites documentos de
   gobernanza fuera del alcance de tu tarea. Cada commit deja la suite verde (node scripts/verify.mjs).

AL TERMINAR entrega: (a) lista de archivos tocados, (b) comandos ejecutados con salida literal, (c) qué cubre y qué NO cubre
cada prueba, (d) lo no hecho, declarado, (e) el comando exacto y el checklist para la verificación del usuario.
```

---

## 1. Z.0 + Z.2 — Contabilidad y migrador (el primer paso recomendado)

```
[Pegar el preámbulo común]

TAREA: hitos Z.0 (contabilidad documental) y Z.2 (endurecimiento del migrador) de docs/plan-v2/03-plan-por-fases.md §1.
Trabaja en DOS commits separados: primero Z.2 (código), luego Z.0 (solo documentación).

Z.2 — Migrador:
- Añade customColumns? a BbxDocumentFile y consérvalo/valídalo en migrateBbxDocument (src/types/markup.ts).
- Valida y conserva Markup.customFields (solo string|number finitos, longitud acotada; sin __proto__).
- migrateBbxDocument debe devolver también warnings: string[] (tipo o estado desconocido, campos descartados) y la UI
  (fileDialogService/loadPdfData) debe mostrarlos con toastService. Hoy tipos/estados desconocidos se degradan en silencio.
- NO subas la versión del esquema (1.1.0); es una extensión opcional. Anota un addendum en docs/DECISIONS/ADR-0003.
- Tests (sin bajar el conteo): ida y vuelta guardar→leer del FICHERO REAL, entradas hostiles, status 'cancelled' conservado,
  tipo desconocido => warning visible. Demuestra que los tests FALLAN si quitas la preservación (rómpela, pega la salida roja,
  restaura).

Z.0 — Documentación (sigue docs/plan-v2/04-gobernanza-y-contabilidad.md §1 y §8):
- Alinea ROADMAP.md (numeración C.1–C.5, estados reales de A.6, B, C.1, C.2, P2-X), docs/STATUS.md (conteos COPIADOS de la
  salida de npm test, E2E y cargo test), PARITY.md (Tool Chest verificado por el usuario; C.1/C.2 siguen PENDIENTES;
  NINGÚN shipped nuevo sin test existente).
- NO apliques los cambios de SCOPE.md/AGENTS.md que dependen de decisiones D-* a menos que el usuario las haya aprobado
  en este mismo mensaje.
- node scripts/parity-check.mjs debe pasar; pega la salida.

NO HAGAS: nada de Fase 3+, ni C.3, ni cambios de UI fuera de mostrar los warnings.
```

## 2. P2-C.3 — Columnas personalizadas

```
[Pegar el preámbulo común]

TAREA: hito P2-C.3 (docs/plan-v2/03 §2). Prerrequisito: Z.2 mergeado (verifícalo con git log).
Implementa columnas personalizadas con un parser de GRAMÁTICA CERRADA (descenso recursivo): números, + - * /, paréntesis,
identificadores de LISTA BLANCA (campos numéricos de la marca y otras columnas numéricas) y funciones round, min, max, abs.
Prohibido eval, new Function y acceso a propiedades arbitrarias. Detecta ciclos, limita longitud/profundidad. División por
cero y entradas inválidas => error de celda controlado (nunca NaN ni excepción).
Persistencia SOLO en customColumns (documento) y customFields (marca), a través de una función/interfaz de serialización
(en Fase 3 se redirigirá a /REA en el PDF). Extiende el motor puro src/utils/markupFilterSort.ts para ordenar y filtrar por
columna sin mutar entradas.
Pruebas: corpus hostil (constructor, __proto__, process, this, ';', 10k caracteres), propiedades contra un oráculo distinto del
evaluador, persistencia real, E2E x3 (crear columna calculada, ordenar, reabrir).
Entrega el checklist de verificación nativa para el usuario. PARITY.md: fila C.3 en shipped solo con el nombre del test COPIADO
del archivo de tests.
```

## 3. P3-A.1 — Spike de MOTOR de cuatro opciones (aprobado 2026-10-11; investigación, no toca el producto)

> Sustituye al antiguo "spike de guardado". Este prompt es **autosuficiente** (incluye sus propias reglas); no hace
> falta pegar el preámbulo común.

```
Trabajas en el repositorio C:\dev\rea (REA: editor de marcado de PDF para planos de construcción e ingeniería; Tauri 2 + React 18 +
TypeScript + Vite + PDF.js + pdf-lib + Zustand + Vitest + Playwright; backend Rust en src-tauri). Idioma: español. Windows (PowerShell).
Entorno en cada comando: $env:PATH = "C:\Program Files\nodejs;C:\Users\jmm_j\.cargo\bin;$env:PATH"; $env:NODE_OPTIONS = "--use-system-ca"

LEE ANTES: AGENTS.md (manda sobre todo), CLAUDE.md, docs/plan-v2/README.md, docs/plan-v2/07-estrategia-de-motor-y-completitud.md (ES TU
ESPECIFICACIÓN), docs/plan-v2/02-arquitectura-interop.md §2, §3, §7 y §11. Comprueba: git status limpio y git log -5. Si no está limpio, DETENTE.

OBJETIVO DEL PRODUCTO (aprobado por el usuario): las FUNCIONES de Bluebeam Revu con la COMPLETITUD técnica de pdfcraft
(github.com/storytold/pdfcraft, MIT/Apache-2.0, usado como inspiración). Necesitamos elegir el MOTOR PDF.

TAREA — hito P3-A.1: spike de motor de CUATRO opciones, medido con las métricas M1–M9 de 07 §3.1 y la rúbrica de 07 §3.2:
 A) Actual ampliado: PDF.js (render) + pdf-lib (construir objetos) + escritor de ACTUALIZACIÓN INCREMENTAL propio (append de objetos + xref + /Prev).
 B) Núcleo propio en Rust: prototipo MÍNIMO de capa de objetos (lectura de xref clásica y xref stream, objetos, object streams) + escritor incremental
    con una anotación. No construyas un motor: mide lo que cuesta y extrapola M9 con argumentos.
 C) Crates de pdfcraft: clona github.com/storytold/pdfcraft en spikes/motor/vendor/ (ignorado por git), FIJA el commit (hash en el informe), lee su
    LICENSE y NOTICE, y úsalos como dependencia de un binario de spike (path dependency). ¿Están publicados en crates.io? Regístralo.
 D) PDFium: vía un crate de enlace (p. ej. pdfium-render) y un binario de PDFium para Windows x64. Antes de descargar CUALQUIER binario, registra URL, versión,
    licencia leída y SHA-256; si no puedes verificar procedencia y licencia, DETENTE con esa opción y regístralo como bloqueada.
 Excluido: cualquier componente GPL/AGPL (p. ej. MuPDF). Puedes recomendar un híbrido si los datos lo justifican.

CORPUS:
 - Genera fixtures SINTÉTICOS deterministas en spikes/motor/fixtures/ (script incluido): xref clásica, xref stream, object streams, linearizado,
   con /Annots previas, con /Sig simulada (sin criptografía), página con /Rotate 90, CropBox != MediaBox, hoja E (>= 3600x2400 pt, decenas de miles
   de trazos), 300 páginas, ~100 MB con imágenes. Cifrados (RC4, AES-128, AES-256): genéralos con qpdf SI ya está instalado; si no lo está, NO lo
   instales: regístralo y pide al usuario que decida.
 - Corpus externo (07 §5): SOLO si el usuario aprobó D-11 en el mensaje que acompaña a este prompt. Si no, usa solo fixtures sintéticos y decláralo.
 - Nunca commitees PDFs ajenos ni binarios. Añade a .gitignore: spikes/**/vendor/, spikes/**/target/, spikes/**/node_modules/, corpus/.

MÉTRICAS (07 §3.1): M1 robustez de apertura (timeout por archivo), M2 fidelidad de render contra una referencia FIJA que declares y justifiques
(sugerencia: PDF.js en Chromium vía Playwright, que ya está en el proyecto), M3 ida y vuelta (añadir Square, FreeText, Highlight, Ink y Text con /AP,
guardar INCREMENTAL, reabrir, bytes originales intactos, qpdf --check si existe), M4 archivos difíciles, M5 planos grandes (primer render y memoria
pico), M6 escritura de /OC, /Measure + /VP, /Stamp con /AP, /StateModel Review, /IRT /RT /Group, M7 integración en Windows/Tauri (compila, tamaño,
cómo llegan los píxeles a la UI), M8 licencia y procedencia, M9 coste argumentado hasta M1 >= 95 % y M3 >= 95 %.
Para M6, deja por opción un PDF de muestra en spikes/motor/out/<opcion>/muestra-revu.pdf para que el USUARIO lo abra en Revu y Acrobat
(tú no puedes declarar compatibilidad: entrégale la lista de qué mirar).

REGLAS:
 1. Nada en src/, src-tauri/src/ ni en el package.json raíz. Todo en spikes/motor/ (cada opción con su propio Cargo.toml/package.json).
 2. Caja de tiempo: si una opción no compila o no abre los fixtures básicos en un tiempo razonable, regístralo como resultado y sigue.
 3. EVIDENCIA: cada cifra del informe cita su log en spikes/motor/logs/<opcion>/... (logs de texto, sí se commitean). PROHIBIDO escribir listas de
    resultados que no salgan de un log; las tablas se generan con un script a partir de los logs (incluye el script). Informes anteriores de agentes
    inventaron listas de tests y nombres: eso invalida la entrega.
 4. Commits con git add explícito: uno por opción ("spike(p3-a.1): opcion A ...", etc.) y uno final de documentación.
 5. No instales nada a nivel de sistema ni descargues binarios sin registrar procedencia, licencia y SHA-256. Ante la duda, DETENTE y pregunta.

ENTREGABLES: docs/perf/SPIKE-MOTOR.md (resumen, tabla M1–M9 por opción generada desde los logs, rúbrica aplicada con pesos, recomendación y
riesgos), borrador docs/DECISIONS/ADR-<siguiente número libre>-motor-pdf.md en estado "Propuesto" (NO aceptado: lo aprueba el usuario), y una
fila en la tabla de control de cambios de docs/plan-v2/README.md §9.
INFORME FINAL: (a) archivos por commit copiados de git show --stat; (b) tabla de resultados con ruta de log por cifra; (c) qué NO se pudo medir y
por qué; (d) recomendación con la rúbrica; (e) lista para el usuario: qué abrir en Revu y en Acrobat (rutas exactas) y qué comprobar en cada archivo.
```

## 4. P3-A.2 + P3-A.3 — Fixtures y núcleo puro

```
[Pegar el preámbulo común]

TAREA: hitos P3-A.2 y P3-A.3 (docs/plan-v2/03 §3). Prerrequisito: ADR-0010..0012 aprobados.
P3-A.2: crea scripts/make-interop-fixtures.ts (determinista, estilo scripts/make-fixture.ts) que genere, con pdf-lib: páginas con
/Rotate 0/90/180/270, CropBox distinto de MediaBox, MediaBox con origen no nulo, UserUnit != 1; PDF con anotaciones FORÁNEAS
sintéticas de cada subtipo soportado (Square, Circle, Line, Polygon, PolyLine, FreeText, FreeText callout, Ink, Highlight, Text con
estados y respuestas), más Link, Popup y un Widget (no soportado); PDF con firma SIMULADA (/Sig sin criptografía, solo estructura).
Registra cada fixture en ATTRIBUTION.md (ruta, SHA-256, generador, "creado por nosotros"). Dos ejecuciones => mismos bytes.
P3-A.3: crea src/core/pdf/annotations/ (PURO: sin React, sin DOM, sin Tauri): tipos del diccionario de anotación, constructores
por subtipo, pdfToNormalizedCoordinates (inversa de normalizedToPdfCoordinates), mapeo de estado Review, serialización/validación
de la clave /REA. Pruebas de PROPIEDAD de ida y vuelta de coordenadas (4 rotaciones x cajas distintas x UserUnit) leyendo
transformaciones reales de los fixtures. No cambies pdfExportService en estos hitos.
```

## 5. P3-B.x — Plantilla para cada familia de escritura

```
[Pegar el preámbulo común]

TAREA: hito P3-B.<n> (docs/plan-v2/03 §3, tabla del Bloque B). Lee ANTES: docs/plan-v2/02-arquitectura-interop.md §3 (mapeo) y §4 (/AP).
Reglas específicas:
- Para P3-B.1 primero extrae src/core/pdf/emitMarkupOperators (puro) de pdfExportService SIN cambiar la salida del aplanado; los
  tests de oro existentes deben seguir verdes SIN modificarse. Si alguno necesita cambio, DETENTE y avisa.
- Toda anotación escrita lleva /Subtype, /Rect, /NM (= Markup.id), /T, /Contents, /CreationDate, /M, /F 4, /P, /AP /N y /REA v1.
- Pruebas L1 (diccionario y content stream del /AP leídos de bytes reales), L2 (exportar -> importar = identidad) y L4 (píxeles del /AP
  en PDF.js vs overlay SVG, con tolerancia declarada). Un chequeo debe fallar si rompes a propósito una clave.
- No escribas /Annots en la ruta de "Exportar aplanado": ese flujo no cambia.
No declares compatibilidad con Revu/Acrobat: entrega el PDF de muestra y el checklist (04 §5) y deja la fila como PENDIENTE.
```

## 6. P5-A.1 — Banco de pruebas de planos grandes (investigación)

```
[Pegar el preámbulo común]

TAREA: hito P5-A.1 (docs/plan-v2/03 §5). NO optimices nada todavía: MIDE.
Genera con un script determinista (scripts/make-large-fixtures.ts) planos sintéticos: una hoja 3600x2400 pt con decenas de miles de
trazos vectoriales, un documento de 300 páginas y un PDF de ~100 MB con imágenes. Registra en ATTRIBUTION.md.
Crea un harness (Playwright + hooks de solo lectura existentes) que registre: tiempo hasta el primer render, memoria pico
(performance.memory en Chromium), latencia de zoom/pan y de selección con 5 000 marcas sintéticas, y comportamiento a zoom máximo
(¿excede el límite del canvas?).
Entrega docs/perf/BASELINE.md con tablas y la salida LITERAL (ruta del log). NO inventes umbrales: propón umbrales como
recomendación, marcados como "propuesta pendiente de aprobación del usuario".
```

## 7. Prompt de revisión independiente (auditor)

```
[Pegar el preámbulo común]

TAREA: auditoría independiente del último hito mergeado. No implementes nada. Verifica en disco, no en informes:
git log -5, git diff entre el commit previo y HEAD, tests nuevos (¿pueden fallar?, ¿leen el artefacto real?), conteo de tests antes
y después (npm test, pega la salida), filas de PARITY.md (¿el nombre del test existe literalmente?), documentos de gobernanza
(¿mienten?), reglas de AGENTS.md incumplidas, deuda nueva. Entrega hallazgos priorizados con archivo:línea y evidencia.
```

---

## 8. Reglas de orquestación entre agentes

1. **Un agente por bloque**; los demás esperan o trabajan en investigación (`P3-A.1`, `P5-A.1`) que no toca `src/`.
2. **El auditor (prompt §7) nunca es el mismo agente que implementó.**
3. Si dos hitos tocan el mismo archivo (p. ej. `pdfExportService.ts`), son **secuenciales**.
4. El usuario verifica por **ventana de bloque**; el agente prepara el paquete (comando, fixtures, checklist) y no cierra filas.
5. Cualquier hallazgo que cambie el plan se anota en `docs/plan-v2/` (control de cambios al final de `README.md`) y se informa.
