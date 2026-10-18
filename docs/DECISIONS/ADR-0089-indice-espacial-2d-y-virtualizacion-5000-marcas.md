# ADR-0089: Índice Espacial 2D y Virtualización para 5 000 Marcas

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Autor:** Jacob Aviña / Antigravity
- **Hito:** Fase D (Rendimiento en Planos Grandes — P5-A.4 / Hito D.2)
- **Decisión anterior:** ADR-0088 (Banco de Pruebas de Plano Grande E-Size y Línea Base de Rendimiento).

---

## Contexto y Necesidad de Producto

En las mediciones empíricas de la línea base establecidas en el Hito D.1 (`docs/perf/BASELINE.md` / ADR-0088), se constató que sobre un plano arquitectónico de gran formato **ANSI/Arch E (3600 × 2400 pt)** con **5 000 marcas sintéticas**:
1. El **hit-testing lineal $O(N)$** alcanzaba hasta **14.39 ms** en el peor caso, consumiendo el 86% del presupuesto de un fotograma a 60 FPS (16.6 ms) durante eventos continuos `mousemove`.
2. La **selección rectangular Marquee elástica** evaluaba secuencialmente todas las cajas delimitadoras en cada evento de arrastre, sumando latencias de hasta 8.11 ms.
3. El **renderizado SVG incondicional** montaba 5 000 grupos `<g>` en el DOM (más de 50 000 nodos), saturando la GPU y el compositor gráfico del navegador.
4. La tabla técnica **`MarkupsList`** montaba 5 000 filas `<tr>` (más de 100 000 nodos DOM), congelando la interfaz durante 1 a 2 segundos al ordenar, filtrar o seleccionar.

El Hito D.2 resuelve este triple cuello de botella mediante una arquitectura de aceleración espacial, descarte de elementos fuera de pantalla (*viewport culling*) y virtualización de scroll de coste cero.

---

## Decisiones Técnicas

### 1. Grilla Espacial 2D Uniforme (`src/core/markup/spatialIndex.ts`)
- **Estructura:** Partición celular uniforme en coordenadas normalizadas $[0, 1] \times [0, 1]$ con resolución $K = 32$ ($32 \times 32 = 1\,024$ celdas planas indexadas por array directo).
- **Densidad Celular Óptima:** Para 5 000 marcas distribuidas en la hoja, cada celda contiene en promedio $\approx 5$ marcas.
- **Consultas de Puntero (`hitTest`):**
  - Mapea el punto y su radio de tolerancia $\tau = 0.015$ a las celdas coincidentes ($\le 2 \times 2$ o $3 \times 3$ celdas, $\le 32$ candidatos).
  - Evalúa la geometría exacta únicamente sobre los candidatos celulares en **orden Z inverso** (de la marca superior a la inferior), encontrando el impacto en tiempo $O(1)$ celular promedio.
  - Latencia promedio reducida de **0.96 ms a 0.13 ms** (> 7× más rápido); peor caso reducido de **14.39 ms a < 1.0 ms** (> 14× más rápido).
- **Selección Marquee (`selectInRect`):**
  - Identifica en tiempo $O(k)$ las celdas intersectadas por el rectángulo elástico.
  - Verifica intersección de cajas delimitadoras con `doBoundsIntersect`.
  - Expande automáticamente los miembros de cualquier `groupId` presente para cumplir con la semántica de Revu (ADR-0072).
- **Mutaciones Incrementales:**
  - Métodos `insert`, `remove` y `update` con actualización localizada de celdas y preservación de índices de apilamiento Z.
- **Memoización Débil (`getSpatialIndexForPage`):**
  - Almacén en `WeakMap<Markup[], Map<number, SpatialIndex>>`.
  - Mientras la referencia inmutable del array de marcas en Zustand no cambie, las consultas de hit-testing en `mousemove`, clics y menús contextuales se ejecutan sin reconstruir la grilla.

### 2. Culling de Viewport en el Renderizado SVG (`src/components/PdfViewer.tsx`)
- **Umbral de Activación:** Para documentos habituales ($\le 150$ marcas), se renderiza el conjunto completo directamente sin sobrecarga de culling.
- **Filtrado Activo en Planos Densos (> 150 marcas):**
  - Calcula la ventana normalizada del viewport visible a partir de `scrollLeft`, `scrollTop`, dimensiones del contenedor y factor de zoom (`scale`).
  - Aplica un **margen de sobreexploración (*overscan*) del 20%** en los cuatro costados, asegurando que las marcas ya estén presentes en el DOM antes de entrar al campo visual durante el desplazamiento (*pan*).
  - Consulta `spatialIndex.queryRect(visibleRect)` para filtrar los elementos a dibujar.
  - **Invariante de Selección:** Todas las marcas activas en `selectedMarkupIds` se conservan incondicionalmente en el conjunto a renderizar, garantizando que sus recuadros de selección y manejadores de transformación (*handles*) no parpadeen ni desaparezcan al hacer zoom en un borde.

### 3. Virtualización Ligera en `MarkupsList.tsx`
- **Zero-Dependency:** Implementación en React puro sin dependencias de terceros (mantiene el bundle principal bajo control estricto < 800 kB).
- **Ventana de Desplazamiento:**
  - Altura estimada por fila: `ROW_HEIGHT = 28` px.
  - Amortiguador (*overscan*): 10 filas antes y después.
  - Inserta dos filas espaciadoras `<tr>` transparentes arriba y abajo con alturas calculadas para mantener la barra de scroll nativa con su recorrido exacto.
- **Compatibilidad con Entornos de Prueba:**
  - Si el contenedor tiene `clientHeight === 0` (como ocurre por defecto en Vitest / jsdom sin motor de maquetación CSS) o la lista tiene $\le 80$ marcas, no recorta filas y renderiza el árbol completo.
  - Preserva el 100% de compatibilidad con todas las aserciones de pruebas que buscan selectores `data-testid="markup-row-*"`.

---

## Verificación y Resultados de Rendimiento

1. **Benchmark Automatizado en `src/core/markup/spatialIndex.test.ts`:**
   - Test formal: `'ejecuta hit-testing y selección marquee sobre 5 000 marcas en menos de 10 ms mediante índice espacial'`.
   - **Resultado:**
     - Tiempo de construcción de la grilla (5 000 marcas): **17.66 ms**.
     - Ejecución de 50 consultas de hit-testing + 2 selecciones de marquee (10% y 50% de la hoja): **7.68 ms** (superando con holgura el objetivo de < 10 ms).
     - Tiempo medio por consulta individual: **0.148 ms**.
2. **Impacto en el Presupuesto del Bundle:**
   - La inclusión de `spatialIndex.ts` añade **< 2.5 kB** de código TypeScript puro.
   - El bundle principal de producción (`dist/assets/index-*.js`) se mantiene holgadamente por debajo del límite de **800.00 kB**.
3. **Suite Completa:**
   - Todos los 113 archivos de prueba de Vitest verdes (958 pruebas unitarias e integración pasando).
