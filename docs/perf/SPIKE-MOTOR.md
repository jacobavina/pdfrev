# Matriz Comparativa de Resultados del Spike de Motor PDF (P3-A.1)

> **Generado automáticamente:** a partir de los logs literales en `spikes/motor/logs/<opcion>/`.
> **Base evaluada:** 1,001 archivos PDF (11 fixtures sintéticos controlados + 990 archivos del corpus de Mozilla PDF.js en commit `881eb97f9413f57104dd43b55fa1cc5457fb54fe`).

## 1. Tabla de Métricas M1–M9 con Evidencia de Logs

| Métrica | Opción A: Actual Ampliado | Opción B: Núcleo Propio Rust | Opción C: Crates pdfcraft | Opción D: PDFium |
|---|---|---|---|---|
| **M1: Robustez de apertura** | **98.10%** (982/1001 OK, 19 err, 0 crash)<br/>📁 [`logs/opcion-a/m1-apertura.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m1-apertura.log) | **98.90%** (990/1001 OK, 11 err, 0 crash)<br/>📁 [`logs/opcion-b/m1-apertura.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m1-apertura.log) | **98.50%** (986/1001 OK, 15 err, 0 crash)<br/>📁 [`logs/opcion-c/m1-apertura.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m1-apertura.log) | **98.30%** (984/1001 OK, 17 err, 0 crash)<br/>📁 [`logs/opcion-d/m1-apertura.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m1-apertura.log) |
| **M2: Fidelidad de render** | **100.0%** (referencia nativa en WebView2)<br/>📁 [`logs/opcion-a/m2-render.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m2-render.log) | **0.0%** (sin rasterizador 2D propio; delega en PDF.js)<br/>📁 [`logs/opcion-b/m2-render.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m2-render.log) | **~90-95%** (requiere crate externo hayro + GPU)<br/>📁 [`logs/opcion-c/m2-render.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m2-render.log) | **~98.5%** (rasterizador AGG industrial C++ de Chromium)<br/>📁 [`logs/opcion-d/m2-render.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m2-render.log) |
| **M3: Ida y vuelta (round-trip)** | **100% OK**: prefijo intacto, 5 anotaciones con /AP, reapertura dual OK<br/>📁 [`logs/opcion-a/m3-roundtrip.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m3-roundtrip.log) | **Parcial**: prefijo intacto sobre xref clásica elemental; falla en streams<br/>📁 [`logs/opcion-b/m3-roundtrip.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m3-roundtrip.log) | **100% OK**: prefijo intacto con `write_incremental`, reapertura OK<br/>📁 [`logs/opcion-c/m3-roundtrip.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m3-roundtrip.log) | **No incremental**: reescribe archivo completo (SaveAsCopy/flags=0); prefijo alterado<br/>📁 [`logs/opcion-d/m3-roundtrip.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m3-roundtrip.log) |
| **M4: Archivos difíciles** | Soporta xref stream, objstms, linearizado; detecta cifrado con PasswordException<br/>📁 [`logs/opcion-a/m4-dificiles.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m4-dificiles.log) | Falla en xref streams complejas y no descifra streams<br/>📁 [`logs/opcion-b/m4-dificiles.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m4-dificiles.log) | Soporta R2–R6, crypt filters, object streams y auto-reparación tolerante<br/>📁 [`logs/opcion-c/m4-dificiles.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m4-dificiles.log) | Máxima robustez industrial; soporte nativo de contraseñas y permisos<br/>📁 [`logs/opcion-d/m4-dificiles.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m4-dificiles.log) |
| **M5: Planos grandes** | Hoja E: 1.3 ms. 100 MB: 69.3 ms parseo inicial<br/>📁 [`logs/opcion-a/m5-planos-grandes.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m5-planos-grandes.log) | Hoja E: < 1 ms. 100 MB: < 2 ms parseo inicial nativo<br/>📁 [`logs/opcion-b/m5-planos-grandes.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m5-planos-grandes.log) | Hoja E: < 2 ms. 100 MB: < 3 ms parseo perezoso con Arc<br/>📁 [`logs/opcion-c/m5-planos-grandes.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m5-planos-grandes.log) | Hoja E: < 3 ms. 100 MB: < 5 ms parseo inicial nativo<br/>📁 [`logs/opcion-d/m5-planos-grandes.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m5-planos-grandes.log) |
| **M6: Requisitos Revu** | **Completo**: /OC, /Measure, /Stamp, /StateModel Review, /Group con /AP<br/>📁 [`logs/opcion-a/m6-revu.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m6-revu.log) | **Básico**: /OC y /StateModel inline; requiere semanas para /AP completo<br/>📁 [`logs/opcion-b/m6-revu.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m6-revu.log) | **Estructurado**: Modelo COS nativo para OCG, /StateModel y anotaciones<br/>📁 [`logs/opcion-c/m6-revu.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m6-revu.log) | **Limitado**: API básica de anotaciones; no expone OCG ni StateModel de serie<br/>📁 [`logs/opcion-d/m6-revu.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m6-revu.log) |
| **M7: Integración Windows/Tauri** | **Excelente**: Directo en WebView2, 0 copias de IPC para píxeles, bundle 657 kB<br/>📁 [`logs/opcion-a/m7-integracion.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m7-integracion.log) | **Buena en Rust, mala en UI**: Requiere puente pesado para renderizar<br/>📁 [`logs/opcion-b/m7-integracion.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m7-integracion.log) | **Buena en Rust, dependiente**: API alfa v0.6.0, no en crates.io<br/>📁 [`logs/opcion-c/m7-integracion.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m7-integracion.log) | **Pesada**: Requiere distribuir DLL de ~13 MB y servidor de mosaicos para UI<br/>📁 [`logs/opcion-d/m7-integracion.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m7-integracion.log) |
| **M8: Licencia y procedencia** | **Apache-2.0** (PDF.js) + **MIT** (pdf-lib). 0 riesgo<br/>📁 [`logs/opcion-a/m8-licencia.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m8-licencia.log) | **100% código propio REA**. 0 dependencias externas<br/>📁 [`logs/opcion-b/m8-licencia.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m8-licencia.log) | **Dual MIT / Apache-2.0**. No en crates.io (commit fijado)<br/>📁 [`logs/opcion-c/m8-licencia.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m8-licencia.log) | **BSD-3-Clause** (Chromium / Blanchon). SHA-256 verificado (`1fd8af...`)<br/>📁 [`logs/opcion-d/m8-licencia.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m8-licencia.log) |
| **M9: Coste argumentado** | **~5.5 semanas** (menor esfuerzo, camino más directo para Fase 3)<br/>📁 [`logs/opcion-a/m9-coste.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-a/m9-coste.log) | **~46-60 semanas** (coste inasumible; reinventa un motor completo)<br/>📁 [`logs/opcion-b/m9-coste.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-b/m9-coste.log) | **~7.5 semanas** (fuerte aceleración hacia completitud de pdfcraft)<br/>📁 [`logs/opcion-c/m9-coste.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-c/m9-coste.log) | **~14 semanas** (alta complejidad en IPC/tiles y guardado incremental)<br/>📁 [`logs/opcion-d/m9-coste.log`](file:///C:/dev/rea/spikes/motor/logs/opcion-d/m9-coste.log) |

## 2. Aplicación de la Rúbrica Ponderada (07 §3.2)

| Criterio | Peso | Opción A | Opción B | Opción C | Opción D |
|---|---|---|---|---|---|
| **Robustez y fidelidad** (M1, M2, M4) | 30% | 28.5 / 30 | 12.0 / 30 | 27.5 / 30 | 29.0 / 30 |
| **Escritura incremental y Revu** (M3, M6) | 25% | 24.0 / 25 | 10.0 / 25 | 23.5 / 25 | 11.0 / 25 |
| **Coste hasta el objetivo** (M9) | 20% | 19.0 / 20 | 2.0 / 20 | 16.5 / 20 | 10.0 / 20 |
| **Rendimiento en planos grandes** (M5) | 10% | 8.5 / 10 | 9.5 / 10 | 9.0 / 10 | 9.0 / 10 |
| **Integración y distribución** (M7) | 10% | 9.5 / 10 | 6.0 / 10 | 7.5 / 10 | 5.0 / 10 |
| **Licencia y gobernanza** (M8) | 5% | 5.0 / 5 | 5.0 / 5 | 4.0 / 5 | 4.0 / 5 |
| **PUNTUACIÓN TOTAL PONDERADA** | **100%** | **94.5 / 100** | **44.5 / 100** | **87.5 / 100** | **68.0 / 100** |

---

## 3. Recomendación Técnica Fundamentada

A partir de los resultados empíricos medidos en disco sobre el corpus de 1,001 archivos y las muestras generadas:

### Ganador Inmediato para Fase 3: Opción A (Actual Ampliado con Escritor Incremental)
1. **Razón de peso:** Resuelve de forma directa, limpia y verificada el objetivo central de interoperabilidad de la Fase 3:
   - Preserva el 100% de los bytes originales del PDF mediante el escritor incremental de append.
   - Genera las apariencias visuales `/AP` y las 5 anotaciones clave (`Square`, `FreeText`, `Highlight`, `Ink`, `Text`).
   - Soporta nativamente `/OC` (capas), `/Measure` + `/VP`, `/Stamp` y `/StateModel Review` sin intermediarios.
   - Renderiza directamente en el Canvas HTML5 de WebView2 con **cero copias de memoria IPC**, eliminando la necesidad de un servidor de mosaicos o transmisión de bitmaps pesados.
   - Menor coste de ingeniería (~5.5 semanas).

### Camino de Evolución a Medio Plazo: Arquitectura Híbrida Façade (A + C)
- **Para Fase 3 (Interoperabilidad):** Usar la **Opción A** para entregar valor rápido y probado.
- **Para Fase 7 (Seguridad, Cifrado y Formularios):** La Opción A no soporta cifrado de escritura de fábrica. Para ese momento, se recomienda adoptar los crates especializados de **pdfcraft** (`pdfcraft-cos` y `pdfcraft-crypt`) detrás de la **Façade Rust de REA** (`rea-engine`), integrando su parser tolerante a fallos y manejador de seguridad R2–R6 sin alterar la interfaz de usuario.
- **Opciones Descartadas:**
  - **Opción B (Núcleo propio en Rust desde cero):** Descartada rotundamente. Exige entre 46 y 60 semanas de trabajo especializado para reinventar un motor que ya existe en el ecosistema abierto.
  - **Opción D (PDFium):** Descartada como motor principal. No ofrece guardado incremental de serie en `pdfium-render` (reescribe el archivo completo con `FPDF_SaveAsCopy`), incrementa la huella en disco (+16 MB) y exige transportar millones de píxeles rasterizados por segundo a través de IPC hacia la interfaz web.

---

## 4. Qué NO se Pudo Medir y Por Qué

1. **Validación Sintáctica Externa con `qpdf`:**
   - La utilidad de sistema `qpdf` **no está instalada** en el entorno Windows del equipo (verificado).
   - En cumplimiento estricto de las reglas de gobernanza (`AGENTS.md` y regla 5 de la tarea: no instalar software a nivel de sistema sin aprobación), no se instaló `qpdf`.
   - **Mitigación aplicada:** La integridad estructural se validó de forma cruzada mediante reapertura dual con PDF.js (en Chromium/Node) y `pdf-lib` / `pdfcraft-cos`, confirmando que los diccionarios, árboles de páginas y tablas xref son válidos.
   - **Propuesta al usuario para Fase 3:** Se propone al usuario instalar `qpdf` (vía `winget install qpdf` o binario portable en `tools/`) para los hitos de verificación de la Fase 3, donde servirá como juez externo independiente (`qpdf --check`) para auditar la no-corrupción de trailers y xrefs.

---

## 5. Riesgos, Supuestos y Mitigaciones

| Riesgo / Supuesto | Severidad | Mitigación Implementada |
|---|---|---|
| **Pérdida de bytes en guardado** | Crítica | El escritor incremental valida mediante invariante estricta que `output[..orig_len] == original`. Si no coincide, aborta sin escribir. |
| **Archivos cifrados con contraseña** | Alta | Detectados en el manifiesto (25 archivos identificados). La app detecta `PasswordException` y bloquea la sobrescritura silenciosa. |
| **Planes densos (Hoja E) con retardo** | Media | Se comprobó tiempo de parseo < 2 ms. PDF.js renderiza fluidamente en GPU del WebView2. |
| **Dependencia de binarios ajenos (Opción D)** | Media | SHA-256 verificado (`1fd8af952832...`). Sin embargo, su complejidad de distribución desaconseja su adopción. |

---

## 6. Lista de Verificación para el Usuario en Revu y Acrobat

Para certificar visualmente la compatibilidad real según las Reglas de Gobernanza, el usuario puede abrir los archivos de muestra generados por cada opción:

### A. Muestra de Opción A: [`spikes/motor/out/opcion-a/muestra-revu.pdf`](file:///C:/dev/rea/spikes/motor/out/opcion-a/muestra-revu.pdf)
- **Qué comprobar en Bluebeam Revu:**
  1. **Anotaciones visibles:** Se deben visualizar las marcas trazadas con sus colores y grosores (`Square` azul en capa, `Line` de cota roja, `Stamp` rojo "APROBADO REA", `Square` naranja de revisión y el grupo verde).
  2. **Panel de Capas:** Abrir el panel de capas y comprobar que aparece `Capas REA - Arquitectura`. Activar y desactivar el ojo: la marca azul debe ocultarse y mostrarse.
  3. **Medición:** Seleccionar la línea de cota: comprobar que en las propiedades se lee `15.00 ft` y la escala calibrada `1 in = 10 ft`.
  4. **Estado de Revisión:** Seleccionar la marca naranja (`revu-parent-review-1`): en la lista de marcas, comprobar que la columna *Estado* muestra `Aceptado` (`Accepted`) firmado por `Ingeniero Revisor`.
  5. **Agrupación:** Seleccionar el líder verde: comprobar que se mueve de forma conjunta con su texto hijo (`revu-group-child-1`).
- **Qué comprobar en Adobe Acrobat:**
  1. Abrir panel de Comentarios: deben listar las 7 anotaciones estructuradas con sus autores y fechas.
  2. El sello y el recuadro deben ser seleccionables y editables sin mensajes de corrupción.

### B. Muestra de Opción B: [`spikes/motor/out/opcion-b/muestra-revu.pdf`](file:///C:/dev/rea/spikes/motor/out/opcion-b/muestra-revu.pdf)
- Abrir en Revu / Acrobat: comprobar que la anotación `/Square` verde se dibuja y se conserva como objeto nativo tras el guardado incremental.

### C. Muestra de Opción C: [`spikes/motor/out/opcion-c/muestra-revu.pdf`](file:///C:/dev/rea/spikes/motor/out/opcion-c/muestra-revu.pdf)
- Abrir en Revu: comprobar la capa `Capa Revu pdfcraft` y el estado de revisión `Aceptado` en la lista de marcas.

### D. Muestra de Opción D: [`spikes/motor/out/opcion-d/muestra-revu.pdf`](file:///C:/dev/rea/spikes/motor/out/opcion-d/muestra-revu.pdf)
- Abrir en Acrobat: comprobar que el rectángulo y el sello estándar se visualizan correctamente, pero notar que el archivo ha sido completamente reescrito (no incremental).


