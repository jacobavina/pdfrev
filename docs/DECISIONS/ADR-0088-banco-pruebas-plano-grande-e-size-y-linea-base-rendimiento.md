# ADR-0088: Banco de Pruebas de Plano Grande E-Size y Línea Base de Rendimiento

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Autor:** Jacob Aviña / Antigravity
- **Hito:** Fase D (Rendimiento en Planos Grandes — P5-A.1 / Hito D.1)
- **Decisión anterior:** ADR-0087 (Archivos Recientes, Pantalla Inicial y Cierre de Fase C).

---

## Contexto y Necesidad de Producto

En proyectos reales de arquitectura, ingeniería y construcción (AEC), los planos técnicos se formatean en hojas de gran escala: **ANSI/Arch E (3600 × 2400 pt)**. Conforme los equipos de obra y oficina técnica avanzan en revisiones y mediciones de takeoff, los planos acumulan miles de marcas vectoriales (longitudes, áreas, cotas, nubes de revisión, llamadas y cómputos).

Para garantizar que REA mantenga una respuesta fluida equivalente a Bluebeam Revu 21, el Plan Maestro (Fase D, decisión D-7) dictamina que cualquier optimización arquitectónica debe estar fundamentada en **mediciones empíricas objetivas** antes de introducir código complejo.

El Hito D.1 establece este marco empírico mediante:
1. Un generador determinista y reproducible de planos arquitectónicos E-size con mallas estructurales y 5 000 marcas sintéticas.
2. Un arnés de pruebas automatizado en Vitest que evalúa los tiempos de carga, hit-testing lineal, selección por ventana y serialización de guardado.
3. El análisis matemático del acantilado de renderizado de Chromium/WebView2 (límite de 16 384 px por canvas).
4. El registro de una línea base formal en `docs/perf/BASELINE.md` con propuesta de SLOs sujeta a confirmación del usuario.

---

## Decisiones Técnicas

### 1. Generador Determinista Mulberry32 (`src/core/perf/largeBlueprintGenerator.ts`)
- **Algoritmo PRNG:** Implementación de Mulberry32 (32 bits enteros, sin dependencias externas). Garantiza que dos ejecuciones con la misma semilla generen exactamente la misma secuencia de números pseudoaleatorios en cualquier motor JavaScript (V8, WebKit, SpiderMonkey).
- **Hoja E-Size (3600 × 2400 pt):** Generación de geometría CAD con trazos vectoriales estándar:
  - Marco perimetral y márgenes técnicos.
  - Malla de ejes estructurales (Grid lines) horizontales y verticales con burbujas de nomenclatura en extremos.
  - Zapatas de cimentación y pilares con aspas diagonales en las intersecciones.
  - Muros de carga perimetrales e interiores.
  - Cajetín de plano oficial (Title Block) subdividido.
- **Distribución de 5 000 Marcas Sintéticas:** Muestreo representativo de un plano de edificación real:
  - 15% mediciones de longitud (`length`).
  - 15% mediciones de área poligonal (`area`).
  - 15% cajas de equipos y recintos (`rectangle`).
  - 15% nubes de revisión y notas (`cloud`, `cloudPlus`).
  - 15% llamadas de detalle con directriz (`callout`).
  - 10% textos y notas de estancia (`text`).
  - 5% marcadores de conteo secuencial (`count`).
  - 5% trazados de conductos e instalaciones (`polyLine`, `line`).
  - 5% inspecciones de pilares cilíndricos (`circle`).
  - ~5% agrupadas con `groupId` compartido para evaluar desreferenciación en grupo.
  - Coordenadas normalizadas acotadas en $[0.05, 0.95]$.

### 2. Suite de Benchmarking Automatizada (`src/core/perf/largeBlueprintBench.test.ts`)
- Implementa el test requerido formalmente para paridad:
  `'mide tiempo de primer render, hit-testing con 5000 marcas y memoria de guardado sobre plano E-size sintético'`.
- Cuantifica con `performance.now()`:
  - Tiempo de inicialización y verificación de hoja E-size: **88.57 ms**.
  - Hit-testing lineal sobre 5 000 marcas (50 consultas reales): **0.96 ms promedio**, pero alcanzando **14.39 ms en el peor caso**.
  - Selección por ventana Marquee: **8.11 ms** para ventana del 10% y **1.73 ms** para ventana del 50%.
  - Guardado incremental ISO 32000-1 (5 000 anotaciones completas con `/AP` y `/REA`): **248.04 ms**, añadiendo 6.01 MB al archivo sin violar la invariante de prefijo original.

### 3. Prueba Matemática del Límite de Canvas en Chromium (16 384 px)
- Se documenta y evalúa en `calculateCanvasDimensions` la cota dura de hardware en Chromium:
  $$\text{Ancho}_{\text{px}} = \text{Ancho}_{\text{pt}} \times \text{Zoom} \times \text{DPR}$$
  - A DPR = 1.0 (pantallas estándar): Zoom máximo seguro sin mosaicos = **455%** ($3600 \times 4.55 = 16380$ px). A 456%, el ancho supera 16 384 px.
  - A DPR = 2.0 (pantallas Retina / 4K / escalado Windows > 150%): Zoom máximo seguro sin mosaicos = **227%** ($3600 \times 2.27 \times 2 = 16344$ px). A 228%, el canvas colapsa.
- Esto proporciona la justificación empírica y matemática para el **Hito D.3 (Tiled Viewport Rendering)**.

### 4. Presupuesto de Bundle y Aislamiento de Código
- El módulo generador y la suite de benchmarking viven estrictamente en `src/core/perf/` y `scripts/`.
- No son importados por la interfaz de usuario ni por el shell de la aplicación (`App.tsx`, `PdfViewer.tsx`, etc.).
- Impacto en el bundle principal de producción: **0 bytes adicionales** en `dist/assets/index-*.js`.

---

## Verificación y Calidad

- **Pruebas Unitarias del Generador (`largeBlueprintGenerator.test.ts`):** 6 pruebas que validan determinismo Mulberry32, dimensiones de hoja E-size, distribución de 5 000 marcas y cálculo de límites de canvas.
- **Suite de Benchmarking (`largeBlueprintBench.test.ts`):** 1 prueba completa de benchmarking ejecutada en verde en 426 ms.
- **Línea Base Documentada (`docs/perf/BASELINE.md`):** Tabla con mediciones literales y propuesta explícita de SLOs para el usuario.
- **Auditoría Literal de Paridad:** `node scripts/parity-check.mjs` verifica 210 capacidades `shipped` literales.
