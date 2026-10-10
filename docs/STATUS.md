# docs/STATUS.md — Estado Real de Sub-entregables y Puertas de Calidad

> **Regla de oro:** Empieza aquí cada sesión. Este documento registra la verdad del repositorio sin adornos. Lo no hecho se declara explícitamente, nunca se omite ni se da por supuesto.

---

## 1. Resumen Ejecutivo de Estado

| Fase / Bloque | Estado General | Cobertura / Evidencia |
|---|---|---|
| **Fase 1: Motor Base y Shell CAD** | **CERRADA** | 62 tests unitarios + 4 tests cargo + 3 E2E. R9 validado en disco desde ventana nativa por el usuario. |
| **Fase 2 — Bloque A: Marcado y Manipulación** | **EN CURSO** (A.0, A.1, A.2 cerrados; A.3 pendiente de plan) | 152 tests unitarios + 4 tests cargo + 6/6 E2E en 7 pasadas consecutivas. |
| **Fase 2 — Bloque B: Tabla Técnica de Marcas** | **NO EMPEZADO** | Pendiente de cierre del Bloque A. |
| **Fase 2 — Bloque C: Edición y Estilos** | **NO EMPEZADO** | Pendiente de cierre del Bloque B. |
| **Fase 2 — Bloque D: Calibración y Medición** | **NO EMPEZADO** | Pendiente de cierre del Bloque C. |

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
| `P2-A.2` | Multiselección con Marquee y traslación conjunta | **Cerrado** | Commit `d525990`. 152/152 Vitest, 6/6 E2E en 3 pasadas consecutivas. Marquee por cruce/intersección, 0 marcas creadas, arrastre conjunto de $K$ marcas y 1 solo `Ctrl+Z` revierte ambas. | Prefiltro $O(N)$ probado con 500 marcas en < 15 ms. |
| `P2-A.3` | Callout / Nota con directriz | **Pendiente de plan** | Ningún código implementado aún. | Pendiente de aprobación formal del plan de implementación. |
| `P2-A.4` | Polilínea y Flecha técnica | **No empezado** | — | Esperando cierre de A.3. |
| `P2-A.5` | Resaltador técnico (`multiply` + snap) | **No empezado** | — | Esperando cierre de A.4. |
| `P2-A.6` | Sellos técnicos predefinidos | **No empezado** | — | Cierre del Bloque A. |

---

### Fase 2: Bloques B, C y D (No Empezados)

| Bloque | Descripción | Estado | Prerrequisito |
|---|---|---|---|
| **Bloque B** | Tabla técnica de marcas (`MarkupsList`), filtros por estado/autor/página, ordenación y exportación de metadatos. | **No empezado** | Cierre total y auditado del Bloque A. |
| **Bloque C** | Edición avanzada de propiedades, paletas de estilo por capa, bloqueo de marcas y duplicación con offset. | **No empezado** | Cierre total y auditado del Bloque B. |
| **Bloque D** | Herramienta de calibración de escala y acotación lineal/área básica. | **No empezado** | Cierre total y auditado del Bloque C. |

---

## 3. Registro de Puertas de Calidad Actual

- **Pruebas Unitarias:** 152 / 152 pasadas en Vitest (`src/`).
- **Pruebas Rust:** 4 / 4 pasadas en `cargo test` (`src-tauri/`).
- **Compilación de Producción:** Exitosa (`tsc && vite build`, bundle ~583 kB).
- **Pruebas E2E:** 6 / 6 pasadas en 3 ejecuciones consecutivas (11.9s, 12.0s, 11.9s).
- **Warnings en Consola WebView:** 0 warnings reportados.
- **Árbol de Git:** Limpio en rama `master`.
