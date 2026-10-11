# 03 — Plan por fases e hitos (con criterios de aceptación verificables)

> **PROPUESTA.** Convenciones: id `P<Fase>-<Bloque>.<Hito>`; el id va en el commit. **Tamaño**: S/M/L (ver
> `04` §4). Cada hito hereda el **DoD de `AGENTS.md` §7** (tsc sin `any`, tests unitarios, E2E×3 si aplica,
> sin warnings nuevos, `PARITY.md` con el test citado, verificación nativa del usuario si toca la ventana,
> `STATUS.md` actualizado y lo no hecho declarado). Aquí solo se listan los **criterios propios** del hito.
>
> **Atajo de lectura:** §0 camino recomendado · §1 Z · §2 resto de Fase 2 · §3 Fase 3 · §4 Fase 4 ·
> §5 Fase 5 · §6 Fase 6 · §7 transversales · §8 fuera de alcance · §9 camino B y su coste.

---

## 0. Secuencia recomendada (Camino A′)

```
Z.0 → Z.1 → Z.2 → C.3 → C.4 → C.5 → C.6 ─┐  (cierra Fase 2: sin Bloque D)
                                          ▼
 P3-A (fundamentos) → P3-B (escritura) → P3-C (lectura) → P3-D (guardado)
        → P3-E (revisión) → P3-F (capas y sellos) → P3-H (herramientas complementarias)
        → P3-G (compat. verificada; cierra la fase)
                                          ▼
                        Fase 4 (medición) → Fase 5 → Fase 6
```

Notas:
- `P3-A.1` (spike de guardado) y `P5-A.1` (benchmarks de planos grandes) **pueden empezar antes** que C.3–C.6
  si hay capacidad: son investigación sin tocar producto.
- **Bloque D de Fase 2 se disuelve:** `D.1 Capas` → `P3-F.1`; `D.2 Sellos` → `P3-F.2`. Fase 2 cierra tras
  C.5/C.6. (Requiere aprobar la enmienda de `SCOPE.md`; ver `04` §1.)

---

## 1. Bloque Z — Cierre contable y saneamiento (previo a todo)

### Z.0 — Contabilidad documental · **S** · sin dependencias
- **Alcance:** solo documentación. Alinear `ROADMAP.md`, `docs/STATUS.md`, `PARITY.md`, `docs/SCOPE.md`,
  `AGENTS.md` §5 con la realidad y con este plan (lista exacta de cambios en `04` §1–§2).
- **Criterios:** (1) numeración `C.1–C.5(+C.6)` coincide en los cuatro documentos; (2) A.6, B y P2-X
  figuran con su estado real; (3) `STATUS.md` cita conteos reales de tests **copiados** de `npm test`;
  (4) `node scripts/parity-check.mjs` sigue OK; (5) ninguna fila pasa a `shipped` sin test existente.
- **Pruebas:** `parity-check.mjs`; propuesta opcional: extender `parity-check.mjs` para validar que cada id
  citado en `PARITY.md` existe en `ROADMAP.md`.
- **Usuario:** revisa el diff de los documentos.

### Z.1 — Verificación nativa pendiente (C.1, C.2) · **S** · usuario
- Ejecutar `npm.cmd run tauri dev` en su terminal; ejercitar filtros/orden (C.1) y menú contextual de estados:
  cambio individual, de grupo, multiselección, `Ctrl+Z`/`Ctrl+Y`, `Escape` cierra el menú, clic derecho
  sobre selección múltiple conserva la selección. Pegar evidencia (consola, fichero en disco).
- Resultado: `PARITY.md` filas C.1/C.2 pasan de "PENDIENTE" a "Verificado por el usuario, <fecha>".
- **Condición previa:** el E2E de C.2 en verde **3 veces seguidas** (hoy hubo un fallo; ver `01` §3).

### Z.2 — Endurecimiento del migrador (`customColumns`, `customFields`, avisos) · **S–M** · sin dependencias
- **Problema:** `customColumns` no existe en `BbxDocumentFile` ni sobrevive a `migrateBbxDocument`; tipos y
  estados desconocidos se degradan sin avisar.
- **Alcance:** (a) añadir `customColumns?` a `BbxDocumentFile` y preservarlo/validarlo; (b) validar y
  preservar `Markup.customFields` (solo `string|number` finitos, longitud acotada); (c) `migrateBbxDocument`
  devuelve además `warnings: string[]` (tipo/estado desconocido, campos descartados) que la UI muestra como
  toast al abrir; (d) **sin subir de versión de esquema** (extensión opcional; documentar en ADR-0003 addendum).
