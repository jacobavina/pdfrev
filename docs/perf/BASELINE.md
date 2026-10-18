# Línea Base de Rendimiento (Performance Baseline) — Planos Grandes y 5 000 Marcas

- **Fecha:** 2026-10-17
- **Hito:** Fase D: Rendimiento en Planos Grandes (Hito D.1 / ADR-0088)
- **Documento de Decisión:** [`docs/DECISIONS/ADR-0088-banco-pruebas-plano-grande-e-size-y-linea-base-rendimiento.md`](../DECISIONS/ADR-0088-banco-pruebas-plano-grande-e-size-y-linea-base-rendimiento.md)
- **Suite Automatizada:** [`src/core/perf/largeBlueprintBench.test.ts`](../../src/core/perf/largeBlueprintBench.test.ts)
- **Generador Determinista:** [`src/core/perf/largeBlueprintGenerator.ts`](../../src/core/perf/largeBlueprintGenerator.ts)

---

## 1. Contexto y Objetivos del Banco de Pruebas

En proyectos de ingeniería civil, edificación comercial e infraestructura industrial, los planos se imprimen y revisan típicamente en formato **ANSI/Arch E (3600 × 2400 pt)**. A lo largo del ciclo de vida de un proyecto, un único plano puede acumular miles de marcas de medición, notas de revisión, nubes y sellos.

Siguiendo la directriz del Plan Maestro (P5-A.1 y decisión D-7), el Hito D.1 **no introduce optimizaciones prematuras**, sino que **mide y caracteriza con rigor empírico** los cuellos de botella actuales de REA para justificar con datos los hitos D.2 (índice espacial), D.3 (renderizado acotado a viewport) y D.4 (guardado en streaming).

---

## 2. Resultados Literales de la Medición

Ejecución sobre fixture determinista E-Size (3600 × 2400 pt) con 5 000 marcas sintéticas (semilla Mulberry32 = 42):

```json
{
  "sheetSizePt": "3600 x 2400",
  "sheetInitMs": 88.57,
  "markupsCount": 5000,
  "markupsGenerationMs": 8.32,
  "hitTest": {
    "queriesRun": 50,
    "avgLatencyMs": 0.961,
    "worstLatencyMs": 14.392
  },
  "marquee": {
    "window10PercentMs": 8.11,
    "window50PercentMs": 1.73
  },
  "incrementalSave": {
    "serializationMs": 248.04,
    "originalSizeBytes": 16576,
    "savedSizeBytes": 6027803,
    "addedSizeBytes": 6011227
  },
  "canvasCliff": {
    "safeUntiledMaxZoomDpr1": "455%",
    "safeUntiledMaxZoomDpr2": "227%",
    "chromiumMaxDimensionPx": 16384
  }
}
```

---

## 3. Desglose de Métricas y Diagnóstico Técnico

### 3.1 Inicialización y Parseo de Hoja E-Size (3600 × 2400 pt)
- **Tiempo de carga y parseo:** **88.57 ms** (muy por debajo de 500 ms).
- **Diagnóstico:** La estructura del documento base es ligera y eficiente. La carga de un plano de gran formato no supone un cuello de botella de inicialización.

### 3.2 Hit-Testing Lineal con 5 000 Marcas (Interacción del Cursor)
- **Latencia promedio:** **0.96 ms**.
- **Latencia en el peor caso (Worst-case):** **14.39 ms**.
- **Diagnóstico:** Para mantener 60 FPS en pantalla durante el movimiento continuo del ratón (`mousemove`), el presupuesto total por fotograma es de **16.6 ms**. Una sola comprobación que tarda 14.4 ms consume el **86% del presupuesto del frame**, provocando caídas de fotogramas y sensación de pesadez (*stutter*).
- **Acción requerida (Hito D.2):** Implementación de una grilla espacial 2D / R-Tree en `src/core/markup/spatialIndex.ts` para reducir la búsqueda a $O(\log N)$ o $O(1)$ celular, garantizando hit-testing en $< 2$ ms para cualquier cursor.

### 3.3 Selección por Ventana Marquee
- **Ventana del 10% de superficie:** **8.11 ms**.
- **Ventana del 50% de superficie:** **1.73 ms**.
- **Diagnóstico:** El filtrado por Bounding Box actual es rápido, pero la expansión de grupos (`groupId`) y la iteración lineal se beneficiarán directamente del índice espacial de D.2.

