# 04 — Gobernanza, contabilidad documental y protocolo de verificación

> **PROPUESTA.** Describe qué documentos cambian al aprobar el plan, el texto exacto propuesto, las reglas
> nuevas y cómo verifica el usuario en Revu/Acrobat. Lo ejecuta el hito **Z.0** (solo documentación).

---

## 1. Cambios exactos por documento (hito Z.0)

### 1.1 `ROADMAP.md` (reescritura)
- Diagrama: `Fase 1 → Fase 2 (A,B,C) → Fase 3 Interop → Fase 4 Medición → Fase 5 Documento/Navegación/Rendimiento → Fase 6 Comparación y Sets`.
- **Fase 2:** tablas A (A.0–A.6, todas **CERRADO**), B (B.1–B.5 **CERRADO**, verificado por el usuario), C con ids
  canónicos y estado real:

| ID | Hito | Estado |
|---|---|---|
| P2-C.1 | Ordenación y filtrado multicriterio | Entregado (`d3b8d55`); verificación nativa pendiente |
| P2-C.2 | Menú contextual de estados + comando atómico + grupos | Commiteado (`d310a87`); verificación nativa pendiente |
| P2-C.3 | Columnas personalizadas (parser de gramática cerrada) | No empezado — depende de Z.2 |
| P2-C.4 | Exportación CSV (RFC 4180 + BOM) y Reporte Resumen PDF | No empezado |
| P2-C.5 | E2E del bloque y verificación nativa | No empezado |
| P2-C.6 | Inspector de propiedades (**propuesto**, requiere ADR y aprobación) | Propuesto |

- Bloque D: **retirado de Fase 2** y trasladado a `P3-F.1` (Capas) y `P3-F.2` (Sellos) si se aprueba D-2/A′.
- Nota `P2-X`: cerrado y verificado en frío (ADR-0008).
- Fases 3–6 según `03-plan-por-fases.md`. Incluir una línea que apunte a `docs/plan-v2/`.

### 1.2 `docs/STATUS.md`
- Bloque B: **CERRADO** (verificado por el usuario: arrastre, recientes, persistencia).
- Bloque C: **EN CURSO** (C.1 entregado; C.2 commiteado; resto pendiente).
- Conteos reales **copiados** de la salida de `npm test`, E2E y `cargo test` (no de memoria).
- Registro de puertas: añadir `parity-check`, `--with-native`, y la puerta de tamaño de bundle si se aprueba.
- Declarar explícitamente lo pendiente (verificaciones nativas de C.1/C.2).

### 1.3 `PARITY.md`
- Fila Tool Chest: sustituir "pendiente de verificación nativa final" por "Verificado por el usuario, <fecha>".
- Filas C.1/C.2: mantener "PENDIENTE" hasta que el usuario verifique (`Z.1`); **no** marcar `shipped` una fila
  hasta que su E2E pase 3 veces (hoy la fila de C.2 se adelantó mientras el E2E había fallado).
- Añadir **columna nueva** "Abre en Revu/Acrobat" (valores: `n/a`, `pendiente`, `verificado <fecha>`,
  `limitación: <ref a docs/INTEROP.md>`). Actualizar `parity-check.mjs` para exigirla (columna 6).
- Filas `todo` para Fase 3–6 con guion `-` (como ahora).

### 1.4 `docs/SCOPE.md`
- **IN:** `cancelled` como estado oficial (modelo `Review` de ISO 32000); Inspector de propiedades (`P2-C.6`) si
  se aprueba; Fase 3 completa (interoperabilidad) con su OUT; Fase 4–6 reescritas.
- **OUT #8** (escribir OCGs): enmendar para permitir **solo** OCG de capas de marcas (`P3-F.1`).
- **OUT #2:** reescribir como regla general ("no adelantar bloques posteriores sin cerrar los previos") en lugar de
  una frase específica del Bloque A.