- **Criterios:** ida y vuelta guardar→leer conserva `customColumns` y `customFields`; entradas hostiles
  (`__proto__`, números `NaN/Infinity`, cadenas gigantes, tipos erróneos) no lanzan excepciones no controladas y
  generan `warnings`; archivo con `status:'cancelled'` se conserva; tipo desconocido ⇒ advertencia visible.
- **Pruebas:** unit en `markup.test.ts` y `bbxPersistenceService.test.ts` (lectura del **fichero real**), con
  test que **falla** si se elimina la preservación. **No baja el conteo de tests.**
- **Usuario:** abre un `.bbx.json` manipulado y ve el aviso (verificación nativa).

---

## 2. Resto de la Fase 2 (Bloque C) + hito nuevo C.6

### P2-C.3 — Columnas personalizadas con parser de gramática cerrada · **M** · Z.2, C.2
- **Alcance:** definiciones de columna `{ id, nombre, tipo: texto|número|opción|calculada, opciones?,
  expresión? }`; valores por marca en `customFields`; edición en línea; mostrar/ocultar y orden de columnas;
  **ordenar y filtrar por columna** (extiende el motor de C.1).
- **Parser:** gramática **cerrada** (descenso recursivo): números, `+ - * /`, paréntesis, identificadores de
  **lista blanca** (campos numéricos de la marca como `strokeWidth`, `opacity`, `pageIndex`, y otras columnas
  numéricas), funciones permitidas `round, min, max, abs`. **Prohibido** `eval`, `new Function`, acceso a
  propiedades arbitrarias. Dependencias cíclicas detectadas. Límite de longitud y profundidad.
- **Errores:** división por cero y entradas inválidas producen error de celda controlado (nunca `NaN` ni
  excepciones); mensajes en español.
- **Criterios:** corpus hostil (`constructor`, `__proto__`, `process`, `this`, `;`, unicode raro, 10k
  caracteres) ⇒ error controlado; resultados exactos en casos conocidos; las columnas sobreviven a
  guardar/reabrir (Z.2); ordenar por columna calculada estable.
- **Pruebas:** unit (parser, evaluador, ciclos), propiedad (asociatividad/precedencia contra un oráculo
  distinto al evaluador), E2E (crear columna calculada, ordenar).
- **Diseño para el futuro:** los valores y definiciones se serializan por una **interfaz de persistencia** que
  en Fase 3 pasará a escribirse en `/REA` (anotación) y catálogo; no añadir campos fuera de
  `customFields/customColumns`.
- **Usuario:** crea columna "Área" calculada y verifica tras reabrir.

### P2-C.4 — Exportación: CSV y Reporte Resumen PDF · **M** · C.3
- **CSV:** RFC 4180, **BOM UTF-8**, fin de línea CRLF, comillas escapadas; respeta filtro, orden y columnas
  visibles; **mitigación de inyección de fórmulas** (celdas que empiezan por `= + - @ \t \r` se prefijan);
  codificación de `ñ/á` verificada en **bytes**.
- **PDF resumen (pdf-lib, sin dependencias nuevas):** portada con documento, fecha, autor; totales por
  estado/autor/tipo; tabla paginada de marcas; WinAnsi seguro (`sanitizeTextToWinAnsi`).
- **Guardado de archivos de exportación:** hoy el PDF exportado sale por descarga de `Blob`; **verificar** que
  funciona en la ventana nativa. Si no, añadir comando Rust `write_export_file(path, bytes)` con lista blanca de
  extensiones (`.csv .pdf .xlsx`), ruta absoluta y escritura atómica (ADR-0004 extendido) + diálogo "Guardar como".
- **Criterios:** test lee el **archivo real** (bytes: BOM, CRLF, comillas; PDF: texto del content stream y nº
  de páginas); 10 000 filas sin bloquear la UI (>X ms medido); inyección neutralizada.
- **No incluye:** `.xlsx` (Fase 4, `P4-D.2`), hipervínculos de filas a páginas (se añaden en `P3-E.3`).
- **Usuario:** abre el CSV en Excel (acentos correctos) y el PDF en un visor.

### P2-C.5 — E2E del bloque y verificación nativa · **S** · C.1–C.4, C.6
- E2E del flujo completo (filtrar, ordenar, columna, estado, exportar), **3 pasadas consecutivas**; verificación
  nativa del usuario; `PARITY/STATUS` actualizados; **Bloque C cerrado**.

