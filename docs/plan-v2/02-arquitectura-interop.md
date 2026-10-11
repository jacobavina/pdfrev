# 02 — Arquitectura de interoperabilidad PDF (diseño propuesto)

> **Estado: PROPUESTA.** Contiene borradores de decisiones que se convertirán en ADR (numeración tentativa
> ADR-0009 en adelante; el número definitivo lo fija quien lo escriba, siguiendo el orden de `docs/DECISIONS/`).
> Todo comportamiento de Revu/Acrobat citado aquí es **hipótesis** hasta que figure en el registro §11 con evidencia.
> Fundamento normativo: ISO 32000-1/-2 (PDF), especificación pública. **No** se consulta ni deriva nada de
> binarios ni código de Bluebeam (`AGENTS.md` §2).

---

## 1. Objetivo y principios

**Objetivo:** que un PDF guardado por REA (a) se abra en **Revu y Acrobat** mostrando las marcas, (b) permita
**editarlas allí** como anotaciones nativas, (c) conserve el estado de revisión, respuestas y agrupaciones, y
(d) que REA abra PDFs con anotaciones hechas por otros **sin perder ni alterar nada**.

**Principios (de obligado cumplimiento para los hitos de la Fase 3):**

1. **El PDF es la fuente de verdad** de las marcas. El `.bbx.json` pasa a ser respaldo de autoguardado y
   formato legado importable.
2. **Estándar primero:** se escriben únicamente anotaciones y estructuras definidas por ISO 32000. Los datos
   propios de REA viajan en **una sola clave namespaced** (`/REA`, §6) que otros visores pueden ignorar.
3. **Nunca reescribir lo que no se entiende:** toda anotación no soportada o no editada se conserva **byte a
   byte** (copy-on-write, §5.3).
4. **Una sola fuente de geometría:** la apariencia `/AP` y el aplanado salen del mismo emisor de operadores
   PDF (extensión de ADR-0006); no se duplica código de dibujo (`AGENTS.md` §4).
5. **Nunca perder trabajo:** escritura atómica, validación posterior, copia de seguridad inicial, y bloqueo
   explícito (con aviso en UI) cuando el archivo no se pueda escribir con seguridad (firmado/cifrado).
6. **Aditivo:** el export aplanado y todos sus tests se mantienen ("Exportar aplanado"). No se reabre la Fase 1.

## 2. Modelo de dos capas (documento base + anotaciones gestionadas)

Problema concreto **[V]**: hoy `renderPageToCanvas` llama a `page.render()` sin `annotationMode`, por lo que
PDF.js **dibuja las anotaciones que el PDF ya tenga**. Si REA empieza a escribir `/Annots` y además las dibuja
en su overlay SVG, **se duplicarían visualmente**.

**Diseño propuesto:**

```
 ┌──────────── bytes originales del PDF (en disco) ────────────┐
 │  contenido de página  +  anotaciones foráneas  + otros      │
 └───────────────┬─────────────────────────────────────────────┘
                 │ al abrir
        ┌────────▼─────────┐        ┌──────────────────────────────┐
        │ CAPA BASE        │        │ CAPA GESTIONADA (en memoria) │
        │ PDF.js, con      │        │ Markup[] = anotaciones de    │
        │ annotationMode:  │        │ REA + foráneas soportadas    │
        │ DISABLE          │        │ (editables) + referencias a  │
        └────────┬─────────┘        │ las no soportadas (opacas)   │
                 │ canvas           └───────────┬──────────────────┘
                 └──────────────┬───────────────┘
                         overlay SVG (REA dibuja todas las marcas)
```

- **Lectura:** PDF.js renderiza la **página sin anotaciones** (`AnnotationMode.DISABLE`), y REA dibuja **todas**
  las marcas soportadas (propias o foráneas) desde su modelo. Cero duplicados por construcción.
