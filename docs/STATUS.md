# docs/STATUS.md — Estado Real de Sub-entregables y Puertas de Calidad

> **Regla de oro:** Empieza aquí cada sesión. Este documento registra la verdad del repositorio sin adornos. Lo no hecho se declara explícitamente, nunca se omite ni se da por supuesto.

---

## 1. Resumen Ejecutivo de Estado

| Fase / Bloque | Estado General | Cobertura / Evidencia |
|---|---|---|
| **Fase 1: Motor Base y Shell CAD** | **CERRADA** | 114 tests unitarios al cierre de fase + 4 tests cargo + 3 E2E (actualmente 152 tests unitarios tras A.2). R9 validado en disco desde ventana nativa por el usuario. |
| **Fase 2 — Bloque A: Marcado y Manipulación** | **EN CURSO (Completo en código y suites; verificación nativa de A.6 pendiente)** | 190 tests unitarios + 4 tests cargo + 11/11 E2E en Playwright. Filas 28 y 29 verificadas por el usuario; fila 30 pendiente de prueba nativa. |
| **Fase 2 — Bloque B: Tool Chest** | **NO EMPEZADO** | Paletas IndexedDB, modos Propiedad/Dibujo y drag & drop. Pendiente de verificación nativa y cierre del Bloque A. |
| **Fase 2 — Bloque C: MarkupsList Completa** | **NO EMPEZADO** | Ordenación, filtros, columnas personalizadas, estados y reportes. Pendiente de cierre del Bloque B. |
| **Fase 2 — Bloque D: Capas y Sellos Dinámicos** | **NO EMPEZADO** | Capas lógicas persistidas y sellos vectoriales dinámicos. Pendiente de cierre del Bloque C. |

---

## 2. Detalle por Sub-entregable

### Fase 1: Motor de Anotaciones y Visor PDF (Cerrada y Verificada)

| ID | Título | Estado | Evidencia y Verificación | Notas |
|---|---|---|---|---|
| `0.1` | Visor PDF con worker PDF.js | **Cerrado** | Carga dinámica de worker vía `?url`, viewport base y canvas offscreen. | 0 warnings DOM, build bundle 568 kB. |
| `0.2` | Figuras geométricas básicas y atajo Escape | **Cerrado** | Test E2E interactivo validando elipse, polígono y cancelación con `Escape`. | `pdf-viewer.spec.ts:131`. |
| `0.3` | Exportación vectorial a PDF con pdf-lib | **Cerrado** | Test de oro (`pdfExportService.test.ts`) inspecciona el content stream binario real (`cm`, `re`, `l`). | Verificado sin recalcular con la misma función. |
| `0.4` | Persistencia atómica `.bbx.json` con Rust | **Cerrado** | `cargo test` (4/4 tests: ruta relativa, extensión, `Ok(None)` en `NotFound`, escritura atómica `.tmp` + `rename`). | R9 verificado por el usuario escribiendo en disco desde ventana nativa. |
| `0.5` | Rotación unificada de Viewport (0°, 90°, 180°, 270°) | **Cerrado** | Fixture rotado 90° (`test-blueprint-rotated.pdf`), test unitario contra `page.getViewport()` de PDF.js. | Invariante matemática probada en las 4 orientaciones. |
| `0.6` | Hit-testing matemático por tipo (14 tipos) | **Cerrado** | Suite exhaustiva en `coordinates.test.ts`: interior, exterior en bbox y perímetro para cada uno. | 0 caídas a `return true`. |
| `0.7` | Gestor de Historial Command con tope 50 | **Cerrado** | `command.test.ts`: constructor fuerza `Math.max(50, n)`, recorte de `undoStack` y `redoStack`. | Pruebas de borde en 50 y 51 pasos. |
| `C1-C5` | Chores de calidad e infraestructura | **Cerrado** | Normalización camelCase en `renderSvgDescriptor`, render offscreen, limpieza de chunk, reset throttle en `Ok(None)`. | Criterios verificados. |

---

### Fase 2: Bloque A — Herramientas de Marcado Avanzado y Manipulación