- Añadir: "El `.bbx.json` deja de ser fuente de verdad a partir de `P3-D`".
- Quitar de OUT de Fase 2 lo que pase a Fase 4 (snap, etc.) con referencia al ADR correspondiente.

### 1.5 `AGENTS.md`
- §5 Puertas: describir el estado real de `verify.mjs` (unit, parity, build, bundle*, cargo; `--with-e2e`,
  `--with-native`, `--with-interop`).
- §6/§7: añadir las **reglas nuevas** de §6 de este documento.
- §8: añadir "Revu y Acrobat los verifica el usuario" junto a la GUI nativa.
- **No relajar nada.**

### 1.6 `CLAUDE.md`
- Comandos de interoperabilidad (`make-interop-fixtures`, `--with-interop`), ubicación de `plan/`, recordatorio de
  concurrencia (un agente por bloque; `git status` antes de cada `git add` explícito).

### 1.7 `ATTRIBUTION.md`
- Una fila por fixture generado (ruta, SHA-256, script generador, licencia "creado por nosotros").
- Si se añade librería nueva (p. ej. `lopdf`, `fflate`): fila con versión, licencia y uso.

### 1.8 ADR nuevos (`docs/DECISIONS/`)
Plantilla: *Contexto · Alternativas · Decisión · Consecuencias · Evidencia* (como ADR-0001…0008).

| ADR (tentativo) | Tema | Hito que lo exige |
|---|---|---|
| 0009 | Inspector de propiedades de marca | `P2-C.6` |
| 0010 | El PDF como fuente de verdad (modelo de dos capas, sidecar como respaldo) | `P3-A.4` |
| 0011 | Estrategia de guardado (incremental vs reescritura), backup y validación | `P3-A.1` |
| 0012 | Mapeo marca→anotación, `/AP`, clave `/REA`, agrupación | `P3-A.4` |
| 0013 | Estados de revisión e hilos de respuestas | `P3-E.1` |
| 0014 | Política de compatibilidad y observación de visores | `P3-A.4` |
| 0015 | Capas (OCG) | `P3-F.1` |
| 0016 | Escala y mediciones (`/Measure`, `/VP`) | `P4-A.1` |
| 0017 | Aritmética de costes y redondeo | `P4-C.3` |
| 0018 | Escritor de XLSX | `P4-D.2` |
| 0019 | Rendimiento: mosaicos y carga por rangos | `P5-A.2/A.3` |
| 0020 | Multi-documento y refactor del visor | `P5-B.0/B.2` |

Addendum a **ADR-0003**: fecha, "parcialmente superado por ADR-0010" y por qué la protección de firmas sigue
vigente (guardado incremental + detección + copia).

## 2. Equivalencia de identificadores

| ROADMAP actual | Plan v2 | Comentario |
|---|---|---|
| `P2-C.2` columnas | `P2-C.3` | Alineado con commits/PARITY |
| `P2-C.3` estados | `P2-C.2` | Idem |
| `P2-C.4` exportación | `P2-C.4` | Igual |
| — | `P2-C.5` | E2E+nativo (estaba en el plan aprobado) |
| — | `P2-C.6` | Inspector (propuesto) |
| `P2-D.1` Capas | `P3-F.1` | Si se aprueba A′ |
| `P2-D.2` Sellos | `P3-F.2` | Idem |
| `P3-0.1` calibración | `P4-A.2` | Sin citas previas en commits |
| `P3-0.2` acotación | `P4-B.1/B.2/B.4/B.6` | |
| `P3-0.3` conteo | `P4-B.3` | |
| `P3-0.4` tablas/costes | `P4-C.1…C.3` | |
| `P3-0.5` XLSX/CSV | `P4-D.1/D.2` | |
| `P4-0.1` overlay | `P6-A.1` | |
| `P4-0.2` split view | `P6-B.1` | |
| `P4-0.3` sets | `P6-C.1` | |

Verificado: los ids `P3-0.x` y `P4-0.x` solo aparecen en `ROADMAP.md` (no en commits ni en `PARITY.md`).