### 3.4 Guardado Incremental ISO 32000-1 (5 000 Anotaciones)
- **Tiempo de serialización:** **248.04 ms**.
- **Tamaño del apéndice incremental:** **6.01 MB** (1 202 bytes por marca con diccionario, `/AP` y `/REA`).
- **Invariante:** Se conserva el 100% de los bytes originales como prefijo binario.
- **Diagnóstico:** 248 ms es perfectamente aceptable para guardado en segundo plano, pero en archivos base de 100 MB reales la clonación por IPC a Rust debe ser en streaming acotado (Hito D.4).

### 3.5 El Acantilado de Canvas en Chromium / WebView2 (16 384 px)

El motor gráfico de Chromium (Blink / Skia) impone un límite duro de hardware de **16 384 píxeles** por dimensión para cualquier elemento `<canvas>`:

| Nivel de Zoom | Densidad (DPR) | Ancho en Píxeles | Alto en Píxeles | Megapíxeles | Memoria RGBA | ¿Seguro sin Mosaicos? |
|---|---|---|---|---|---|---|
| **100% (1.0x)** | 1.0 (Estándar) | 3 600 px | 2 400 px | 8.64 MP | 32.96 MB | ✅ Sí |
| **200% (2.0x)** | 1.0 (Estándar) | 7 200 px | 4 800 px | 34.56 MP | 131.84 MB | ✅ Sí |
| **400% (4.0x)** | 1.0 (Estándar) | 14 400 px | 9 600 px | 138.24 MP | 527.34 MB | ✅ Sí |
| **456% (4.56x)** | 1.0 (Estándar) | **16 416 px** | 10 944 px | 179.66 MP | 685.38 MB | ❌ **COLAPSO (> 16 384 px)** |
| **600% (6.0x)** | 1.0 (Estándar) | **21 600 px** | 14 400 px | 311.04 MP | 1 186.52 MB | ❌ **COLAPSO (> 16 384 px)** |
| **200% (2.0x)** | 2.0 (Retina/4K) | 14 400 px | 9 600 px | 138.24 MP | 527.34 MB | ✅ Sí |
| **228% (2.28x)** | 2.0 (Retina/4K) | **16 416 px** | 10 944 px | 179.66 MP | 685.38 MB | ❌ **COLAPSO (> 16 384 px)** |

- **Conclusión Crítica:** En monitores de alta densidad (Retina o escala 150%–200% en Windows), un plano E-size **supera el límite de Chromium a partir de tan solo 228% de zoom**, y a 456% en monitores estándar. Al superarse 16 384 px, el canvas se desasigna o muestra una pantalla blanca vacía.
- **Acción requerida (Hito D.3):** Tiled Viewport Rendering — el visor solo debe renderizar el área visible de la ventana gráfica más un margen de sobreexploración (*overscan*), eliminando el límite de zoom para planos de cualquier tamaño.

---

## 4. Propuesta de SLOs de Rendimiento

> **NOTA DE GOBERNANZA (Decisión D-7):**  
> Los siguientes umbrales constituyen una **propuesta técnica pendiente de aprobación formal del usuario**.

| Operación | Métrica Actual (D.1) | SLO Propuesto (D.2–D.4) | Justificación de Ingeniería |
|---|---|---|---|
| **Hit-testing (5 000 marcas)** | Avg: 0.96 ms / Max: 14.39 ms | **Max < 3.0 ms** | Preserva 60 FPS durante `mousemove` continuo |
| **Selección Marquee (5 000 marcas)** | 8.11 ms | **< 5.0 ms** | Respuesta interactiva inmediata en selección |
| **Zoom Máximo en E-Size** | Limitado a 227% (DPR 2) / 455% (DPR 1) | **Hasta 1 000% sin pantalla blanca** | Supera el acantilado de 16 384 px mediante mosaicos |
| **Serialización de Guardado (5 000 marcas)** | 248.04 ms | **< 300 ms** | Guardado imperceptible sin bloqueo de UI |
| **Uso de Memoria en Guardado (Plano 100 MB)** | Copia completa en memoria (clonación IPC) | **Streaming acotado a < 25 MB** | Evita picos de memoria en el proceso WebView2 |
