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

## 3. P3-A.1 — Spike de guardado (investigación; no toca `src/`)

```
[Pegar el preámbulo común]

TAREA: hito P3-A.1 (docs/plan-v2/03 §3 y 02-arquitectura-interop.md §7). Es una INVESTIGACIÓN con mediciones; el código de
spike vive en scripts/spikes/ y NO entra a src/. Decisión D-1 debe estar aprobada.
Compara tres estrategias para guardar anotaciones en un PDF existente:
 A) pdf-lib reescritura completa; B) actualización incremental (append: objetos nuevos + xref + /Prev) en Rust con lopdf o un
 escritor mínimo propio; C) reescritura en Rust.
Mide con PDFs SINTÉTICOS (genera los que falten; nada de PDFs ajenos): tamaños ~2 kB, 5 MB, 50 MB, 100 MB; estructuras: xref
clásica, xref stream, object streams, linearizado, con /Annots previas; documentos con /Encrypt y con /Sig simulada.
Para cada combinación registra tiempo, memoria pico, validez (carga en PDF.js y en pdf-lib; qpdf --check si está disponible),
si conserva bytes originales y efecto sobre firma/cifrado.
Cierra con evidencia las hipótesis H-8 y H-9 de 02-arquitectura-interop.md §11.
Entregables: docs/perf/SPIKE-GUARDADO.md (tablas + comando y salida LITERAL de cada medición, con ruta del log) y un borrador de
ADR-0011 con la decisión recomendada y el plan de fallback. NO instales dependencias en el proyecto: usa un directorio de spike
aislado y declara cada dependencia y su licencia. NO modifiques src/ ni src-tauri/ del producto.
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