- **No soportadas** (p. ej. `Widget`, `FileAttachment`, `Sound`, `Redact`): se conservan intactas en el
  archivo y se muestran como entradas **de solo lectura** en la lista ("Otro: Widget"), con aviso en UI del
  número de elementos que REA no puede mostrar. **[H]** Los `Link` y `Popup` no tienen representación visual.
- **Alternativa a evaluar en el spike `P3-A.1`:** renderizar las no soportadas con la `AnnotationLayer` de
  PDF.js. Se descarta como valor por defecto por complejidad (capa DOM, formularios) hasta tener un caso real.
- **Prueba que la protege:** fixture con N anotaciones foráneas + M propias → el overlay muestra N+M; el
  canvas base, 0 (comparación de píxeles del canvas con y sin anotaciones).

## 3. Mapeo marca → anotación PDF estándar

> `[ISO]` = definido en ISO 32000-1 §12.5 (anotaciones) salvo indicación. Claves comunes: `/Type /Annot`,
> `/Subtype`, `/Rect`, `/P` (página), `/NM` (nombre único = `Markup.id`), `/T` (autor), `/Subj`, `/Contents`,
> `/CreationDate`, `/M` (modificación), `/F 4` (Print), `/C` (color de trazo), `/CA` (opacidad), `/BS`
> (estilo de borde: `/W` grosor, `/S /S|/D`, `/D [..]` guiones), `/AP << /N stream >>` (apariencia) y `/REA`
> (§6). Las coordenadas están en el **espacio de usuario por defecto de la página** (sin rotación visual).

| Marca REA | Anotación PDF | Claves específicas | Notas / divergencias aceptadas |
|---|---|---|---|
| `rectangle` | `/Square` | `/IC` (relleno), `/RD` si procede | Directo. |
| `circle` | `/Circle` | `/IC` | Elipse = `/Rect`. |
| `line` | `/Line` | `/L [x1 y1 x2 y2]`, `/LE [/None /None]` | Flechas futuras: `/LE /OpenArrow`/`/ClosedArrow`. |
| `polygon` | `/Polygon` | `/Vertices [..]`, `/IC` | Abierto → `/PolyLine`. |
| `cloud` | `/Polygon` o `/Square` + `/BE << /S /C /I 1|2 >>` | `/REA.arcStep` | **Divergencia:** `/BE` del estándar tiene lóbulos propios; REA usa `arcStep`. El `/AP` conserva el aspecto de REA; si el otro visor **regenera** la apariencia al editar, los lóbulos cambiarán (hipótesis H-6). |
| `cloudPlus` | `cloud` + `callout` agrupados | `/IRT` + `/RT /Group` | Líder = la nube. |
| `callout` | `/FreeText` con `/IT /FreeTextCallout` | `/CL [x1 y1 x2 y2 (x3 y3)]`, `/DA`, `/Q`, `/RD`, `/LE` | El estándar admite **una** directriz en `/CL`. Directrices adicionales de REA (`leaders[]`): anotaciones `/Line` hijas del grupo (`/RT /Group`). |
| `text` | `/FreeText` | `/DA (/Helv n Tf r g b rg)`, `/Q`, `/DR` | Fuente Helvetica (AFM ya implementado); texto fuera de WinAnsi: limitación documentada. |
| `stickyNote` | `/Text` | `/Name /Note`, `/Open false`, `/F` | REA usa icono de 24 pt **en unidades de página** (zoom-variante, decisión A.4); los visores usan `NoZoom`. Divergencia aceptada. |
| `freehand` | `/Ink` | `/InkList [[x y …]]`, `/BS` | Directo. |
| `highlightVector` | `/Highlight` | `/QuadPoints`, `/C`, `/CA 0.5`, `/AP` con `/BM /Multiply` | Directo. |
| `highlightText` | `/Highlight` | `/QuadPoints` (un quad por línea) | Decisión de diseño (ADR): **una anotación por grupo con N quads** (como hacen los visores) vs. N anotaciones agrupadas. Recomendación: una por grupo; el modelo interno conserva N marcas y `/REA.lineIds` mapea 1↔N. |
| `highlight` (legacy F1) | `/Highlight` | idem | Solo importación/compatibilidad. |
| `stamp` (D.2/F.2) | `/Stamp` | `/Name`, `/AP` | Catálogo propio, vectorial. |
| mediciones (Fase 4) | `/Line`, `/PolyLine`, `/Polygon` | `/Measure`, `/IT`, `/Subj` | Ver `03` Fase 4. |