### P2-C.6 — Inspector de propiedades de marca (NUEVO, requiere ADR y aprobación D-3) · **M**
- **Por qué:** hoy el color de las marcas nuevas lo fija la barra superior y el Tool Chest aplica estilos
  completos, pero **no se puede seleccionar una marca y cambiar su color/grosor/opacidad**. En Revu es la
  función central de edición.
- **Alcance:** panel (derecha o inferior, colapsable) con las propiedades de la selección: color de trazo,
  relleno, grosor, opacidad, guiones, tamaño de fuente, texto, estado, autor (solo lectura), capa; **valores
  mixtos** mostrados como "—"; aplica con **un único comando atómico** (reutiliza el mecanismo del Modo Propiedad
  del Tool Chest); campos deshabilitados según el tipo (p. ej. relleno en línea); "Guardar como herramienta".
- **Fuera de alcance:** edición por vértices; propiedades de medición (Fase 4); lista de "favoritos".
- **Criterios:** cambiar color de K marcas = 1 paso de historial; deshacer restaura estilo previo exacto;
  sin NaN en grosor/opacidad (clamp y validación); accesible por teclado; no altera hit-testing.
- **Pruebas:** unit (comando, mezcla de valores), componente, E2E×3; atajo para abrir el inspector.
- **Usuario:** cambia color/grosor de una marca existente y de una multiselección.

---

## 3. Fase 3 — Interoperabilidad PDF  (la más crítica)

> Prerrequisito de lectura: `02-arquitectura-interop.md`. ADR sugeridos (numeración tentativa): 0009
> Inspector, 0010 PDF como fuente de verdad, 0011 Escritor/guardado, 0012 Mapeo de anotaciones y `/REA`,
> 0013 Estados e hilos, 0014 Política de compatibilidad y observación, 0015 Capas (OCG).

### Bloque A — Fundamentos

**P3-A.1 — Spike de guardado (pdf-lib vs actualización incremental en Rust) · M**
- Medir, con fixtures sintéticos (§P3-A.2): tiempo, memoria, validez y efecto sobre firma/cifrado de A (pdf-lib),
  B (incremental, `lopdf` u escritor propio) y C (reescritura en Rust).
- **Entregables:** informe `docs/perf/SPIKE-GUARDADO.md` con tablas y **comando + salida literal**; ADR-0011 con la
  decisión; prototipo desechable en `scripts/spikes/` (no entra a `src/`).
- **Criterios:** decisión fundada en mediciones de ≥4 tamaños (≈2 kB, 5 MB, 50 MB, 100 MB) y ≥5 estructuras (xref
  clásica, *xref stream*, *object streams*, linearizado, con `/Annots` previas); H-8 y H-9 cerradas con evidencia.
- **Usuario:** aprueba la decisión.

**P3-A.2 — Generador de fixtures de interoperabilidad · M**
- `scripts/make-interop-fixtures.ts` (determinista, como `make-fixture.ts`) genera: base con `/Rotate`
  0/90/180/270, `CropBox ≠ MediaBox`, `MediaBox` con origen ≠ 0, `UserUnit`; PDF con **anotaciones foráneas**
  sintéticas de cada subtipo soportado + uno no soportado (`Widget`) + `Link` + `Popup`; PDF con estados y
  respuestas; PDF con firma **simulada** (diccionario `/Sig` sin criptografía, solo para pruebas estructurales);
  PDF cifrado (pdf-lib no cifra: generar con herramienta externa documentada o usar fixture de la librería de
  pruebas con licencia clara; si no hay, declararlo y probar solo la detección de `/Encrypt`).
- **Plano grande sintético** (para `P5-A`): hoja 3600×2400 pt con decenas de miles de trazos.
- **Criterios:** SHA-256 registrado en `ATTRIBUTION.md` (política de activos); reproducible (dos corridas =
  mismos bytes). **No** se usan PDFs ajenos ni guardados por Revu/Acrobat.

**P3-A.3 — Núcleo puro de anotaciones (`src/core/pdf/annotations/`) · M**
- Tipos del diccionario de anotación, constructores por subtipo, `pdfToNormalizedCoordinates`, mapeo de
  estado (`Review`), `/REA` (serialización/validación). **Sin React, sin Tauri, sin DOM.**
- **Criterios:** pruebas de propiedad de ida y vuelta de coordenadas (4 rotaciones × cajas distintas × UserUnit);
  tipos sin `any`; cada función pura documentada.

