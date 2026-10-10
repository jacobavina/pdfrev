# docs/SCOPE.md — Control de Alcance del Proyecto REA

> **Regla de oro:** Lo que no está en este documento **NO se implementa**. Añadir cualquier característica no contemplada aquí requiere un Architecture Decision Record (ADR) formal y la aprobación explícita del usuario.
> **Prohibición absoluta:** Nunca reabrir una fase cerrada para "adecuarla" a nuevas directrices.

---

## 1. Fase 1: Motor Base de Anotaciones y Shell CAD (CERRADA)

### IN (Entregado y Verificado)
- **Visualizador PDF de Alto Rendimiento:** Integración con PDF.js cargando el worker web dinámicamente vía URL de Vite (`pdf.worker.min.mjs?url`), con renderizado en canvas offscreen para evitar parpadeos.
- **Sistema de Coordenadas y Rotación Unificada:** Conversión matemática bidireccional entre puntos de pantalla, coordenadas normalizadas `[0..1]` y espacio de puntos PDF, integrando la rotación intrínseca del plano (`page.rotate`) y la rotación interactiva del usuario (`0°`, `90°`, `180°`, `270°`).
- **Hit-Testing Geométrico Riguroso:** Algoritmos matemáticos dedicados para los 14 tipos de marcas reconocidos (fórmulas elípticas, ray-casting en polígonos, distancia a polilíneas con Ramer-Douglas-Peucker para trazos libres, distancia a directrices y cajas envolventes de texto), sin retorno genérico `return true`.
- **Exportación Vectorial Auténtica:** Generador basado en `pdf-lib` que transcribe descriptores de marcas directamente al content stream de las páginas PDF (`cm`, `re`, `l`, `c`, `q`, `Q`), verificado mediante descompresión e inspección del content stream binario.
- **Persistencia Atómica Local (`.bbx.json`):** Formato versionado `1.1.0` con migrador de versiones anteriores, invocando comandos nativos de Rust en Tauri 2 (`write_bbx` con archivo temporal `.tmp`, `sync_all()` y `rename`; `read_bbx` con manejo seguro de `NotFound`).
- **Historial Command Robusto:** Gestor `HistoryManager` con pila de deshacer/rehacer con capacidad mínima forzada de 50 pasos.
- **Shell de la Aplicación:** Disposición CAD con TopBar, panel lateral colapsable de miniaturas (`ThumbnailsSidebar`), área central de visualización (`PdfViewer`) y tabla inferior de marcas (`MarkupsList`).

### OUT de Fase 1
- Edición por vértices individuales de polígonos o nubes.
- Selección múltiple y arrastre en bloque.
- Medición con calibración de escala real.

---

## 2. Fase 2: Herramientas Técnicas de Marcado y Manipulación (EN CURSO)

### IN (Alcance Aprobado de la Fase 2)
- **Bloque A: Herramientas de Marcado Avanzado y Manipulación Básica**
  - `P2-A.0`: Selección, umbral de movimiento de 4 px para descartar clics y temblores, traslación con clamp estricto al área de página `[0..1]` y reversión con `Ctrl+Z`.
  - `P2-A.1`: Nubes de revisión con parámetro `arcStep` persistido en la marca, curvatura exterior determinista por cálculo de área firmada, y herramienta `Cloud+` como grupo indivisible de nube y llamada vinculada.
  - `P2-A.2`: Selección múltiple mediante rectángulo elástico de Marquee con criterio estricto de intersección/cruce (Crossing), selección aditiva con `Shift` o `Ctrl`, y traslación conjunta de $K$ elementos seleccionados con un solo paso de historial.
  - `P2-A.3`: Callout / Nota con directriz inteligente y texto plano interactivo.
  - `P2-A.4`: Polilíneas abiertas y Flechas técnicas independientes.
  - `P2-A.5`: Resaltador técnico con modo de mezcla `multiply` y alineación ortogonal / snap.
  - `P2-A.6`: Sellos técnicos predefinidos basados en descriptores vectoriales limpios.
- **Bloque B: Tabla Técnica de Marcas (`MarkupsList`)**
  - Sincronización bidireccional inmediata, ordenación por columnas, filtrado por autor, estado y página, selección múltiple desde la tabla y borrado conjunto.
- **Bloque C: Edición Avanzada de Propiedades y Estilos**
  - Selector de estilos avanzados (grosores, colores, rellenos con opacidad independiente, líneas discontinuas), bloqueo de marcas contra edición y duplicación con offset.
- **Bloque D: Calibración y Medición Básica**
  - Herramienta de calibración de escala sobre distancia conocida del plano y cotas básicas lineales y de área.

### OUT EXPLÍCITO DE LA FASE 2 (Terminantemente Prohibido sin ADR y Aprobación)
1. **Adelanto de Bloques:** Prohibido implementar características de los Bloques B, C o D antes de cerrar por completo y auditar el Bloque A.
2. **Texto Enriquecido (Rich Text):** Prohibido el formateo por carácter (negrita/cursiva parcial, colores por palabra o etiquetas HTML/BBCode). Todo texto es texto plano (plain text).
3. **Takeoff y Estimación:** No se construyen motores de costeo, despiece ni fórmulas complejas de presupuesto (reservado para Fase 3).
4. **Comparación de Versiones y Document Sets:** Prohibida la superposición de planos (Overlay Pages) o sincronización de múltiples archivos (reservado para Fase 4).
5. **AcroForm con JavaScript:** Prohibida la ejecución de scripts o campos de formulario dinámicos evaluados con JS dentro de sellos.
6. **Escritura de Nuevos OCGs (Capas PDF Nativas):** No se escriben diccionarios de capas PDF en el archivo exportado (se preservan capas a nivel de modelo de marcas `.bbx.json`).
7. **Colaboración en la Nube / Conectividad Remota:** La arquitectura es estrictamente offline y local-first; no se implementan sockets, APIs remotas ni persistencia externa.

---

## 3. Fases Futuras (Planificación Estratégica)

### Fase 3: Takeoff, Estimaciones y Exportación de Datos
- Conteo automático de símbolos y marcas.
- Tablas de takeoff con asignación de materiales y costes unitarios.
- Exportación estructurada a Microsoft Excel (`.xlsx`) y CSV.

### Fase 4: Comparativa Avanzada y Gestión Documental
- Comparación diferencial visual de planos (resaltado en verde/rojo de discrepancias vectoriales).
- Vista dividida (Split View) sincronizada horizontal y vertical.
- Gestión de colecciones de planos (Sets) con control de revisiones.

### Fase 5: Rendimiento Extremo y Soporte de Gran Formato
- Tiling y virtualización de lienzo para planos complejos de ingeniería civil superiores a 100 MB.
- Aceleración por GPU mediante shaders WebGL / WebGPU para decenas de miles de trazos vectoriales concurrentes.
