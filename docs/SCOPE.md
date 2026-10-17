# docs/SCOPE.md — Control de Alcance del Proyecto REA

> **Regla de oro:** Lo que no está en este documento **NO se implementa**. Añadir cualquier característica no contemplada aquí requiere un Architecture Decision Record (ADR) formal y la aprobación explícita del usuario.
> **Prohibición absoluta:** Nunca reabrir una fase cerrada para "adecuarla" a nuevas directrices.

---

## 1. Fase 1: Motor Base de Anotaciones y Shell CAD (CERRADA)

### IN (Entregado y Verificado — 114 Tests Unitarios, 4 Cargo Tests, 3 E2E)
- **Visualizador PDF de Alto Rendimiento:** Integración con PDF.js cargando el worker web dinámicamente vía URL de Vite (`pdf.worker.min.mjs?url`), con renderizado en canvas offscreen para evitar parpadeos.
- **Sistema de Coordenadas y Rotación Unificada:** Conversión matemática bidireccional entre puntos de pantalla, coordenadas normalizadas `[0..1]` y espacio de puntos PDF, integrando la rotación intrínseca del plano (`page.rotate`) y la rotación interactiva del usuario (`0°`, `90°`, `180°`, `270°`).
- **Hit-Testing Geométrico Riguroso:** Algoritmos matemáticos dedicados para los 14 tipos de marcas reconocidos (fórmulas elípticas, ray-casting en polígonos, distancia a polilíneas con Ramer-Douglas-Peucker para trazos libres, distancia a directrices y cajas envolventes de texto), sin retorno genérico `return true`.
- **Exportación Vectorial Auténtica:** Generador basado en `pdf-lib` que transcribe descriptores de marcas directamente al content stream de las páginas PDF (`cm`, `re`, `l`, `c`, `q`, `Q`), verificado mediante descompresión e inspección del content stream binario.
- **Persistencia Atómica Local (`.bbx.json`):** Formato versionado `1.1.0` con migrador de versiones anteriores, invocando comandos nativos de Rust en Tauri 2 (`write_bbx` con archivo temporal `.tmp`, `sync_all()` y `rename`; `read_bbx` con manejo seguro de `NotFound`).
- **Historial Command Robusto:** Gestor `HistoryManager` con pila de deshacer/rehacer con capacidad mínima forzada de 50 pasos (`handles at least 50 steps of undo history correctly`).
- **Shell de la Aplicación:** Disposición CAD con TopBar, panel lateral colapsable de miniaturas (`ThumbnailsSidebar`), área central de visualización (`PdfViewer`) y tabla inferior de marcas (`MarkupsList`).

### OUT de Fase 1
- Edición por vértices individuales de polígonos o nubes.
- Selección múltiple y arrastre en bloque.
- Medición con calibración de escala real.

---

## 2. Fase 2: Herramientas Técnicas de Marcado y Manipulación (EN CURSO)

