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
- **Bloque C: MarkupsList Completa**
  - Ordenación y filtros avanzados por estado, autor, tipo y capa.
  - Columnas personalizadas con parser propio de lista blanca.
  - Gestión de estados con menú contextual interactivo.
  - Exportación de reportes estructurados con hipervínculos en PDF más hojas en Excel y CSV.
- **Bloque D: Capas Lógicas y Sellos Dinámicos**
  - Capas CAD lógicas con visibilidad persistida en el modelo `.bbx.json`.
  - Sellos dinámicos técnicos basados en descriptores vectoriales limpios (donde residen los sellos).

### OUT EXPLÍCITO DE LA FASE 2 (Terminantemente Prohibido sin ADR y Aprobación)
1. **Calibración y Acotación:** La calibración de escala y acotación lineal/área está terminantemente prohibida en Fase 2 (pertenece a la Fase 3).
2. **Adelanto de Bloques:** Prohibido implementar características de los Bloques B, C o D antes de cerrar por completo y auditar el Bloque A.
3. **Features no aprobadas en IN:** No se implementan polilíneas abiertas, flechas independientes, snap ortogonal, inspector contextual flotante de propiedades ni duplicación con offset paramétrico. Cualquier inclusión futura requerirá su respectivo ADR y aprobación explícita del usuario.
4. **Texto Enriquecido (Rich Text):** Prohibido el formateo por carácter (negrita/cursiva parcial, colores por palabra o etiquetas HTML/BBCode). Todo texto es texto plano (plain text).
5. **Takeoff y Estimación:** No se construyen motores de costeo, despiece ni fórmulas complejas de presupuesto (reservado para Fase 3).
6. **Comparación de Versiones y Document Sets:** Prohibida la superposición de planos (Overlay Pages) o sincronización de múltiples archivos (reservado para Fase 4).
7. **AcroForm con JavaScript:** Prohibida la ejecución de scripts o campos de formulario dinámicos evaluados con JS dentro de sellos.
8. **Escritura de Nuevos OCGs (Capas PDF Nativas):** No se escriben diccionarios de capas PDF en el archivo exportado (se preservan capas a nivel de modelo de marcas `.bbx.json`).
9. **Colaboración en la Nube / Conectividad Remota:** La arquitectura es estrictamente offline y local-first; no se implementan sockets, APIs remotas ni persistencia externa.

---

## 3. Fases Futuras (Planificación Vigente)

### Fase 3: Calibración, Acotación, Takeoff y Estimaciones
- Herramienta de calibración de escala sobre distancia conocida del plano.
- Acotación lineal, perimetral y de áreas en escala real.
- Conteo automático de símbolos y marcas.
- Tablas de takeoff con asignación de materiales y costes unitarios.
- Exportación estructurada a Microsoft Excel (`.xlsx`) y CSV.

### Fase 4: Comparativa Avanzada y Gestión Documental
- Comparación diferencial visual de planos (resaltado en verde/rojo de discrepancias vectoriales).
- Vista dividida (Split View) sincronizada horizontal y vertical.
- Gestión de colecciones de planos (Document Sets) con control de revisiones e hipervínculos.