| ID | Hito / Característica | Estado | Evidencia y Verificación | Notas |
|---|---|---|---|---|
| `P2-A.0` | Move y Transform con umbral 4px y clamp | **Cerrado** | Commit `6e7f0e3`. Test E2E traslada 50 px, descarta temblores de 2 px y revierte con un solo `Ctrl+Z`. | Clamp estricto 0..1 en `coordinates.ts`. |
| `P2-A.1` | Nubes de revisión, arcStep y Cloud+ como grupo | **Cerrado** | Commit `b2ee813`. Inmutabilidad de `arcStep=20` en `.bbx.json`, abombamiento determinista por área firmada, Cloud+ con undo/delete en bloque. | Confirmación visual de la curvatura en ventana nativa: **PENDIENTE DE VERIFICAR**. |
| `P2-A.2` | Multiselección con Marquee y traslación conjunta | **Cerrado** | Commit `d525990`. 152/152 Vitest, 6/6 E2E en 3 pasadas consecutivas. Marquee por cruce/intersección, 0 marcas creadas, arrastre conjunto de $K$ marcas y 1 solo `Ctrl+Z` revierte ambas. | Prefiltro $O(N)$ probado con 500 marcas en menos de 10 ms. |
| `P2-A.3` | Callout / Nota con directriz | **Cerrado** | Commit `083a37b`. Invarianza al zoom probada (`pdf-viewer.spec.ts:647`), envoltorio AFM, directriz conectada y arrastre conjunto de caja. | 165/165 Vitest, 8/8 E2E. |
| `P2-A.4` | Nota adhesiva técnica (`stickyNote`) | **Cerrado** | `STICKY_NOTE_SIZE_PT = 24` en puntos (cuadrado en pantalla y hit-test idéntico a dibujado), sin asunción de points[1] en SVG/exportador/clamps, dimensiones de página obligatorias sin fallback 612/792 (cero fallo silencioso), exportación vectorial pura (re/m/l/f/rg/RG midiendo 24x24 y sin 0.0001, /Subtype /Text ni /Annots), creación al confirmar (1 cmd; 0 en cancel), 4 presets de color persistidos y guarda del atajo N en inputs/textareas. | Verificado por el usuario en ventana nativa, 2026-10-10 (fila 28 de PARITY.md). |
| `P2-A.5` | Resaltador vectorial (`highlightVector`) | **Cerrado** | Atajo `H` con guarda de foco, umbral de creación en 4 px de pantalla invariable al zoom (`exceedsScreenThreshold`), `HIGHLIGHT_STYLE` como fuente única de verdad (#ffff00 al 50% con multiply), previsualización en vivo sin fuga de trazo discontinuo al PDF, creación atómica min/max y test de oro verificando `/BM /Multiply` y `/ca 0.5` en `/ExtGState`. | Verificado por el usuario en ventana nativa, 2026-10-10 (fila 29 de PARITY.md). |
| `P2-A.6` | Resaltado de texto (`highlightText` con TextLayer) | **Completo (Pendiente Verif. Nativa)** | TextLayer nativo de PDF.js 4.x sincronizado con `--scale-factor: scale`, compensación de offset del contenedor, extracción multilínea atómica con `groupId` común y `text` por línea, alerta accesible `role="alert"` en página sin texto (página 3 fixture real), exportación vectorial con `/BM /Multiply` y cobertura geométrica verificada a 1x y 2x. | 190/190 Vitest, 11/11 E2E, fila 30 en PARITY.md (PENDIENTE DE VERIFICAR por usuario). |

---

### Fase 2: Bloques B, C y D (No Empezados)

| Bloque | Descripción | Estado | Prerrequisito |
|---|---|---|---|
| **Bloque B (Tool Chest)** | Paletas de estilos definidas por el usuario en IndexedDB, modos Propiedad y Dibujo, y drag & drop al lienzo. | **No empezado** | Cierre total del Bloque A tras verificación nativa de A.6. |
| **Bloque C (MarkupsList Completa)** | Ordenación, filtros multicriterio, columnas personalizadas con lista blanca, menú contextual de estados y exportación de reportes (PDF/Excel/CSV). | **No empezado** | Cierre total y auditado del Bloque B. |
| **Bloque D (Capas y Sellos Dinámicos)** | Capas lógicas CAD con visibilidad persistida y sellos dinámicos basados en primitivas vectoriales limpias. | **No empezado** | Cierre total y auditado del Bloque C. |

---

## 3. Registro de Puertas de Calidad Actual

- **Pruebas Unitarias:** 190 / 190 pasadas en Vitest (`src/`).
- **Auditoría Literal de Paridad:** Superada (18 shipped verificadas literalmente, 4 todo con guion `-`).
- **Pruebas Rust:** 4 / 4 pasadas en `cargo test` (`src-tauri/`).
- **Compilación de Producción:** Exitosa (`tsc && vite build`).
- **Pruebas E2E:** 11 / 11 pasadas en Playwright suite completa (3 pasadas verificadas).
- **Warnings en Consola WebView:** 0 warnings reportados.
- **Árbol de Git:** Limpio en rama `master`.