## 3. Proceso: ceremonia proporcional (propuesta, sin relajar puertas)

1. **ADR por decisión**, no por hito (varios hitos de la misma decisión comparten ADR).
2. **`PARITY.md` por hito que cambia API pública o capacidad visible**; `STATUS.md` al cerrar **cada bloque**
   (más cualquier cosa declarada como "no hecha").
3. **E2E×3** solo cuando el hito cambia un flujo de usuario; los hitos puramente de núcleo se cubren con
   unit/propiedad/artefacto.
4. **Un agente por bloque**; ningún agente edita documentos de gobernanza fuera de `Z.0` y del cierre de bloque.
5. **Commits:** uno por hito con id en el mensaje, en español e imperativo; **`git add` explícito** (nunca `-A`);
   comprobar `git status` antes.
6. **Evidencia:** salida literal copiada del terminal o leída de un log persistido (ruta indicada).
7. **Ventanas de verificación del usuario:** al terminar cada **bloque** (no cada hito) el agente entrega un
   paquete: comando, fixtures y checklist (§5). El usuario responde con el informe y se cierran las filas.

## 4. Tamaños y cadencia observada

**Tamaños:** **S** ≈ hasta ~1 h de trabajo de agente · **M** ≈ 1–3 h · **L** ≈ 3–8 h o varias sesiones.

**Cadencia observada [V]** (marcas de tiempo de `git log`, 2026-10-09 22:00 → 2026-10-10 19:30):
- A.0 → A.2 en ≈ 1 h total (3 hitos); A.3 ≈ 2.5 h (con correcciones); A.4 ≈ 2 h; A.5 ≈ 45 min; A.6 ≈ 1 h.
- Bloque B (B.1–B.5 + correcciones nativas) ≈ 3 h; P2-X (5 commits) ≈ 2 h; C.1 ≈ 20 min; C.2 ≈ 40 min + E2E.
- Total ≈ 46 commits en ≈ 21 h de reloj (incluye noche y esperas).

**Orden de magnitud para este plan** (extrapolación, con incertidumbre alta porque Fase 3 contiene
descubrimientos): Fase 3 ≈ 32 hitos ≈ **60–95 h de agente**; Fase 4 ≈ 19 hitos ≈ **40–60 h**; Fase 5 ≈ 17 hitos ≈
**50–80 h** (rendimiento y multipágina son lo más incierto); Fase 6 ≈ **20–30 h**. El **reloj real** lo
marcará la velocidad de verificación del usuario: de ahí las ventanas por bloque.

## 5. Protocolo de verificación en Revu y Acrobat (para el usuario)

**Preparación (la hace el agente y entrega al usuario):**
1. Comando exacto para generar los PDFs de prueba: `npx tsx scripts/make-interop-fixtures.ts --out plan/interop/`.
2. Lista de archivos entregados (nombre, tamaño, SHA-256).
3. El PDF **guardado por REA** a probar (producido con la app nativa por el usuario o por el smoke).

**Ejecución (usuario, en Revu y Acrobat por separado). Para cada tipo de marca, anotar ✔ / ✘ / n/a + nota:**

| Prueba | Descripción |
|---|---|
| V1 Se ve | Aspecto equivalente al de REA (forma, color, grosor, opacidad, guiones) |
| V2 Selecciona | Se puede seleccionar y mover como anotación nativa |
| V3 Edita propiedades | Cambiar color/grosor/relleno funciona |
| V4 Edita texto | Texto de callout/caja/nota editable |
| V5 Estado | El estado (Aceptado/Rechazado/Cancelado/Completado) aparece en su lista de comentarios |
| V6 Respuestas | Las respuestas se muestran en hilo |
| V7 Agrupación | Cloud+/multilínea se comportan como grupo |
| V8 Capas | Ocultar la capa oculta las marcas (si aplica) |
| V9 Re-guardar | Tras mover una marca en Revu/Acrobat y guardar, **REA reabre sin perder** `arcStep`, grupo, campos |
| V10 Foráneas | Una anotación creada en Revu/Acrobat aparece en REA y se conserva intacta al guardar |
| V11 Firma | Un PDF firmado: REA lo detecta y no lo sobrescribe en silencio |
| V12 Rendimiento | Tiempo de apertura y fluidez con el plano grande |