### IN (Alcance Aprobado de la Fase 2)
- **Bloque A: Herramientas de Marcado Avanzado y Manipulación Básica**
  - `P2-A.0`: Selección, umbral de movimiento de 4 px para descartar clics y temblores, traslación con clamp estricto al área de página `[0..1]` y reversión atómica con `Ctrl+Z`. **[CERRADO]**
  - `P2-A.1`: Nubes de revisión con parámetro `arcStep` persistido en la marca, curvatura exterior determinista por cálculo de área firmada, y herramienta `Cloud+` como grupo indivisible de nube y llamada vinculada. **[CERRADO]**
  - `P2-A.2`: Selección múltiple mediante rectángulo elástico de Marquee con criterio estricto de intersección/cruce (Crossing), selección aditiva con `Shift` o `Ctrl`, y traslación conjunta de $K$ elementos seleccionados con un solo paso de historial. Prefiltro $O(N)$ probado con 500 marcas en menos de 10 ms. **[CERRADO]**
  - `P2-A.3`: Callout / Nota técnica con directriz conectada y cuadro de texto plano interactivo. **[CERRADO]**
  - `P2-A.4`: Nota adhesiva técnica (`stickyNote`) con tamaño único cuadrado de 24 pt (`STICKY_NOTE_SIZE_PT = 24`), normalización por eje (`getStickyNoteNormalizedSize`), 4 presets de color (`yellow`, `green`, `pink`, `blue`), creación en confirmación (1 comando; 0 en cancelación), atajo `N` con guarda de inputs y exportación vectorial plana (operadores `re/m/l/f/rg/RG` sin `/Subtype /Text` ni `/Annots`). **[CERRADO]**
  - `P2-A.5`: Resaltador vectorial (`highlightVector`) con atajo `H` con guarda de foco, umbral de creación en 4 px de pantalla invariable al zoom (`exceedsScreenThreshold`), `HIGHLIGHT_STYLE` único (#ffff00 al 50% con blendMode multiply), previsualización en vivo sin fuga de líneas punteadas al PDF, puntos canónicos min/max, exportación vectorial pura con `/BM /Multiply` y `/ca 0.5` en `/ExtGState` y reversión atómica. **[CERRADO]**
  - `P2-A.6`: Resaltado de texto (`highlightText` con TextLayer de PDF.js, rectángulos normalizados, selección multilinea con groupId atómico, guarda de foco y aviso accesible en páginas sin capa de texto). **[CERRADO]**
- **Bloque B: Tool Chest**
  - Paletas de estilos definidas por el usuario persistidas en IndexedDB (esquema versionado y migrable).
  - Herramientas Recientes (FIFO con desacoplamiento seguro: el registro de recientes nunca aborta la creación de marcas ni escala excepciones al lienzo).
  - Modos Propiedad y Dibujo (modo Propiedad sobre $K$ marcas seleccionadas genera un único paso deshacible de historial).
  - Arrastrar y soltar (drag & drop) de herramientas y estilos al lienzo (ejecuta `addMarkup` una sola vez dentro de tolerancia $\pm 5$ px).
  - Menú contextual de `MarkupsList`: única acción permitida "Añadir a Tool Chest" (columnas, filtros y ordenación quedan reservados para Bloque C).
  - Resiliencia y fallback ruidoso: notificación visible en UI ante fallo de persistencia o cuota agotada de IndexedDB sin interrumpir la operatividad en memoria.
- **Bloque C: MarkupsList Completa e Inspector (Cierre de Fase 2, Camino A′ - D-2 y D-3)**
  - Ordenación y filtros avanzados por estado, autor, tipo y capa. **[CERRADO]**
  - Columnas personalizadas con parser propio de lista blanca y fórmulas aritméticas (`P2-C.3`). **[CERRADO]**
  - Gestión de estados con menú contextual interactivo. **[CERRADO]**
  - Exportación estructurada de marcas (`P2-C.4`): CSV RFC 4180 con BOM UTF-8 y mitigación de inyección de fórmulas; Reporte Resumen en PDF vía pdf-lib; comando Rust atómico con lista blanca (.csv, .pdf).
  - Inspector de propiedades (`P2-C.6` - D-3, ADR-0012): panel lateral para la selección (color, relleno, grosor, opacidad, estilo, fuentes, texto, estado) con valores mixtos "—", comando atómico con undo por cambio y guardas numéricas.
  - Botón Guardar y atajo `Ctrl+S` para persistencia en PDF / BBX.
  - Validación E2E del bloque C (`P2-C.5`).
- **Bloque D (Capas y Sellos):**
  - Conforme a la decisión **D-2 (Camino A′)**, Capas Lógicas y Sellos Dinámicos se trasladan a la **Fase 3** (Interoperabilidad PDF nativa, Bloque G) para construirse directamente sobre OCGs estándar y XObjects de apariencia (`/AP`).

### OUT EXPLÍCITO DE LA FASE 2
1. **Calibración y Acotación:** Pertenece a la Fase 4 (Medición y Takeoff).
2. **Capas y Sellos:** Trasladados a Fase 3 (D-2).
3. **Texto Enriquecido (Rich Text):** Prohibido el formateo por carácter; todo texto es texto plano.
4. **Colaboración en la Nube / Conectividad Remota:** Arquitectura estrictamente offline y local-first.

---

## 3. Fases Futuras (Planificación Vigente y Alineada con Plan v2)

### Fase 3: Interoperabilidad PDF Real, Motor y Herramientas Revu (ADR-0011, D-1)
- Persistencia de marcas como anotaciones PDF estándar ISO 32000-1 con flujos de apariencia (`/AP`). El PDF es la fuente de verdad (D-1).
- Escritor incremental en disco (append-only) que preserva el 100% de los bytes originales.
- Comando Rust `save_pdf` atómico con respaldo y validación estructural previa.
- Importación bidireccional de anotaciones PDF existentes con render dual.
- Capas PDF estándar (`/OCG`) y Sellos de aprobación con `/AP`.
- Herramientas faltantes de Revu: flecha con extremos (`/LE`), polilínea abierta, tachado/subrayado, duplicación y bloqueo (`/F 1`).

### Fase 4: Medición, Calibración y Takeoff
- Calibración por página (dos puntos y distancia real con guardas).
- Herramientas Longitud, Polilínea de medida, Área y Conteo.
- Columnas de medición en lista de marcas y exportación.

### Fase 5: Documento, Navegación y Rendimiento
- Operaciones de página (rotar, insertar, eliminar, extraer).
- Renderizado de altas prestaciones por mosaicos.
- Aplanado y desaplanado selectivo de marcas (Flatten/Unflatten).

### Fase 6: Comparación de Planos y Document Sets
- Comparación diferencial visual vectorial (Overlay Pages).
- Vista dividida sincronizada (Split View).
- Conjuntos de planos (Document Sets).

### Fase 7: Documento Protegido, Formularios y Seguridad Avanzada (pdfcraft)
- Integración de crates especializados `pdfcraft-cos` y `pdfcraft-crypt` detrás de la Façade Rust (ADR-0011).
- Lectura y guardado de PDFs cifrados (R2 a R6), contraseñas y permisos.
- Formularios interactivos AcroForm y firmas digitales básicas.
- Redacción documental permanente.

### Fase 8: Endurecimiento Continuo y Distribución
- Barrido continuo de corpus externo y fuzzing.
- Validadores externos en la puerta de calidad (`qpdf`, etc.).
- Empaquetado firmado para Windows (MSI y portable).

---

## 4. Plan Maestro de Completitud Funcional frente a Bluebeam Revu — Fases A–F (`docs/plan-v2/09-masterplan-completitud-revu.md`, ADR-0070)

### IN (Alcance Aprobado por Fases y Escenarios S1–S5)
- **Fase A — Revisión de Ingeniería (cierra con el escenario S1):**
  - `A.0 (ADR-0070)`: Higiene del bundle principal (`documentSaveService` diferido en `MenuBar` y `QuickAccessToolbar`) y enmienda de alcance.
  - `A.1 (ADR-0071)`: Respuestas e hilos en marcas (`/IRT`, `/RT /R`) con ida y vuelta en PDF y árbol de respuestas en `MarkupsList`; estados de revisión estándar (`/StateModel Review`) con múltiples transiciones preservadas.
  - `A.2 (ADR-0072)`: Ondulado de texto (`squiggly`, `/Subtype /Squiggly` con `/QuadPoints`, atajo `Shift+U`).
  - `A.3 (ADR-0073)`: Alinear (izquierda, centro, derecha, arriba, medio, abajo), distribuir (horizontal/vertical) y voltear (horizontal/vertical) marcas seleccionadas.
  - `A.4 (ADR-0074)`: Borde, relleno y alineación (`/Q`) del cuadro de texto (`/FreeText`) + cierre E2E del escenario **S1**.
- **Fase B — Takeoff y Medición Presupuestaria (cierra con el escenario S2):**
  - Recortes/cutouts en mediciones de área y volumen; escalas múltiples por hoja (viewports `/VP`); subtotales por Subject/capa y costes unitarios; herramientas de medición en Tool Chest; exportación `.xlsx` (previa aprobación de dependencia o CSV con fórmulas); leyendas de marcas en el plano; Espacios (`/Spaces`); Quantity Link; cierre con escenario **S2**.
- **Fase C — Gestión Documental, Páginas y Lotes (cierra con el escenario S4):**
  - Reordenar páginas y arrastrar entre documentos; pestañas con varios documentos y asociación de archivos ("Abrir con") + recientes; etiquetas de página (`/PageLabels`), marcadores con edición y zoom a ventana; combinar PDFs, recortar páginas (`/CropBox`), encabezados/pies/numeración Bates y marca de agua (`system: true`); desaplanar marcas propias (Unflatten) y procesos por lotes; cierre con escenario **S4**.
- **Fase D — Rendimiento en Planos Grandes (cierra con el escenario S3):**
  - Benchmark reproducible E-size / ~100 MB + 5.000 marcas (medir antes de optimizar) y optimización / tiling condicional según métricas del benchmark; cierre con escenario **S3**.
- **Fase E — Comparación de Documentos y Sets con Enlaces (cierra con el escenario S5):**
  - Compare Documents (nubes automáticas de diferencias entre dos revisiones) y Document Sets con detección de enlaces entre hojas; cierre con escenario **S5**.
- **Fase F — Seguridad (PDF Cifrados), Redacción, OCR y Resto de Brechas:**
  - Apertura y guardado de PDFs cifrados con contraseña y permisos; redacción real destructiva (incluyendo búsqueda y redacción); OCR local; Caret, borrador de trazo, orden Z, Snapshot (`G`), imagen como marca (`I`), perfiles de interfaz, secuencias numeradas y Dynamic Fill (`J`).

### OUT EXPLÍCITO PERMANENTE
- Colaboración en la nube (Bluebeam Studio Projects / Sessions).
- Creación de PDF desde plugins de Microsoft Office o AutoCAD/Revit.