**P3-A.4 — ADR y enmienda de alcance (doc) · S** — ADR-0010 a 0015 en borrador aprobado; `SCOPE.md` enmendado
(§04). Sin esto no se codifica `P3-B`.

### Bloque B — Escritura (Markup → anotación con `/AP`)
Refactor previo dentro de P3-B.1: extraer `emitMarkupOperators` de `pdfExportService` **sin cambiar** la salida
del aplanado (los tests de oro actuales siguen verdes y no se eliminan).

| ID | Alcance | Criterios de aceptación | Pruebas | Tam. |
|---|---|---|---|---|
| **P3-B.1** | `Square`, `Circle`, `Line`, `Polygon`/`PolyLine` + `/BS`, guiones, `/IC`, opacidad, `/AP` | diccionario con claves exactas (`/Subtype`, `/Rect`, `/C`, `/BS /W`), `/AP` válido; aplanado intacto | L1 dorados, L3 carga, L4 píxeles ≤ tolerancia | M |
| **P3-B.2** | `FreeText` (texto y callout `/CL`), `Text` (nota adhesiva) | texto envuelto con AFM idéntico al visor; WinAnsi seguro; directriz adicional como `Line` hija | L1, L4 | M |
| **P3-B.3** | `Highlight` (`/QuadPoints`, multiply, `/CA 0.5`) para vectorial y de texto; grupos multilínea | un grupo ⇒ una anotación con N quads (decisión ADR-0012) y mapeo 1↔N | L1, L2 | M |
| **P3-B.4** | Nube y Cloud+: `/BE`, `/AP` con lóbulos de REA, `/REA.arcStep`, grupo `/IRT /RT /Group` | `arcStep=20` sobrevive a escribir→leer; lóbulos idénticos al visor | L1, L2, L4 | M |
| **P3-B.5** | `Ink` (lápiz) + mapeo de `highlight` legacy; marcador de `Stamp` (sin catálogo) | trazo con N puntos conservado | L1, L2 | S |
| **P3-B.6** | Metadatos comunes: `/NM`, `/T`, `/Subj`, `/Contents`, `/CreationDate`, `/M`, `/F 4`, `/P` + `/REA v1` | todas las marcas escritas llevan `/NM` = `Markup.id`; fechas en formato PDF (`D:YYYYMMDDHHmmSS`) | L1, L2 | S |

Cada hito B: **antes/después de cada escritura el aplanado produce los mismos bytes** que hoy (test de regresión).

### Bloque C — Lectura / Importación

**P3-C.1 — Parser de anotaciones a `Markup` · M**
- Lee el árbol `/Annots` de cada página (lector de bajo nivel); clasifica REA / foránea soportada / no
  soportada; `origin`, `pdfRef` y `dirty` en el modelo; coordenadas con `pdfToNormalizedCoordinates`.
- **Criterios:** fixtures A.2 ⇒ nº y tipo de marcas exacto; anotación foránea con color/grosor/guiones
  ⇒ estilo equivalente; entradas hostiles (`/Rect` NaN, `/QuadPoints` impares, referencias circulares, 100 000
  anotaciones) no cuelgan ni lanzan sin control (límites y avisos).

**P3-C.2 — Preservación (copy-on-write) y no soportadas · M**
- Foráneas no editadas conservan sus bytes; no soportadas visibles en lista como solo lectura con banner.
- **Criterios:** abrir→guardar sin editar ⇒ el diff binario de los objetos de anotación foráneos es **cero**
  (excepto `/NM` asignado, si faltaba).

**P3-C.3 — Render de dos capas (`AnnotationMode.DISABLE`) · M**
- Cambia `renderPageToCanvas` y añade el overlay unificado; **cierra H-10/H-14**.
- **Criterios:** fixture con N foráneas + M propias ⇒ overlay N+M y canvas base sin anotaciones (píxeles); sin
  cambios en `TextLayer` ni `hasText`; sin duplicados.

**P3-C.4 — Migración opt-in del sidecar `.bbx.json` al PDF · S–M**
- Diálogo explícito al abrir; no borra el sidecar; resultado idempotente (importar dos veces no duplica por `/NM`).

### Bloque D — Guardado

**P3-D.1 — Comando Rust de guardado de PDF · M–L** (según ADR-0011)
- `save_pdf` atómico: ruta absoluta, extensión, `.tmp` + `sync_all` + `rename`, limpieza en error, **backup**
  inicial por sesión, **validación posterior** (reabrir y contar páginas/anotaciones) antes del `rename`.