**Informe (plantilla):** versión del visor, sistema operativo, archivo, tabla de resultados, observaciones,
archivos adjuntos. **Dónde guardar:** `plan/interop/informes/<fecha>-<visor>.md` y los archivos guardados por
Revu/Acrobat en `plan/interop/derivados/`. **Capturas de pantalla de Revu/Acrobat:** solo en `plan/bluebeam/` o
`plan/acrobat/` (gitignored); **nunca** en el repo (política de activos). El resumen consolidado va a
`docs/INTEROP.md` como **texto** (matriz), sin imágenes de terceros.

## 6. Reglas nuevas propuestas para `AGENTS.md` (texto literal sugerido)

> **§6 bis — Evidencia de interoperabilidad.** Ninguna función se declara "compatible con Revu/Acrobat" sin el
> informe del usuario (checklist `docs/plan-v2/04` §5) o una limitación registrada en `docs/INTEROP.md`. Los tests
> automáticos de interoperabilidad leen el **PDF real** (diccionarios, content streams, bytes) y deben poder fallar.
>
> **§1 bis — Fixtures y capturas.** Los PDFs de prueba de interoperabilidad se generan con
> `scripts/make-interop-fixtures.ts`. Nunca se commitean PDFs guardados por Revu/Acrobat ni capturas de sus
> interfaces; viven en `plan/` (gitignored).
>
> **§3 bis — Escritura de PDF.** Guardar un PDF existente exige: escritura atómica, copia de seguridad inicial por
> sesión, validación posterior antes del `rename` y bloqueo con aviso si el archivo está firmado o cifrado y no
> puede actualizarse de forma segura. Nunca se sobrescribe lo que no se entiende.
>
> **§4 bis — Preservación.** El código de importación nunca reescribe anotaciones que no ha editado el usuario ni
> descarta las que no soporta.
>
> **§10 bis — Concurrencia.** Un agente por bloque; `git add` explícito; `git status` previo; los documentos de
> gobernanza solo se editan en `Z.0` y en el cierre de bloque.

## 7. Marca, nombre y aspectos legales (nota, no asesoría jurídica)

- "Bluebeam" y "Revu" son marcas de terceros. Usarlas **de forma nominativa** (para decir "compatible con") es
  una cosa; **llamar al producto** "Revu Engineering Architecture" o usar `.bbx` evoca la marca. Recomendación:
  elegir un nombre propio neutral antes de distribuir y revisar el nombre de la extensión de sidecar.
- Mantener la política actual: no copiar activos, no desensamblar, observación de caja negra sobre PDFs propios.
- Consultar asesoría legal antes de distribuir comercialmente (fuera del alcance de este plan).

## 8. Checklist de ejecución de `Z.0` (para el agente)

- [ ] `git status` limpio o conocido; `git log -5`; leer `docs/STATUS.md`.
- [ ] Editar `ROADMAP.md` según §1.1.
- [ ] Editar `docs/STATUS.md` según §1.2 (**conteos copiados** de `npm test`; pegar salida).
- [ ] Editar `PARITY.md` según §1.3 (solo texto/columna; **ningún** `shipped` nuevo sin test existente).
- [ ] Editar `docs/SCOPE.md` según §1.4 **solo si el usuario aprobó D-1…D-6**.
- [ ] Editar `AGENTS.md` §5/§6/§7/§8 según §1.5 y §6 (**solo con aprobación**).
- [ ] `node scripts/parity-check.mjs` → pegar salida.
- [ ] Commit solo-docs: `docs(z.0): contabilidad documental y plan v2 aprobado`.