**Estado de revisión (clave para `cancelled`):** ISO 32000 §12.5.6.3 define el modelo `Review` con estados
**None, Accepted, Rejected, Cancelled, Completed**. Se almacena como **anotación hija** `/Subtype /Text`
con `/IRT <padre>`, `/RT /R`, `/StateModel (Review)`, `/State (Accepted)`, `/T` (autor), `/CreationDate`.
Correspondencia: `pending` ↔ `None`; los otros cuatro, idénticos. Vale el estado **más reciente por fecha**.
El historial queda como cadena de hijos (**H-3** a verificar en Revu).

**Respuestas (hilos):** `/Subtype /Text` con `/IRT`, `/RT /R` y `/Contents`; requiere extensión del modelo (`P3-E.2`).

**Agrupación:** `/IRT` apuntando al líder + `/RT /Group` (§12.5.6.3). `groupId` de REA ↔ líder del grupo.

**Capas:** `/OC` (diccionario de contenido opcional) apuntando a un OCG; requiere leer/escribir
`/OCProperties` del catálogo (levantar `SCOPE.md` OUT #8, decisión D-6; `P3-F.1`).

**Hipervínculos:** `/Link` con `/A << /S /GoTo /D [...] >>` o `/URI` (`P3-E.3`).

## 4. Flujo de apariencia (`/AP`)

Sin `/AP`, algunos visores dibujan la anotación desde sus propias reglas (diferente a REA) y otros no la
muestran. Por eso **toda anotación escrita por REA lleva `/AP /N`**: un *Form XObject* con `/BBox = /Rect`,
`/Resources` (fuentes, `ExtGState` con `/CA /ca /BM`) y un content stream con los operadores de la marca.

**Refactor clave (pero acotado):** extraer de `pdfExportService` un emisor **puro** de operadores
`emitMarkupOperators(markup, transform) → { operators: string, resources }` en `src/core/pdf/`. El **aplanado**
lo usa para pintar en la página y el **escritor de anotaciones** lo usa para el `/AP`. Los tests de oro
existentes del content stream (`Criterio 3 (TEST DE ORO)…`, etc.) **protegen el refactor** y no se tocan.

Requisitos: opacidad (`/CA` en `ExtGState`), multiply (`/BM`), guiones (`/D`), texto con Helvetica y `wrapText`
con AFM (ya existe), rotación de página (`/Rotate`) y `CropBox ≠ MediaBox`.

## 5. Importación (lectura de anotaciones)

### 5.1 Quién lee
**No basta PDF.js `getAnnotations()`:** no expone claves desconocidas (`/REA`), y para round-trip hay que ver
el diccionario crudo. Se propone leer el árbol de anotaciones con un lector de bajo nivel (pdf-lib `PDFDict`
en TypeScript o `lopdf` en Rust; lo decide el spike `P3-A.1`). PDF.js se usa solo para renderizar.

### 5.2 Clasificación en tres clases
| Clase | Criterio | Tratamiento |
|---|---|---|
| **REA** | tiene `/REA` válido | Restauración de máxima fidelidad (`arcStep`, `groupId`, `customFields`, `layer`…). |
| **Foránea soportada** | subtipo mapeable, sin `/REA` | Mapeo *best-effort* a `Markup` con `origin:'foreign'`; **se conserva el diccionario original**. |
| **No soportada** | subtipo sin mapeo | Opaca: se conserva, se lista como solo lectura. |

### 5.3 Copy-on-write (regla de seguridad)
Una anotación foránea **no editada** no se reescribe ni se regenera: sus bytes originales se preservan. Solo
al editarla se serializa la versión de REA y se reemplaza el objeto. Esto evita corromper el trabajo de otros.

### 5.4 Ida y vuelta de identidad
`/NM` ↔ `Markup.id`. Si falta `/NM` en una foránea, REA asigna uno **al guardar** y lo escribe (el único
cambio permitido sobre una anotación no editada, documentado en ADR).

### 5.5 Conversión de coordenadas inversa
Hoy existe `normalizedToPdfCoordinates(point, transform)`. Hace falta su inversa
`pdfToNormalizedCoordinates` con **pruebas de propiedad**: ida y vuelta idéntica para `/Rotate` 0/90/180/270,
`MediaBox` con origen distinto de (0,0), `CropBox ≠ MediaBox`, y `UserUnit ≠ 1`. **[H]** Verificar qué caja usa
hoy la conversión (MediaBox vs CropBox).

## 6. Metadatos propios: la clave `/REA`

Un único diccionario por anotación; los visores deben ignorarlo (**H-2**: a verificar que lo conservan al
re-guardar):

```
/REA << /v 1            % versión del esquema de metadatos
        /tool (cloud)   % tipo de marca de REA
        /arcStep 20
        /groupId (uuid) /layer (nombre)
        /lineIds [(id1)(id2)]
        /fields << /clave (valor) >>   % customFields / valores de columnas
     >>
```

A nivel de documento: `/REA` en el catálogo con `v` y definiciones (`customColumns`, escalas, etc.) para que
las columnas y los ajustes **viajen con el PDF**. Convención: claves de segunda clase (ISO 32000 Anexo E);
`v` permite migraciones con la misma disciplina que `.bbx.json` (validar, no degradar en silencio).

## 7. Guardado

### 7.1 Opciones (el spike `P3-A.1` decide con mediciones)

| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| **A. `pdf-lib` reescritura completa** | `PDFDocument.load` → añadir `/Annots` → `save()` | Cero Rust nuevo; ya es dependencia | Reescribe todo: **invalida firmas**, no admite cifrado, pierde linearización, memoria ≈ varias veces el tamaño en planos de 100 MB |
| **B. Actualización incremental (append)** en **Rust** | Leer xref/trailer, añadir objetos nuevos + sección `xref` + `/Prev` | Conserva bytes originales (firmas, rapidez), no mueve 100 MB por IPC (solo parche), es como guardan Acrobat/Revu | Más código; parser de xref (tablas, *xref streams*, *object streams*) — usar `lopdf` si lo permite |
| **C. Reescritura en Rust (`lopdf`)** | Igual que A pero en Rust | Mismo manejo de memoria nativo | Mismas pérdidas que A |

**Recomendación (a validar):** **B** como destino, con **A como respaldo** y reglas explícitas de bloqueo:

- PDF **cifrado** o **firmado** que no se pueda actualizar de forma incremental segura → el botón Guardar
  ofrece **"Guardar copia"** (a otro archivo) y avisa; jamás sobrescribe en silencio.
- Salvaguarda: antes del primer guardado de la sesión sobre un PDF existente, **copia de seguridad**
  `<nombre>.pdf.rea-backup` (una por sesión).
- **Validación posterior** antes del `rename`: reabrir el resultado con PDF.js y con el lector de bajo nivel y
  comprobar nº de páginas y nº de anotaciones esperado; si falla → no se reemplaza y se notifica.

### 7.2 Comando Rust propuesto
`save_pdf(path, patch)` / `save_pdf_as(path, bytes)`: ruta absoluta, extensión `.pdf`, escritura a `.tmp`,
`sync_all`, `rename`, limpieza en error (idéntico a `write_bbx`, ADR-0004). **[H]** Transportar 100 MB por IPC
como JSON es inviable; si se elige A/C con bytes, usar cuerpo binario crudo de Tauri 2 (`ipc::Request`) o
pasar solo la ruta y que Rust lea el original (opción B).

### 7.3 Semántica de guardado en dos niveles
- **Autoguardado (cada 30 s):** sigue escribiendo el **sidecar** `.bbx.json` (pequeño, atómico, rápido) como
  *recuperación ante caída*.
- **Guardar (Ctrl+S) / Guardar como:** escribe el **PDF**. Aviso al cerrar con cambios sin guardar en el PDF.
- Estado `isDirty` se divide en `dirtySinceAutosave` y `dirtySinceSave` (`P3-D.2`).
- **Migración legado:** si al abrir un PDF existe un sidecar con marcas y el PDF no tiene marcas de REA, se
  **ofrece** importarlas al PDF (diálogo, nunca silencioso) y **no** se borra el sidecar.

## 8. Reconciliación con ADR-0003

ADR-0003 justifica el sidecar para "no alterar planos con firma digital". La propuesta lo respeta así:
guardado **incremental** (no altera el contenido firmado; **H-7** a verificar el comportamiento ante la
política de cambios permitidos), detección de firmas, y fallback a copia. No se borra el ADR: se **enmienda**
con un ADR nuevo que lo referencia ("Supersedes parcial").

## 9. Rendimiento y límites

- Hoy se lee el archivo **entero** en memoria (`readFile`). Para planos de ~100 MB, el diseño de guardado B
  y la carga por rangos (Fase 5) importan; el spike mide antes de decidir.
- Ver `03` Fase 5 (mosaicos, límites de canvas, memoria).

## 10. Política de compatibilidad y de observación (borrador de ADR)

1. **Fuente:** solo la especificación pública ISO 32000 y **observación de caja negra** del comportamiento de
   visores sobre **PDFs sintéticos generados por nosotros** (`scripts/make-interop-fixtures.ts`).
2. **Prohibido** derivar claves o estructuras propietarias de Bluebeam inspeccionando archivos de terceros
   producidos por Revu. Si al re-guardar un fixture nuestro Revu añade claves propias, **se registran como
   observación**, no se reproducen para imitar a Revu salvo que tengan equivalente estándar.
3. **Evidencia de compatibilidad:** informe textual del usuario (checklist `04` §5). Las **capturas de pantalla
   de Revu/Acrobat** se guardan **solo** en `plan/bluebeam/` y `plan/acrobat/` (gitignored); **no** se
   commitean (política de activos, `AGENTS.md` §1).
4. **PDFs guardados por Revu/Acrobat a partir de nuestros fixtures** no se commitean (son derivados de software de
   terceros); se conservan localmente en `plan/` y los tests del repo usan solo fixtures generados.
5. Las menciones a "Revu"/"Bluebeam"/"Acrobat" en docs y UI son **nominativas** (compatibilidad), nunca como
   marca propia (ver `04` §7).

## 11. Registro de hipótesis (todas deben cerrarse con evidencia)

| ID | Hipótesis | Cómo se verifica | Quién | Si falla |
|---|---|---|---|---|
| H-1 | Revu y Acrobat muestran las anotaciones con su `/AP` tal cual, sin regenerarlas al abrir | Checklist en ambos | Usuario | Revisar flags (`/F`), añadir `/AP` completo, ver H-6 |
| H-2 | Ambos conservan la clave `/REA` al re-guardar | Abrir, mover una marca, guardar, reabrir en REA | Usuario + agente | Respaldar `/REA` también en `/Contents`-metadato o sidecar; degradar con aviso |
| H-3 | Revu y Acrobat interpretan `/StateModel /Review` como estado en su lista | Checklist | Usuario | Documentar; mapear solo en REA |
| H-4 | `/IRT` + `/RT /Group` agrupa en ambos | Checklist | Usuario | Documentar; usar `/GroupName`? (a investigar) |
| H-5 | `/Highlight` con multiply en `/AP` se ve igual | Checklist | Usuario | Ajustar `/AP`/`/BM` |
| H-6 | Editar una nube `/BE` en Revu/Acrobat **regenera** lóbulos distintos | Checklist | Usuario | Aceptar divergencia (documentada) o usar `/Ink`/`/Polygon` sin `/BE` |
| H-7 | El guardado incremental preserva firma válida cuando la política de cambios lo permite | Fixture firmado (el usuario lo firma en Acrobat) | Usuario | Bloquear escritura en firmados |
| H-8 | `lopdf` (versión elegida) lee *xref streams*/*object streams* y permite actualización incremental | Spike con fixtures | Agente | Escritor incremental propio mínimo o fallback A |
| H-9 | IPC binaria de Tauri 2 es viable para decenas de MB; si no, opción B por ruta | Benchmark | Agente | Opción B |
| H-10 | `AnnotationMode.DISABLE` no altera `TextLayer`/`hasText` ni la medida del canvas | Tests unit/E2E | Agente | Ajustar el render |
| H-11 | Revu y Acrobat leen `/Measure` + `/VP` de nuestras mediciones | Checklist (Fase 4) | Usuario | Documentar; mantener datos en `/REA` |
| H-12 | `/FreeText` callout con `/AP` propio se conserva al editar | Checklist | Usuario | Documentar divergencia |
| H-13 | Revu/Acrobat respetan `/OC` en anotaciones con OCG nuevos | Checklist (`P3-F.1`) | Usuario | Documentar |
| H-14 | PDF.js 4.x con `DISABLE` sigue pintando contenido de página idéntico (sin formularios) | Prueba de píxeles | Agente | — |

## 12. Pruebas: el harness de interoperabilidad (niveles L1–L5)

| Nivel | Qué prueba | Artefacto leído | Dónde corre |
|---|---|---|---|
| **L1** Unit puro | Marca → diccionario de anotación y `/AP` (dorados) | diccionario serializado, content stream del `/AP` | Vitest |
| **L2** Ida y vuelta | exportar → importar = identidad (propiedades, 4 rotaciones, CropBox, UserUnit) | PDF en memoria + modelo | Vitest |
| **L3** Validez estructural | El PDF resultante carga en pdf-lib y PDF.js, páginas y anotaciones esperadas; `xref` coherente; (opcional) `qpdf --check` si está instalado | bytes reales del PDF | Vitest / script |
| **L4** Equivalencia visual | El `/AP` renderizado por PDF.js (con `ENABLE`) ≈ el overlay SVG de REA (tolerancia en % de píxeles) | píxeles del canvas | Playwright |
| **L5** Visores reales | Checklist del usuario en **Revu y Acrobat** | informe textual + archivos | Usuario |

Puerta nueva `node scripts/verify.mjs --with-interop` (L1–L4). L5 es manual y por bloque (`04` §5).
Todos los sub-chequeos deben poder fallar (`AGENTS.md` §6).

## 13. Riesgos principales

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| El visor ajeno regenera apariencia y cambia el aspecto (nubes, callouts) | Media | Medio | `/AP` completo; documentar divergencias; matriz de compatibilidad en `docs/INTEROP.md` |
| Corrupción del plano original al guardar | Baja | **Crítico** | Atómico + backup + validación posterior + incremental; fixture de caos (kill mid-write) |
| PDFs reales con estructuras raras (xref híbrida, objetos comprimidos, linearizados) | Alta | Alto | Corpus sintético amplio; fallback "Guardar copia"; nunca sobrescribir si no se entiende |
| Firmas/cifrado | Media | Alto | Detección + bloqueo + copia |
| Texto fuera de WinAnsi en FreeText | Media | Medio | Limitación documentada; fuente embebida en fase posterior |
| Rendimiento con miles de anotaciones | Media | Medio | Benchmarks; virtualización de lista (C.1 ya tiene benchmark) |
| Dependencia de la verificación del usuario | Alta | Medio | Ventanas por bloque con checklist y fixtures listos |