- **Pruebas Rust:** ruta relativa rechazada, extensión, atomicidad, sin `.tmp` residual, fallo simulado a mitad
  de escritura (no corrompe el original), archivo de solo lectura ⇒ error claro.
- **Prueba de caos:** matar el proceso durante la escritura ⇒ el original sigue íntegro (script documentado).

**P3-D.2 — Guardar / Guardar como / dirty de dos niveles · M**
- `Ctrl+S`, menú, aviso al cerrar con cambios sin guardar, notificación de fallo (nunca silencioso);
  autoguardado del sidecar se mantiene.
- **Criterios:** E2E×3 con guardar→reabrir; tests de estado (`dirtySinceAutosave/dirtySinceSave`).

**P3-D.3 — Firmas y cifrado: detección y política · S–M**
- Detecta `/Encrypt` y `/Sig`/`DocMDP`; Guardar ofrece "Guardar copia" y explica; jamás sobrescribe en silencio.
- **Usuario:** prueba con un PDF firmado real en su equipo (H-7).

### Bloque E — Revisión (estados, hilos, enlaces)

**P3-E.1 — Estados de revisión estándar · S–M** — `Review`/`State` ↔ `MarkupStatus`, historial como hijos,
undo elimina el hijo. Cierra H-3 con el checklist de Revu/Acrobat.

**P3-E.2 — Respuestas / hilos de comentarios · M–L** — modelo de respuestas, árbol en `MarkupsList`, comando con
undo, `/IRT /RT /R`, exportación a CSV/PDF incluye hilos. Cierra requisito de revisión de ingeniería.

**P3-E.3 — Hipervínculos (`/Link`) · M** — enlace a página/URL desde una región o marca; navegación al hacer clic;
filas de reportes enlazadas a páginas. (Sin `JavaScript`.)

### Bloque F — Capas y Sellos (ex Bloque D)

**P3-F.1 — Capas (OCG) · M–L** (requiere D-6) — leer `/OCProperties`, mostrar panel de capas, `/OC` en anotaciones,
visibilidad persistida en `/OCProperties /D` y en `/REA`, crear OCG nuevos para capas de marcas; filtro por capa
(el motor de C.1 ya lo soporta). **Criterios:** ocultar capa ⇒ marcas desaparecen en REA y en Acrobat/Revu (H-13).

**P3-F.2 — Sellos dinámicos vectoriales · M–L** — catálogo propio (vectorial, sin activos de terceros),
`/Stamp` con `/AP`, campos dinámicos resueltos en la colocación (`{{fecha}}`, `{{usuario}}`) guardados en
`resolvedFields`; **sin JavaScript/AcroForm**. **Criterios:** el texto resuelto aparece en el `/AP`; sello
editable; ATTRIBUTION si se incluye cualquier recurso.

### Bloque H — Herramientas de marcado complementarias (ejecutar ANTES del Bloque G)

> Hoy REA tiene 14 tipos de marca pero le faltan herramientas básicas de Revu/Acrobat. Se construyen **ya con su
> mapeo a anotación estándar** (más barato que hacerlas antes y migrarlas). Cada una exige ADR de alcance
> (`SCOPE.md` hoy prohíbe polilíneas abiertas, flechas independientes y duplicación; ver `04` §1.4).

