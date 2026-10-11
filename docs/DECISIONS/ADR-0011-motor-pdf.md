# ADR-0011: Selección de Motor PDF y Persistencia Incremental (D-10)

- **Estado:** Aceptado (aprobado por el usuario, 2026-10-11)
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA
- **Relacionado con:** [ADR-0010](file:///C:/dev/rea/docs/DECISIONS/ADR-0010-corpus-fidelidad-local.md), [07-estrategia-de-motor-y-completitud.md](file:///C:/dev/rea/docs/plan-v2/07-estrategia-de-motor-y-completitud.md), [SPIKE-MOTOR.md](file:///C:/dev/rea/docs/perf/SPIKE-MOTOR.md)

---

## 1. Contexto

En el marco del plan v2 y tras la aprobación de la decisión **D-10 (2026-10-11)**, el proyecto REA fijó como meta técnica alcanzar **las funciones y flujos de Bluebeam Revu con el nivel de completitud técnica de pdfcraft**. Para materializar esta visión sin comprometer el calendario ni asumir riesgos arquitectónicos a ciegas, se diseñó el hito de investigación **P3-A.1: Spike de Motor PDF**, evaluando cuatro alternativas sobre un corpus estandarizado de 1,001 documentos PDF (11 fixtures sintéticos controlados + 990 archivos reales de Mozilla PDF.js catalogados bajo [ADR-0010](file:///C:/dev/rea/docs/DECISIONS/ADR-0010-corpus-fidelidad-local.md)):

1. **Opción A (Actual ampliado):** Renderizado en WebView2 con PDF.js + manipulación de objetos con pdf-lib + escritor incremental append-only propio.
2. **Opción B (Núcleo propio en Rust desde cero):** Desarrollo in-house de parsers de xref clásica y streams, tablas de objetos, diccionarios y escritor incremental.
3. **Opción C (Crates de pdfcraft):** Integración de los crates en Rust de `pdfcraft` (`pdfcraft-cos`, `pdfcraft-crypt`) bajo licencia dual MIT/Apache-2.0.
4. **Opción D (PDFium nativo):** Integración del motor en C++ de Chromium a través del crate `pdfium-render` y binario dinámico `pdfium.dll`.

Cada opción fue evaluada y auditada rigurosamente midiendo 9 métricas objetivas (M1 a M9) con salidas registradas en logs en disco (`spikes/motor/logs/<opcion>/`), aplicando la rúbrica ponderada estipulada en `07-estrategia-de-motor-y-completitud.md` §3.2.

---

## 2. Decisión Propuesta

Se propone formalmente al usuario adoptar una **Estrategia Híbrida Gradual y Pragmática**:

### 2.1 Motor Principal para la Fase 3: Opción A (Actual Ampliado + Escritor Incremental Propio)
1. **Adopción Inmediata:** Mantener PDF.js como motor de visualización en el frontend y utilizar un escritor incremental puro (*append-only*) para toda la persistencia de marcado técnico en la Fase 3.
2. **Fundamento Técnico:**
   - **Puntuación en rúbrica:** Obtuvo **94.5 / 100**, superando ampliamente a las demás opciones.
   - **Coste y tiempo hasta el objetivo (M9):** Menor esfuerzo de implementación estimado (~5.5 semanas de agente), permitiendo iniciar de inmediato los hitos de anotaciones técnicas de la Fase 3 sin anteponer bloques de desarrollo de motor de varios meses.
   - **Rendimiento e Integración (M5, M7):** Renderizado directo en el Canvas de WebView2 con **cero copias de memoria por IPC**, eliminando la necesidad de implementar servidores de mosaicos locales o transportar decenas de megabytes por segundo en bitmaps rasterizados.
   - **Fidelidad y Preservación de Archivo (M3):** El escritor incremental garantiza mediante una invariante dura que el 100% de los bytes originales del PDF se mantienen inmutables (`output[..orig_len] == original`), preservando firmas digitales preexistentes y estructuras de archivo complejas.
   - **Requisitos de Revu (M6):** Soporte comprobado de capas (`/OC`), calibración y escalas (`/Measure` y `/VP`), estados de revisión estructurados (`/StateModel Review`) y sellos de aprobación con flujos de apariencia `/AP`.

### 2.2 Façade Headless y Arquitectura de Transición (Hito P3-A.5 y Fase 7)
1. **Desacoplamiento mediante Façade de REA:** En el hito `P3-A.5`, se construirá la interfaz unificada de núcleo y herramienta CLI (`rea-cli`) de manera completamente agnóstica al motor.
2. **Evolución hacia Crates de `pdfcraft` (Fase 7):**
   - La Opción A presenta como limitación técnica conocida su incapacidad para cifrar documentos nativamente (R2 a R6) o manipular formularios interactivos AcroForm avanzados.
   - La Opción C (`pdfcraft-cos`, con **87.5 / 100**) demostró ser una solución arquitectónica superior en Rust para este dominio.
   - Por consiguiente, para la **Fase 7 (Seguridad, Cifrado y Formularios)**, se integrarán los módulos de `pdfcraft` (`pdfcraft-cos`, `pdfcraft-crypt`) tras la Façade de Rust, momento en el cual el proyecto upstream habrá madurado más allá de su estado alfa actual (v0.6.0).

### 2.3 Descarte de las Opciones B y D
1. **Descarte de Opción B (Núcleo Propio Rust desde Cero):**
   - Puntuación: **44.5 / 100**.
   - **Motivo:** Coste prohibitivo de ingeniería (~46 a 60 semanas) para reinventar un parser de PDF tolerante a fallos y un rasterizador 2D, desviando los recursos del producto de las funciones de valor de Bluebeam Revu hacia infraestructura de bajo nivel ya resuelta.
2. **Descarte de Opción D (PDFium):**
   - Puntuación: **68.0 / 100**.
   - **Motivo:** Incompatibilidad fundamental con la escritura incremental de serie en los bindings de Rust (`pdfium-render` ejecuta `FPDF_SaveAsCopy` con flags en cero, reescribiendo la totalidad del archivo y alterando el prefijo de bytes); sobrecoste de empaquetado (+16 MB de DLL) y complejidad innecesaria en el pipeline de renderizado IPC para Windows/Tauri.

---

## 3. Síntesis de Resultados Empíricos (Spike P3-A.1)

| Métrica | Opción A (Elegida) | Opción B (Propia) | Opción C (pdfcraft) | Opción D (PDFium) |
|---|---|---|---|---|
| **M1: Robustez apertura (1,001 PDFs)** | **98.10%** (982/1001 OK) | **98.90%** (990/1001 OK) | **98.50%** (986/1001 OK) | **98.30%** (984/1001 OK) |
| **M2: Fidelidad de render** | **100.0%** (WebView2) | 0.0% (sin rasterizador) | ~90-95% (hayro GPU) | ~98.5% (Chromium AGG) |
| **M3: Round-trip incremental** | **100% OK** (prefijo intacto) | Parcial (solo xref básica) | **100% OK** (`write_incremental`) | Falla (reescribe todo) |
| **M4: Archivos difíciles** | Detecta cifrado / OK streams | Falla en descifrado/streams | R2–R6 / tolerancia alta | Cifrado industrial OK |
| **M5: Planos grandes (100 MB / Hoja E)** | 1.3 ms Hoja E / 69 ms parseo | < 1 ms / < 2 ms | < 2 ms / < 3 ms | < 3 ms / < 5 ms |
| **M6: Semántica Revu (/OC, /Measure, /AP)** | **Completo y verificado** | Parcial (sin /AP) | Modelo COS completo | Parcial (anotaciones básicas) |
| **M7: Integración Tauri/Windows** | **Óptima** (0 copias IPC) | Requiere puente IPC | En desarrollo (alfa v0.6) | Pesada (+16 MB DLL + IPC) |
| **M8: Licencia y procedencia** | Apache-2.0 / MIT | Propia REA | Dual MIT / Apache-2.0 | BSD-3-Clause (binario) |
| **M9: Coste hasta el objetivo** | **~5.5 semanas** | ~46–60 semanas | ~7.5 semanas | ~14 semanas |
| **PUNTUACIÓN PONDERADA TOTAL** | **94.5 / 100** | **44.5 / 100** | **87.5 / 100** | **68.0 / 100** |

*Nota:* Las evidencias y comandos literales que respaldan cada cifra se encuentran registrados en [`docs/perf/SPIKE-MOTOR.md`](file:///C:/dev/rea/docs/perf/SPIKE-MOTOR.md).

---

## 4. Consecuencias y Plan de Acción

1. **Impacto en el Plan de Fases:**
   - La Fase 3 se desarrolla conforme a la planificación prevista en `docs/plan-v2/03-plan-por-fases.md`, enfocándose en el soporte de anotaciones PDF ISO 32000-1, cálculo de apariencias `/AP`, capas `/OCG` y calibración de planos.
   - El escritor incremental prototipado en `spikes/motor/opcion-a/incremental-writer.mjs` se traslada a la arquitectura de producción de REA garantizando persistencia atómica en disco ([ADR-0004](file:///C:/dev/rea/docs/DECISIONS/ADR-0004-atomic-rust-commands-io.md)).
2. **Recomendación de Infraestructura (`qpdf`):**
   - Durante el spike se constató la ausencia de la utilidad `qpdf` en el entorno Windows del sistema. Se propone al usuario incorporar `qpdf` (vía `winget install qpdf` o ejecutable portable) para utilizarse como validador de sintaxis independiente en la suite de verificación automatizada a partir del hito P3-G.1.
3. **Revisión del Usuario:**
   - La validez visual de las muestras generadas queda sujeta a la inspección manual del usuario en Bluebeam Revu y Adobe Acrobat siguiendo el checklist de [`docs/perf/SPIKE-MOTOR.md`](file:///C:/dev/rea/docs/perf/SPIKE-MOTOR.md) §6.
