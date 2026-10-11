# 07 — Estrategia de motor PDF y objetivo de completitud

> **Estado:** objetivo **aprobado** por el usuario el 2026-10-11 ("las funciones de Revu, con la completitud de
> pdfcraft; pdfcraft como inspiración"). El **spike de motor de cuatro opciones** (`P3-A.1`) está **aprobado**.
> La elección del motor **no** está decidida: la decide el spike con mediciones y la aprueba el usuario (ADR).
>
> **Fuente sobre pdfcraft:** README público de `github.com/storytold/pdfcraft`, leído el 2026-10-11 mediante un
> resumen automático (no se clonó ni se ejecutó). Toda cifra suya citada aquí es **lo que ellos declaran**, no una
> medición nuestra. El spike debe verificar en el código real cualquier dato del que dependa una decisión.

---

## 1. Objetivo reformulado

| Dimensión | Objetivo | Referencia |
|---|---|---|
| **Qué hace la app** | Las **funciones y flujos de Bluebeam Revu** (marcado técnico, Tool Chest, lista de marcas, medición y takeoff, comparación, sets, procesos por lotes) | Revu (caja negra, uso real del usuario) |
| **Qué tan completa y robusta es** | Nivel de **pdfcraft**: motor capaz de abrir, reparar, editar y guardar de forma incremental PDFs reales (incluidos cifrados), con anotaciones estándar, formularios, redacción, firmas, render por mosaicos y verificación con corpus y validadores externos | pdfcraft (inspiración de arquitectura y método, no de funciones) |
| **Qué NO se copia** | Ni la interfaz ni los activos de Revu/Acrobat (`AGENTS.md` §1–§2); de pdfcraft solo ideas, salvo que el spike recomiende reutilizar crates (licencia MIT/Apache-2.0, con atribución) y el usuario lo apruebe | — |

Consecuencia directa: REA deja de ser un visor con capa de marcas y pasa a ser un **editor PDF completo con la
capa de flujos de Revu encima**. Lo que pdfcraft **no** cubre (medición, comparación, Tool Chest, lista de marcas con
columnas, sets) es donde REA aporta más; lo que pdfcraft **sí** cubre (motor, cifrado, formularios, redacción) es lo
que REA debe alcanzar para ser "igual de completo".

## 2. Lo que se toma de pdfcraft como inspiración

| Idea | Qué haría REA | Dónde entra |
|---|---|---|
| **Núcleo en capas, la UI nunca en el núcleo** (filtros → cifrado → objetos → páginas → fuentes → anotaciones → formularios → render → façade) | Mismo principio: un núcleo headless (en Rust) con una **façade** única que usan la UI (Tauri/React), una CLI y las pruebas | Tras la decisión del spike |
| **Puerta de capas** (un crate inferior no puede depender de uno superior) | Comprobación automática en `verify.mjs` (o `cargo deny`/script) que falle si se rompe la jerarquía | `P3-A.5` |
| **Guardado incremental + copy-on-write + escritura atómica** | Ya estaba en el plan v2 (`02` §7); se confirma como requisito | Fase 3 D |
| **Cifrado: abrir y guardar cifrado con las mismas claves** | Nuevo requisito (antes era "bloquear y ofrecer copia") | Fase 7 |
| **Render por mosaicos y aislamiento por página** (una página rota no tumba el documento) | Requisito de render | Fase 5 A |
| **Barrido de corpus** (abrir/renderizar/editar/guardar cientos de PDFs reales, 0 caídas) | Corpus local no versionado + manifiesto con hashes versionado (ver §5) | `P3-A.2`, Fase 8 |
| **Validadores externos** (qpdf, poppler, un segundo renderizador) | Validar todo PDF guardado por REA | `P3-G.1`, Fase 8 |
| **Fuzzing con test de regresión por cada caída** | Pista continua | Fase 8 |
| **Paridad cuantitativa** (lista de funciones del producto objetivo, con prioridad, y porcentaje calculado) | `parity/revu-features.toml` + script que calcula cobertura (total, must-have, flujos diarios) | `P3-A.6` |
| **Capa headless de automatización (CLI + MCP opcional, sin red)** | `rea-cli`: abrir, listar/crear/editar anotaciones, guardar, medir, exportar, todo sin ventana. Permite que **un agente pruebe casi todo sin GUI**, y deja al usuario solo lo visual | `P3-A.5` |
| **Empaquetado firmado (MSI, portable)** | Pista de distribución | Fase 8 |

## 3. La decisión de motor (D-10): spike de cuatro opciones — APROBADO

| Opción | Composición | Fortalezas | Riesgos a medir |
|---|---|---|---|
| **A. Actual ampliado** | Render con PDF.js en el WebView; edición con pdf-lib; escritor incremental propio (TS o Rust) | Mínimo cambio; PDF.js es maduro y rápido en navegador | Techo de completitud: pdf-lib no repara, no cifra, no hace incremental; formularios/redacción/firmas serían piezas sueltas; dos parsers distintos del mismo archivo |
| **B. Núcleo propio en Rust** | Crates propios: filtros, cifrado, objetos (parseo tolerante, reparación, copy-on-write, escritura incremental), páginas, anotaciones; render con PDF.js (al principio) o nativo | Control total; diseñado para Revu (OCG, `/Measure`, viewports) | Coste muy alto; reinventar años de robustez; hay que medir cuánto cuesta llegar a "abre el 95 % del corpus" |
| **C. Reutilizar crates de pdfcraft** | Dependencia de sus crates de filtros, cifrado, objetos, anotaciones (MIT/Apache-2.0) + capa Revu propia | Arranque rápido hacia la completitud; misma pila (Rust) | Proyecto **alfa** declarado; API inestable; ¿publicados en crates.io o solo por git?; mantenimiento ajeno; obligaciones de atribución (NOTICE) |
| **D. PDFium** | Render, texto, búsqueda, anotaciones y formularios con PDFium (binario nativo) + escritura incremental (propia de PDFium o capa propia) | Fidelidad de nivel navegador; cobertura amplia de formularios y anotaciones | Distribución del binario; licencia y procedencia del binario **a verificar**; transporte de mosaicos de Rust al WebView; integración con Tauri en Windows |

**Excluidos sin evaluar:** cualquier motor con licencia **GPL/AGPL** (`AGENTS.md` §2).
**Combinaciones permitidas:** el spike puede recomendar un híbrido (p. ej. PDF.js para render + núcleo Rust para
objetos/guardado), justificándolo con datos.

### 3.1 Qué mide el spike (igual para las cuatro)

| # | Métrica | Cómo |
|---|---|---|
| M1 | Robustez de apertura | % del corpus que abre sin caída ni cuelgue (timeout por archivo) |
| M2 | Fidelidad de render | diferencia de píxeles página a página contra una referencia fija; las discrepancias grandes se revisan a mano |
| M3 | Ida y vuelta | abrir → añadir 1 anotación por subtipo → guardar incremental → reabrir: anotaciones presentes, `qpdf --check` sin errores, bytes originales intactos |
| M4 | Archivos difíciles | cifrados (RC4/AES-128/AES-256), con firma, con xref stream/object streams, linearizados, dañados |
| M5 | Planos grandes | tiempo al primer render y memoria pico en el plano sintético de ~100 MB y hoja E (≥ 3600×2400 pt) |
| M6 | Escritura de lo que Revu necesita | `/OC` (capas), `/Measure` + `/VP`, `/Stamp` con `/AP`, `/StateModel`, `/IRT /RT /Group` |
| M7 | Integración | compila en Windows dentro de Tauri; tamaño del binario; tiempo de build; cómo llegan los píxeles a la UI |
| M8 | Licencia y procedencia | licencia exacta (archivo LICENSE leído), NOTICE, origen del binario, dependencias transitivas |
| M9 | Coste de llegar al objetivo | estimación argumentada (no adivinada) de hitos hasta M1 ≥ 95 % y M3 ≥ 95 % |

### 3.2 Rúbrica de decisión (pesos propuestos; el usuario puede ajustarlos antes del spike)

| Criterio | Peso |
|---|---|
| Robustez y fidelidad (M1, M2, M4) | 30 % |
| Escritura incremental y requisitos Revu (M3, M6) | 25 % |
| Coste hasta el objetivo (M9) | 20 % |
| Rendimiento en planos grandes (M5) | 10 % |
| Integración y distribución (M7) | 10 % |
| Licencia y riesgo de mantenimiento (M8) | 5 % (eliminatorio si la licencia no es permisiva) |

### 3.3 Reglas del spike
- **Investigación:** prototipos en `spikes/` (o `scripts/spikes/`), **nunca en `src/` ni `src-tauri/src/`**.
  Dependencias solo dentro del directorio del spike, cada una con su licencia declarada.
- **Caja de tiempo:** máximo **3 sesiones de agente**; si una opción no compila o no abre el corpus básico en una
  sesión, se registra como resultado y se pasa a la siguiente.
- **Entregables:** `docs/perf/SPIKE-MOTOR.md` (tablas M1–M9 con comando y salida **leída de logs en disco**, rutas
  incluidas) + borrador de ADR con el siguiente número libre ("Motor PDF") + recomendación con la rúbrica aplicada.
- **Evidencia:** nada de listas de resultados "reconstruidas". Cada cifra cita el archivo de log del que sale.

## 4. Consecuencias según el resultado

| Si gana… | Fase 3 se convierte en… |
|---|---|
| **A** | El plan v2 tal como está (`03` §3), más un escritor incremental; Fase 7 (seguridad/formularios) quedará limitada y habrá que reabrir la decisión allí |
| **B** | Fase 3 se antepone con un **Bloque 0 de núcleo**: filtros, objetos, escritura incremental, cifrado básico (cada uno con corpus y fuzzing), antes de escribir anotaciones |
| **C** | Bloque 0 corto: integrar y fijar versión de los crates, envolverlos en la façade de REA, completar lo que falte para Revu (`/Measure`, OCG, viewports) |
| **D** | Bloque 0: empaquetado del binario, servidor de mosaicos a la UI, API de anotaciones/formularios, escritura incremental |

En todos los casos se mantiene: modelo `Markup` de REA, coordenadas normalizadas, comandos con undo, y la regla de
"una sola geometría" (ADR-0006).

## 5. Corpus de fidelidad (decisión D-11)

`AGENTS.md` §1 prohíbe **commitear** PDFs ajenos. pdfcraft mide contra el corpus de pruebas de PDF.js. Propuesta:

- **Corpus externo local:** se descarga con un script a una carpeta **ignorada por git** (p. ej. `corpus/`), a partir
  de un **manifiesto versionado** (URL, SHA-256, licencia/origen de cada archivo). Nunca se commitea un PDF ajeno ni
  se distribuye con la app.
- **Corpus propio:** los fixtures sintéticos (`P3-A.2`) sí se versionan.
- **Planos reales del usuario:** opcionales, **solo locales** (carpeta ignorada), nunca en el repo ni en informes con
  contenido identificable.
- Requiere **ADR + aprobación** porque amplía la política de activos (no la relaja: nada ajeno entra al repo).

## 6. Alcance ampliado ("versión Revu" de lo que tiene pdfcraft)

Pasan de "fuera de alcance" a planificadas, con su equivalente en Revu (lista **a validar por el usuario**):

| Función | Equivalente en Revu (conocimiento público) | Fase |
|---|---|---|
| Abrir/guardar PDFs cifrados; contraseñas y permisos | Seguridad de documento | 7 |
| Formularios: rellenar y crear campos | Herramientas de formulario | 7 |
| Redacción real (incl. buscar y redactar) | Redact | 7 |
| Firmas digitales y sellos de firma | Digital signatures / Sign & Seal | 7 |
| OCR | OCR | 7 |
| Aplanar y "desaplanar" marcas propias | Flatten / Unflatten | 5 |
| Procesos por lotes (enlaces, hojas de reemplazo, firmar, aplanar, resumen) | Batch Link, Slip Sheet, Batch Sign & Seal… | 5–6 |
| Leyendas de marcas en el plano | Legends | 4 |
| Espacios (regiones con nombre que agrupan marcas/medidas) | Spaces | 4 |
| Relleno dinámico para áreas | Dynamic Fill | 4 |
| Vínculo de cantidades a hoja de cálculo | Quantity Link | 4 |
| Perfiles de interfaz y secuencias numeradas | Profiles, Sequences | 5 |
| Colaboración en la nube | Studio | **Fuera** (contradice local-first) |
| Crear PDF desde Office/CAD | Plug-ins / impresora | **Fuera** por ahora |

## 7. Fases nuevas que añade este objetivo

- **Fase 7 — Documento protegido, formularios y firmas:** cifrado (abrir y guardar), formularios (rellenar/crear),
  redacción y saneado, firmas digitales básicas, OCR. Depende del motor elegido.
- **Fase 8 — Endurecimiento y distribución:** barrido de corpus con objetivo numérico, fuzzing continuo, validadores
  externos en la puerta, instalador firmado (MSI) y portable, actualizaciones, porcentaje de paridad publicado.

## 8. Hitos nuevos en Fase 3 (bloque A)

| ID | Hito | Tamaño |
|---|---|---|
| `P3-A.1` | **Spike de motor (4 opciones)** — sustituye al antiguo "spike de guardado" | L (máx. 3 sesiones) |
| `P3-A.5` | Façade del núcleo + `rea-cli` headless (abrir, anotar, guardar, inspeccionar) y puerta de capas | M |
| `P3-A.6` | Paridad cuantitativa: `parity/revu-features.toml` + script de porcentaje en `verify.mjs` | M |
| `P3-A.7` | Corpus de fidelidad: manifiesto + script de descarga + barrido M1/M3 en puerta opcional `--with-corpus` | M |

## 9. Estimación (orden de magnitud, alta incertidumbre)

El plan v2 estimaba ~170–265 h de agente para Fases 3–6. Con motor y Fases 7–8, el total probable es **el doble
o más** (≈ 350–600 h), muy dependiente del resultado del spike (C y D acortan; B alarga). El reloj real lo marca
además la verificación del usuario. Se recalcula tras el spike.