| ID | Alcance | Mapeo PDF | Criterios clave | Tam. |
|---|---|---|---|---|
| **P3-H.1** | Flecha / línea con extremos (`LE`: flecha abierta/cerrada, círculo, ninguno) y **polilínea abierta** | `/Line` + `/LE`, `/PolyLine` | extremos configurables y persistidos; hit-testing por segmento; `/AP` correcto con rotación de página | M |
| **P3-H.2** | Cuadro de texto con borde/relleno y alineación; "máquina de escribir" (texto sin caja); borrador de trazo libre | `/FreeText` (`/BS`, `/IC`, `/Q`), `/Ink` | texto plano (sin rich text, `SCOPE` OUT #4); wrap con AFM; borrar parte de un trazo ⇒ un solo comando | M |
| **P3-H.3** | **Subrayado, tachado, ondulado** sobre texto real y *caret* (insertar/reemplazar) reutilizando el TextLayer de A.6 | `/Underline`, `/StrikeOut`, `/Squiggly`, `/Caret` | cobertura geométrica igual que A.6 (tolerancia declarada); multilínea atómica; aviso en página sin texto | M |
| **P3-H.4** | Imagen / foto como marca (insertar PNG/JPEG, escalar, rotar) | `/Stamp` con imagen en `/AP`, o `/FreeText` con XObject (decidir en ADR) | límite de tamaño y aviso si se excede; la imagen **del usuario** no se registra como activo del repo | M |
| **P3-H.5** | Productividad: copiar/pegar/duplicar (también entre páginas, con offset), alinear/distribuir, voltear/rotar marca, **bloquear** marca, orden Z, edición por vértices de polígonos/nubes | `/F` bit *Locked*, orden en `/Annots`, `/Vertices` | cada acción = **un** comando atómico con undo; bloqueada ⇒ no se mueve ni borra por UI; pegar conserva estilo y reasigna `id`/`/NM` | L |

### Bloque G — Compatibilidad verificada

**P3-G.1 — Puerta `--with-interop` · M** — consolida L1–L4 en `verify.mjs`; todos los sub-chequeos pueden fallar
(romper a propósito ⇒ rojo).
**P3-G.2 — Checklist Revu/Acrobat y matriz · M (usuario)** — ejecución de `04` §5; resultados en
`docs/INTEROP.md` (matriz tipo × visor × propiedad) y columna nueva en `PARITY.md`.
**P3-G.3 — Cierre de Fase 3 · S** — 3 pasadas E2E, verificación nativa, docs; hipótesis H-1..H-7, H-10..H-14
cerradas o convertidas en "limitación conocida".

---

## 4. Fase 4 — Medición y Takeoff  (núcleo del público construcción)

> ADR: escala y `/Measure`, aritmética de costes (dinero en unidades mínimas), XLSX. Dependencia: Fase 3.

### Bloque A — Escala
- **P4-A.1 Modelo de escala · M:** escala por página y por **región** (rectángulo con su escala, como los
  *viewports* de Revu y el diccionario `/VP` + `/Measure /Subtype /RL` del estándar); unidades (mm, cm, m, in,
  ft-in fraccionario) y precisión; persistencia en `/REA` + estándar (H-11).
- **P4-A.2 Calibración · M:** elegir un segmento y escribir la distancia real; presets (1:100, ¼"=1'-0"…);
  **guardas** contra distancia 0/negativa/NaN; indicador visible de escala activa. **Criterio de oro:** el
  rectángulo conocido de `fixtures` (300×200 pt) mide exactamente lo esperado a una escala dada; invariante
  al zoom, a la rotación de página (0/90/180/270) y a `UserUnit`.
- **P4-A.3 Escalas múltiples por hoja · M:** detalles con escala distinta; la medición usa la escala de la
  región que la contiene (prioridad definida y probada); recalibrar **recalcula todas** las mediciones
  dependientes con un comando atómico.

### Bloque B — Herramientas de medición
- **P4-B.1 Longitud y polilínea · M:** `Line`/`PolyLine` + `/Measure`; etiqueta con valor y unidad.
- **P4-B.2 Perímetro y área con recortes · L:** polígono + *cutouts* (huecos) como hijos del grupo; área = exterior −
  huecos (fórmula del área firmada ya implementada para nubes); detección de polígonos autointersecantes ⇒ aviso.
- **P4-B.3 Conteo · M:** marcadores contables por *Subject* (símbolo y color), auto-numeración opcional, totales por
  Subject; selección y conteo por región.
- **P4-B.4 Ángulo, radio, diámetro · M:** medición de 3 puntos; radio/diámetro sobre círculos.
- **P4-B.5 Volumen/profundidad · S–M (Should):** área × profundidad con unidad cúbica.
- **P4-B.6 Acotación con flechas y texto · M (Should):** `Line` con `/LE ClosedArrow` + etiqueta.
- **P4-B.7 Imanes/snap · M (Should):** a extremos, ortogonal. (Hoy "snap ortogonal" figura OUT en F2; levantar con ADR.)

### Bloque C — Datos de takeoff
- **P4-C.1 Columnas de medición · M:** Subject, Capa, Página, Longitud, Área, Perímetro, Conteo, Unidad en la
  lista; formateo según unidad; usa el motor de C.3.
- **P4-C.2 Subtotales y agrupación · M:** por Subject/Capa/Página; totales; **sumar antes de redondear**.
- **P4-C.3 Costes · M–L:** catálogo de precios unitarios por Subject; costes calculados con la gramática cerrada
  de C.3. **Dinero en unidades mínimas enteras (o decimal exacto), política de redondeo escrita en ADR; nada de
  `float` para importes.** Moneda y formato configurables.
- **P4-C.4 Herramientas de medición en el Tool Chest · M:** guardar una herramienta con Subject, color, unidad,
  plantilla de etiqueta; arrastre al lienzo (ya existe el mecanismo).

### Bloque D — Informes
- **P4-D.1 CSV de takeoff · S** (reutiliza C.4).
- **P4-D.2 XLSX · M–L:** ADR de implementación (escritor OOXML mínimo + `fflate` vs librería). Fórmulas
  vivas en celdas de totales. **Prueba:** descomprimir el `.xlsx` real y validar XML y fórmulas; verificación
  del usuario en Excel (y LibreOffice si lo tiene).
- **P4-D.3 Informe PDF · M:** leyenda, resumen por Subject, tabla de partidas, **hipervínculos** de cada fila a
  su página/marca.
- **P4-D.4 Plantillas de informe · S–M:** guardar columnas/agrupación/orden.

### Cierre
- **P4-E.1:** escenarios de aceptación `06` §3 (takeoff de planta) en E2E×3 + verificación del usuario con un plano
  real y comparación con su medición manual (tolerancia acordada).

---

## 5. Fase 5 — Documento, Navegación y Rendimiento

> OJO: no es la "Fase 5 de gran formato y GPU" eliminada del plan. Aquí **no hay GPU**; el rendimiento se
> decide por **mediciones** (`P5-A.1`) y la meta numérica la fija el usuario (D-7).

### Bloque A — Rendimiento de planos grandes
- **P5-A.1 Banco de pruebas · M:** planos sintéticos (E-size 3600×2400 pt; 300 páginas; ≈100 MB) y harness que mide
  *time-to-first-render*, memoria pico, latencia de zoom/pan y de interacción con 5 000 marcas;
  `docs/perf/BASELINE.md` con salida literal. **Sin umbrales inventados:** se proponen tras medir.
- **P5-A.2 Render por mosaicos · L:** hoy el canvas único a `escala × dpr` puede exceder el límite del navegador a zoom
  alto; dibujar por regiones visibles con caché; zoom máximo definido por mediciones.
- **P5-A.3 Carga por rangos · M–L:** evitar leer el archivo completo (`readFile`) vía protocolo de assets o servidor
  local de rangos; medir memoria antes/después.
- **P5-A.4 Escalabilidad de marcas · M:** índice espacial para *hit-testing*; virtualización del overlay y de la
  lista con miles de marcas.

### Bloque B — Navegación
- **P5-B.0 Refactor de `PdfViewer.tsx` · M–L:** dividir el monolito (shell, controlador de interacción, overlay,
  capa de texto) **sin cambiar comportamiento** (E2E y unit existentes como red de seguridad). *Prerrequisito de B.1–B.2.*
- **P5-B.1 Vista continua multipágina con virtualización · L:** scroll vertical, overlay por página, atajos.
- **P5-B.2 Pestañas / multi-documento · L:** stores por documento, historial por documento, aviso de cambios.
- **P5-B.3 Marcadores y etiquetas de página · M:** leer/editar el *outline*, ir a página.
- **P5-B.4 Búsqueda de texto · M:** con resultados resaltados y navegación entre coincidencias.
- **P5-B.5 Navegación: mano, ajustar ancho/página, zoom a ventana · S–M.**
- **P5-B.6 Abrir desde el sistema · M:** asociación de archivos `.pdf` ("Abrir con"), argumentos de línea de
  comandos, instancia única, recientes. *Restricción:* `dragDropEnabled:false` impide arrastrar archivos del SO a la
  ventana vía Tauri; la ruta soportada será "Abrir con"/diálogo (o `File` HTML5 sin ruta).
- **P5-B.7 Instantánea (snapshot) · S (Could).**

### Bloque C — Operaciones de páginas
- **P5-C.1 Insertar/eliminar/reordenar/rotar/extraer · L:** **remapeo de `pageIndex` de marcas y de `/Annots`**,
  historial a nivel de documento. Pruebas sobre bytes reales.
- **P5-C.2 Recorte (CropBox), encabezados/pies, numeración, marca de agua · M.**
- **P5-C.3 Combinar PDF y aplanado · M** (reutiliza el export vectorial existente).
- **P5-C.4 Procesos por lotes · M–L:** rotar/numerar/aplanar sobre varios archivos con informe de errores (nada de
  fallos silenciosos).

### Bloque D — OCR (Could)
- **P5-D.1:** OCR local (p. ej. `tesseract.js`) sobre páginas escaneadas para hacerlas buscables; ADR de peso/idiomas.

---

## 6. Fase 6 — Comparación y Sets
- **P6-A.1 Superposición (Overlay) · L:** dos páginas con tintes complementarios, alineación por 2 puntos
  (traslación/rotación/escala), diferencia por píxeles; exportable.
- **P6-A.2 Comparar documentos · L:** diferencias de texto y visuales; las regiones cambiadas generan **nubes**
  (anotaciones) con autor "Comparación".
- **P6-B.1 Vista dividida sincronizada · M:** paneo/zoom enlazados.
- **P6-C.1 Sets de planos · L:** colección de PDFs con índice de hojas, reconocimiento de número/título de hoja y
  **hiperenlaces** entre hojas (reutiliza `P3-E.3`).

---

## 7. Transversales (pistas continuas)

| ID | Tema | Contenido | Cuándo |
|---|---|---|---|
| **T1** | Seguridad | Endurecer `csp:null` y `fs:allow-write-file` (preferir comandos acotados); límites ante PDFs hostiles (tamaño, nº de páginas/anotaciones, recursión, tiempo); XSS en texto de marcas dentro del SVG (confirmar escape; sin `dangerouslySetInnerHTML`); CSV injection; revisión de dependencias | Antes de P3-D y antes de distribuir |
| **T2** | Empaquetado y distribución | Instalador (MSI/NSIS), firma de código, actualizaciones, versionado, registro local de errores | Antes de la 1.ª entrega a terceros |
| **T3** | Accesibilidad e i18n | Roles/ARIA, foco, contraste; extraer cadenas ES a catálogo | Continuo |
| **T4** | Rendimiento continuo | Umbral de bundle (puerta de `verify.mjs`), división de chunks | Continuo |
| **T5** | Documentación de usuario | Guía de uso, atajos, limitaciones de compatibilidad (`docs/INTEROP.md`) | Fase 3 en adelante |
| **T6** | Higiene de repo | `.gitattributes` (LF/CRLF), un commit por hito, nunca `git add -A` | Ya |
| **T7** | Marca y nombre | Revisión de "REA = Revu Engineering Architecture" y `.bbx.json` (D-8) | Antes de distribuir |

## 8. Fuera de alcance (con motivo)

| Capacidad de Revu | Motivo | ¿Cuándo reconsiderar? |
|---|---|---|
| Studio (sesiones/proyectos en la nube) | Colaboración remota; contradice local-first | Solo con decisión de producto |
| Creación de PDF desde Office/CAD (impresora virtual, plug-ins) | Ingeniería de drivers/plug-ins | Tras Fase 6 |
| Formularios AcroForm completos y JavaScript | Superficie de seguridad enorme | Solo campos básicos, tras Fase 5 |
| Firmas digitales con certificado (crear) | Criptografía y cumplimiento | Tras Fase 5, con ADR |
| Redacción real (eliminar contenido) | Requiere reescribir content streams con garantías | Tras Fase 5, con ADR |
| Scripts/automatización de Revu, 3D, vídeo/sonido | Valor bajo para el público | No planificado |
| App móvil / iPad | Otro producto | No planificado |

## 9. Camino B (terminar Fase 2 completa antes de Fase 3) y su coste

Secuencia: `Z → C.3 → C.4 → C.5 → D.1 → D.2 → Fase 3…`. Es válido si el usuario prioriza cerrar la Fase 2 ya.
**Retrabajo previsible** (estimación):

| Hito B | Qué habría que rehacer en Fase 3 |
|---|---|
| D.1 Capas (persistidas en `.bbx.json`) | Reescribir persistencia a OCG/`/OC`; migrar datos; nuevos tests |
| D.2 Sellos (primitivas + `resolvedFields` en sidecar) | Pasar a `/Stamp` con `/AP`; mapear campos dinámicos |
| C.3 Columnas (persistidas en sidecar) | Mapear a `/REA` por anotación y definiciones al catálogo |
| C.4 Exportaciones | Poco; leen el modelo, no el almacenamiento |

**Mitigación si se elige B:** cumplir "no añadir campos fuera de `customFields/customColumns/layer/stampId/
resolvedFields`" y centralizar la serialización detrás de una interfaz para limitar el cambio a un adaptador.
