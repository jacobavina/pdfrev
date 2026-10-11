# ADR-0015: Mediciones Básicas para Takeoff, Calibración por Página y Cuantificación de Planos

- **Estado:** Aceptado
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA
- **Relacionado con:** [ADR-0002](file:///C:/dev/rea/docs/DECISIONS/ADR-0002-normalized-coordinates-and-viewport-rotation.md), [ADR-0003](file:///C:/dev/rea/docs/DECISIONS/ADR-0003-bbx-persistence-format-versioning.md), [ADR-0011](file:///C:/dev/rea/docs/DECISIONS/ADR-0011-motor-pdf.md), [ADR-0013](file:///C:/dev/rea/docs/DECISIONS/ADR-0013-pdf-interoperability-and-incremental-update.md), [08-plan-orquestador.md](file:///C:/dev/rea/docs/plan-v2/08-plan-orquestador.md)

---

## 1. Contexto

La estimación de cantidades y cómputos métricos de obra (*takeoff*) es una de las funciones cardinales de Bluebeam Revu en la industria de la construcción y la ingeniería civil. Para que REA proporcione un flujo de trabajo de medición fiable y con precisión matemática, se requerían las siguientes capacidades (Paquete 4 del Plan Maestro):

1. **Calibración por Página Independiente:** Cada página de un plano PDF puede tener una escala distinta (e.g., 1:50, 1:100 o escala gráfica). Es indispensable permitir calibrar la escala fijando una distancia conocida entre dos puntos de referencia en el plano.
2. **Herramientas de Medición:**
   - **Longitud (`length`):** Medición de distancia lineal entre 2 puntos con cotas de dimensión.
   - **Polilínea de Medición (`polylineMeasure`):** Medición continua de trayectos segmentados y distancias acumuladas.
   - **Área (`area`):** Medición de superficies poligonales o rectangulares con cálculo automático de área superficial y perímetro asociado.
   - **Conteo (`count`):** Puntos de conteo e inventario con numeración secuencial automática por página y documento.
3. **Invariancia ante Rotaciones de Página (Test de Oro):** La medición de distancias y superficies no debe verse afectada por la rotación del visor PDF (0°, 90°, 180°, 270°). Un rectángulo físico de 300 × 200 pt bajo una escala calibrada de 1 pt = 0.01 m debe medir exactamente **6.00 m² de área y 10.00 m de perímetro** sin importar la orientación de la vista.
4. **Resumen de Totales y Exportación:** Agregación de subtotales en la lista de marcas (`MarkupsList`), ordenación por medida e inclusión de columnas de medición en la exportación CSV con mitigación RFC 4180 / DDE.
5. **Interoperabilidad PDF ISO 32000-1:** Almacenamiento en streams `/AP /N` con cotas gráficas de medida y persistencia de metadatos de medición en el diccionario privado de REA dentro del PDF y en el esquema `.bbx.json`.

---

## 2. Decisiones de Diseño

### 2.1 Modelo de Tipos de Medición (`src/types/markup.ts`)
- Se agregan `'length'`, `'polylineMeasure'`, `'area'` y `'count'` a `VALID_MARKUP_TYPES`.
- Se define el tipo `MeasurementUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft'`.
- Se introduce `PageCalibration`:
  ```ts
  export interface PageCalibration {
    scale: number; // Factor multiplicador: 1 pt = scale unidades (e.g., 0.02 m)
    unit: MeasurementUnit;
    precision: number;
    rawInputLength?: number;
    rawInputUnit?: MeasurementUnit;
    ptDistance?: number;
  }
  ```
- Se introduce `MarkupMeasurement`:
  ```ts
  export interface MarkupMeasurement {
    value: number;
    unit: MeasurementUnit;
    formatted: string;
    perimeter?: number;
    countIndex?: number;
  }
  ```
- `migrateBbxDocument`: Sanitización y preservación estricta de `measurement` y `locked` ante ciclos de autoguardado y migración.

### 2.2 Motor de Cálculo Puro (`src/core/measurements/calculate.ts`)
- Módulo sin efectos secundarios ni dependencias de DOM:
  - `calculateLength(points, pageDimsPt, calibration)`: distancia euclídea `Math.hypot(dx, dy) * scale`.
  - `calculatePolylineLength(points, pageDimsPt, calibration)`: sumatoria de tramos consecutivos.
  - `calculateArea(points, pageDimsPt, calibration, isRectangle)`: área mediante fórmula de Gauss (Shoelace) y perímetro continuo de polígono cerrado; para rectángulos de 2 puntos, producto de dimensiones axiales en espacio de página desrotado.
  - `calculateCount(countIndex, unit)`: conteo incremental validado.
  - `formatMeasurement(value, unit, precision, isArea)`: formateo limpio a prueba de `NaN` o infinitos, agregando el superíndice `²` para áreas.

### 2.3 Store de Calibración (`src/store/useCalibrationStore.ts`)
- Estado desacoplado `calibrations: Record<number, PageCalibration>` indexado por `pageIndex`.
- Guardas estrictas contra valores menores o iguales a cero o no numéricos.
- Control del modal de calibración (`isCalibrationModalOpen`) y puntos pendientes (`pendingCalibrationPoints`).

### 2.4 Interfaz de Usuario y Componentes
- **Modal de Calibración (`src/components/CalibrationModal.tsx`):** Accesible con `data-testid="calibration-modal"`, cálculo automático de distancia de plano en pt si se trazó con 2 puntos, selección de unidades ('mm', 'cm', 'm', 'in', 'ft') y selector de precisión decimal (1 a 4).
- **Indicador de Calibración en Pie de Página (`src/components/PdfViewer.tsx`):** Botón reactivo `data-testid="calibration-indicator"` que exhibe la escala activa (e.g., `Escala: 1 m = 50.0 pt`) o `Sin calibrar (1 pt = 1 pt)` con selector de color indicativo (verde para calibrado, ámbar para estándar).
- **Barra Superior (`src/components/TopBar.tsx`):** Botones con atributos `data-testid`:
  - `tool-calibrate`
  - `tool-measure-length`
  - `tool-measure-polyline`
  - `tool-measure-area`
  - `tool-measure-count`
- **Lista de Marcas y Agregación (`src/components/MarkupsList.tsx`):**
  - Columnas `Medida` y `Unidad` con soporte para ordenación numérica.
  - Pie de tabla `<tfoot>` con contenedor `data-testid="markups-totals-summary"` que suma longitudes por unidad, áreas por unidad y el recuento total de conteo.

### 2.5 Persistencia e Interoperabilidad PDF ISO 32000-1
- **Operadores de Apariencia (`src/core/pdf/operators.ts`):** Generación de streams vectoriales `/AP /N` con etiquetas de cota de texto en `WinAnsiEncoding`, líneas con ticks perpendiculares para acotación y patrones de relleno semitransparentes.
- **Escritor Incremental (`src/core/pdf/incrementalWriter.ts`):** Serialización de `/Subtype /Line` (para `length`), `/Subtype /PolyLine` (para `polylineMeasure`), `/Subtype /Polygon` (para `area`) y `/Subtype /Square` (para `count`), incluyendo el diccionario privado `/REA << /measurement << /value ... /unit ... /formatted ... >> >>`.
- **Lector de Anotaciones (`src/core/pdf/annotationReader.ts`):** Importación y reconstrucción fiel de las marcas con su objeto `measurement` intacto.

---

## 3. Consecuencias y Verificación

### 3.1 Verificación de Pruebas
- Suite de cálculo pura con **12 tests**, incluyendo el **Test de Oro de 4 Rotaciones** validando que 300 × 200 pt entrega exactamente `6.00 m²` y `10.00 m` en 0°, 90°, 180° y 270°.
- Tests de componentes React:
  - `CalibrationModal.test.tsx` (4 tests)
  - `MarkupsListMeasurements.test.tsx` (3 tests)
  - `TopBarMeasurements.test.tsx` (2 tests)
  - `PdfViewerMeasurements.test.tsx` (3 tests)
- Total de tests unitarios: **438 tests pasando al 100%** en 35 suites.
- Verificación integral con `node scripts/verify.mjs` completada exitosamente en todos los 5 pasos.
