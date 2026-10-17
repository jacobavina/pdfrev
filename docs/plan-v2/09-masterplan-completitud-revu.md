# MASTERPLAN REA — Plan Maestro de Completitud Funcional frente a Bluebeam Revu (Fases A → F)

> **Documento:** Plan Maestro de Implementación (Fases A a F)  
> **Fecha:** 2026-10-16  
> **Base Verificada:** Commit `fb0f7b7` (master, 802 tests unitarios en 95 archivos, 36 E2E x3, 180 shipped en PARITY.md, 0 todo)  
> **Fuentes de Verdad:** `AGENTS.md`, `docs/plan-v2/06-matriz-capacidades-revu.md`, `docs/plan-v2/03-plan-por-fases.md` y `PARITY.md`.  
> **Exclusiones Aprobadas por Decisión:** Colaboración en la nube (Studio, `W`) y Crear PDF desde Office/CAD (`W`).

---

## 1. Auditoría de la Matriz (06-matriz-capacidades-revu.md) y Gaps Detectados

Al auditar fila por fila la matriz de capacidades de Revu contra el código fuente en `src/`, `PARITY.md` y las suites de pruebas, se detectaron **8 hallazgos y gaps** que quedan formalmente cubiertos en este plan:

1. **Rotación de vista (`View ▸ Rotate View 90°`) en `🟡` con prioridad `M` (§1.1, línea 23):**  
   `rotateClockwise` existe en `MenuBar.tsx` pero no tiene test automatizado ni fila en `PARITY.md`. Se incorpora en **Fase C (`C.5`)** junto con *Zoom a ventana*.
2. **Operaciones de página existentes sin fila en `PARITY.md` (§1.5, línea 102):**  
   Rotar, eliminar, insertar en blanco y extraer páginas tienen 11 tests en `pageOperations.test.ts` y 5 en `pageService.test.ts`, pero no estaban en `PARITY.md`. Se añaden a `PARITY.md` al implementar *Reordenar páginas* en **Fase C (`C.2`)**.
3. **Estados de revisión estándar (`/StateModel (Review)`) en ida y vuelta con múltiples transiciones (Escenario S1):**  
   Aunque `incrementalWriter.ts` y `annotationReader.ts` leen y escriben `/StateModel (Review)` con `/IRT`, falta cubrir la preservación del historial de transiciones externas y registrar su fila en `PARITY.md`. Se cierra en **Fase A (`A.1`)**.
4. **Presupuesto crítico del bundle principal (`785.40 kB / 800.00 kB`, margen 14.60 kB):**  
   `scripts/verify.mjs` impone un límite estricto de `800.00 kB`. En **Fase A (`A.0`)** se desacoplan las importaciones estáticas de `documentSaveService.ts` en `MenuBar.tsx` y `QuickAccessToolbar.tsx` que causaban advertencias en Vite, y toda nueva característica de gran peso entrará con `React.lazy` o `import()` dinámico.
5. **Hipervínculos desde las filas del Reporte PDF a la página de cada marca (`P3-E.3` / `P4-D.3`):**  
   Contemplado en `03-plan-por-fases.md`. Se incorpora en **Fase B (`B.5`)** en los informes de takeoff.
6. **Duplicidad de `Dynamic Fill` en la matriz:**  
   Figura en §1.4 (línea 96) y en §1.6 (línea 126). Se resuelve de manera unificada en **Fase F (`F.7`)**.
7. **Nubes automáticas de diferencias en el escenario S5 (`P6-A.2`):**  
   El escenario S5 exige que al comparar dos documentos las diferencias generen nubes de revisión automáticas rodeando los cambios; se detalla en **Fase E (`E.1`)**.
8. **Arquitectura para PDFs cifrados ante la limitación de `pdf-lib` (`P7-A`):**  
   `pdf-lib` no descifra ni cifra PDFs estándar con `/Encrypt`. En **Fase F (`F.1`)** se implementará el soporte de contraseñas y permisos (RC4/AES R2-R6) sobre los primitivos puros de `pkcs12Ciphers.ts` + WebCrypto o comando IPC en Rust.

---

## 2. Mapa General: Orden, Dependencias y Tamaño Estimado

```
Fase A: Revisión de Ingeniería (S1) [Tamaño M, 5 hitos]
  │
  ├──► Fase B: Takeoff y Costes (S2) [Tamaño L-XL, 7 hitos]
  │
  └──► Fase C: Documento y Páginas (S4) [Tamaño L-XL, 6 hitos]
         │
         ├──► Fase D: Planos Grandes y Rendimiento (S3) [Tamaño L, 4 hitos]
         │
         └──► Fase E: Comparación de Documentos y Sets (S5) [Tamaño L, 3 hitos]
                │
                └──► Fase F: Seguridad, OCR y Resto [Tamaño XL, 7 hitos]
```

| Fase | Nombre | Escenario de Cierre | Dependencia | Tamaño Estimado | Hitos / Commits | Aprobaciones Previas Requeridas |
|---|---|---|---|---|---|---|
| **Fase A** | Revisión de Ingeniería | **S1** | Estado actual (`ADR-0069`) | **M** (~5 hitos) | `A.0` a `A.4` (5 commits) | Ninguna dependencia nueva |
| **Fase B** | Medición y Takeoff Completo | **S2** | Fase A | **L–XL** (~7 hitos) | `B.1` a `B.7` (7 commits) | Aprobación de `exceljs` (MIT) bajo demanda (o generador propio / CSV con fórmulas) |
| **Fase C** | Documento, Pestañas y Páginas | **S4** | Fase A | **L–XL** (~6 hitos) | `C.1` a `C.6` (6 commits) | Ninguna dependencia nueva |
| **Fase D** | Rendimiento en Planos Grandes | **S3** | Fase C | **L** (~4 hitos) | `D.1` a `D.4` (4 commits) | Umbrales finales tras medir `BASELINE.md` en `D.1` |
| **Fase E** | Comparación de Documentos y Sets | **S5** | Fase C | **L** (~3 hitos) | `E.1` a `E.3` (3 commits) | Ninguna dependencia nueva |
| **Fase F** | Seguridad, OCR y Resto | Cierre total | Fases B, D, E | **XL** (~7 hitos) | `F.1` a `F.7` (7 commits) | En `F.3` (OCR): API nativa `Windows.Media.Ocr` en Rust (0 kB) vs `tesseract.js` |

---

## 3. Desglose Detallado por Fase

---

### FASE A — Revisión de Ingeniería (Cierra con el Escenario S1)

#### Decisión sobre Reordenar Páginas y Pestañas Multi-documento
- **Decisión:** Se programan en la **Fase C (cierre con S4)** y **NO en la Fase A**.
- **Justificación:** El escenario **S1** opera exclusivamente sobre **un solo plano** recibido; el escenario **S4** inicia explícitamente abriendo 3 PDFs en pestañas y reordenando hojas. Mantenerlos en Fase C evita refactorizar stores de documentos en Fase A y permite cerrar S1 de manera rápida y segura.

#### Hitos de la Fase A

| ID | Hito | Tam. | Dep. | Alcance Exacto y Capas Afectadas |
|---|---|---|---|---|
| **A.0** | **Higiene del bundle y enmienda de alcance (ADR-0070)** | **S** | — | Desacoplar imports estáticos de `documentSaveService.ts` en `MenuBar.tsx` y `QuickAccessToolbar.tsx` a imports dinámicos. Enmendar `docs/SCOPE.md` para cubrir las Fases A–F. |
| **A.1** | **Respuestas / hilos en marcas y estados de revisión en PDF (P3-E.1 + P3-E.2, ADR-0071)** | **M–L** | A.0 | **Modelo:** `replies?: MarkupReply[]` en `Markup` compatible con `.bbx.json`.<br>**Store:** Comandos deshacibles `addMarkupReply`, `updateMarkupReply`, `deleteMarkupReply`.<br>**PDF:** Escribir anotaciones `/Subtype /Text`, `/IRT <parentRef>`, `/RT /R`, `/T (autor)`, `/Contents (texto)`. Al leer, reconstruir el árbol de hilos cronológicos (incluso con `/IRT` anidados de Revu/Acrobat). Preservar transiciones `/StateModel (Review)`.<br>**UI:** Acción `Reply…` en menú contextual; árbol de hilos indentado en `MarkupsList`; exportación en CSV y reporte PDF. |
| **A.2** | **Ondulado de texto (squiggly / /Squiggly, P3-H.3, ADR-0072)** | **S–M** | A.0 | **Modelo y Geometría:** Tipo `squiggly` (atajo `Shift+U`, en cinta y menú). Selección sobre `TextLayer` reutilizando el motor de `highlightText`/`underline`/`strikeOut`. Dibuja onda sinusoidal en pantalla, `/AP` y aplanado.<br>**PDF:** `/Subtype /Squiggly` con `/QuadPoints` e ida y vuelta. Hit-testing en `coordinates.ts`. |
| **A.3** | **Alinear, distribuir y voltear marcas (P3-H.5, ADR-0073)** | **M** | A.0 | **Núcleo puro (`transformTools.ts`):** `alignMarkups` (6 alineaciones), `distributeMarkups` (horizontal/vertical, mín. 3 marcas) y `flipMarkups` (horizontal/vertical invirtiendo puntos y directrices respecto al centroide de la selección, respetando grupos y marcas bloqueadas).<br>**Store y UI:** Un único comando atómico en historial con undo. Acciones en menú contextual y cinta con tokens `--icon-*`. |
| **A.4** | **Borde, relleno y alineación del cuadro de texto + Cierre E2E de S1 (P3-H.2, ADR-0074)** | **S–M** | A.1–A.3 | **Cuadro de texto:** Verificar alineación (`/Q 0|1|2`), `strokeColor`, `strokeWidth` y `fillColor` en pantalla, `/AP` e ida y vuelta.<br>**E2E S1:** Prueba automatizada (3 pasadas consecutivas) del flujo S1 completo. |

#### Filas Nuevas para `PARITY.md` (Fase A)
1. `| **Respuestas e hilos de comentarios en marcas (/IRT /RT /R) con ida y vuelta en PDF y árbol en MarkupsList (ADR-0071)** | \`shipped\` | \`src/core/pdf/repliesInterop.test.ts\` | \`escribe respuestas como anotaciones /IRT /RT /R, reconstruye hilos encadenados de Revu/Acrobat y deshace en un paso\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Revu/Acrobat |`
2. `| **Estados de revisión estándar (/StateModel Review) con múltiples cambios e ida y vuelta en el PDF (ADR-0071)** | \`shipped\` | \`src/core/pdf/repliesInterop.test.ts\` | \`conserva el último estado /StateModel Review al guardar y reabrir entre REA y visores externos\` | PENDIENTE DE VERIFICAR por el usuario en Revu/Acrobat |`
3. `| **Ondulado de texto (Squiggly, Shift+U): selección sobre TextLayer, /Subtype /Squiggly con /QuadPoints y onda en /AP (ADR-0072)** | \`shipped\` | \`src/core/pdf/squigglyInterop.test.ts\` | \`crea subrayado ondulado /Squiggly con /QuadPoints y onda en pantalla y /AP, e importa /Squiggly ajeno\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Revu/Acrobat |`
4. `| **Alinear, distribuir y voltear marcas seleccionadas en un comando atómico deshacible (ADR-0073)** | \`shipped\` | \`src/core/markup/transformTools.test.ts\` | \`alinea, distribuye y voltea horizontal y verticalmente un conjunto de marcas y revierte con un solo undo\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
5. `| **Cuadro de texto (/FreeText) con borde, relleno y alineación (/Q) en pantalla, /AP e ida y vuelta (ADR-0074)** | \`shipped\` | \`src/core/pdf/freeTextBoxInterop.test.ts\` | \`el cuadro de texto dibuja y conserva su borde, color de relleno y alineación en pantalla y en el PDF\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Revu/Acrobat |`
6. `| **Escenario S1 completo: revisión de plano con marcas foráneas, respuestas, estados e ida y vuelta (ADR-0074)** | \`shipped\` | \`tests/e2e/pdf-viewer.spec.ts\` | \`Escenario S1 (ADR-0074): responde a una marca en MarkupsList, cambia estados, alinea marcas y verifica persistencia\` | PENDIENTE DE VERIFICAR por el usuario con un plano real en Revu/Acrobat |`

---

### FASE B — Medición y Takeoff (Cierra con el Escenario S2)

#### Hitos de la Fase B

| ID | Hito | Tam. | Dep. | Alcance Exacto y Capas Afectadas |
|---|---|---|---|---|
| **B.1** | **Recortes (cutouts) en mediciones de área y volumen (P4-B.2, ADR-0075)** | **L** | Fase A | `cutouts?: MarkupPoint[][]` en marcas de área y volumen. Modo `Add Cutout` (poligonal o rectangular): resta superficie de huecos ($\text{Área neta} = \text{Área exterior} - \sum \text{Huecos}$) y suma perímetro interior. Dibuja con regla par-impar (`evenodd`, operador `f*` en `/AP`). |
| **B.2** | **Escalas múltiples por hoja (Viewports, P4-A.3, ADR-0076)** | **M–L** | B.1 | Definir regiones rectangulares (`PageViewport`) persistidas en el array `/VP` estándar de la página PDF. Cada medición dentro de un viewport toma automáticamente su escala. Recalibrar recalcula en cascada las marcas dependientes. UI en panel `Measure`. |
| **B.3** | **Subtotales por Subject/capa y Costes con precios unitarios exactos (P4-C.2 + P4-C.3, ADR-0077)** | **M–L** | B.1 | Agrupación jerárquica sumando valores exactos antes de redondear. Catálogo de precios unitarios por `Subject` con aritmética entera en céntimos (sin `float`). Vistas de subtotales en `MarkupsList` y `MeasurementsPanel`. |
| **B.4** | **Herramientas de medición en el Tool Chest (P4-C.4, ADR-0078)** | **M** | B.3 | Guardar herramientas de medición en paletas del Tool Chest conservando `Subject`, capa, estilo, símbolo de conteo, profundidad y precio unitario. Modo dibujo y arrastre al canvas. |
| **B.5** | **Exportación a .xlsx con fórmulas vivas e hipervínculos en Reporte PDF (P4-D.2 + P4-D.3, ADR-0079)** | **M–L** | B.3 | Generación de `.xlsx` con celdas numéricas tipadas y fórmulas `SUM` y producto vivas (vía `exceljs` bajo demanda o generador propio). Extensión de lista blanca en Rust para `.xlsx`. Hipervínculos `/Link` en el Reporte PDF. |
| **B.6** | **Espacios (Spaces) y Leyendas de marcas en el plano (ADR-0080)** | **L** | B.3 | **Spaces:** Regiones con nombre que asignan automáticamente la columna `Space` a las marcas contenidas.<br>**Markup Legend:** Tabla vectorial estampada en el plano y en `/AP` con símbolos, `Subject`, unidad y totales actualizados. |
| **B.7** | **Quantity Link + Cierre E2E de S2 (ADR-0081)** | **M** | B.5, B.6 | Sincronización de totales de medición hacia celdas de un archivo `.xlsx`/`.csv` local al cambiar las mediciones. Prueba E2E completa del escenario S2 (3 pasadas consecutivas). |

#### Filas Nuevas para `PARITY.md` (Fase B)
1. `| **Medición de área y volumen con recortes (cutouts): resta huecos en pantalla, /AP y totales (ADR-0075)** | \`shipped\` | \`src/core/measurements/cutouts.test.ts\` | \`resta el área de los huecos interiores, suma el perímetro y dibuja el recorte con regla par-impar en /AP\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Revu |`
2. `| **Escalas múltiples por hoja (Viewports en /VP): cada región mide con su propia escala y recalcula al cambiar (ADR-0076)** | \`shipped\` | \`src/core/pdf/viewports.test.ts\` | \`una medición dentro de un viewport usa la escala de esa región y se guarda en el array /VP de la página\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Revu |`
3. `| **Subtotales por Subject, capa y página (suma antes de redondear) y precios unitarios en entero exacto (ADR-0077)** | \`shipped\` | \`src/core/measurements/takeoffCosts.test.ts\` | \`calcula subtotales por Subject y capa sumando antes de redondear y costes exactos en céntimos sin error de coma flotante\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
4. `| **Herramientas de medición en el Tool Chest con Subject, unidad, profundidad y precio unitario (ADR-0078)** | \`shipped\` | \`src/services/toolChestService.test.ts\` | \`guarda y reutiliza herramientas de medición en el Tool Chest conservando su Subject, escala de símbolo y profundidad\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
5. `| **Exportación a Excel (.xlsx) con cantidades numéricas, precios unitarios y fórmulas SUM vivas (ADR-0079)** | \`shipped\` | \`src/services/xlsxExport.test.ts\` | \`genera un archivo .xlsx válido con partidas por Subject y fórmulas SUM y producto verificadas en el XML de la hoja\` | PENDIENTE DE VERIFICAR por el usuario abriendo el .xlsx en Excel |`
6. `| **Espacios (Spaces) y Leyenda automática de marcas (Markup Legend) en el plano y en /AP (ADR-0080)** | \`shipped\` | \`src/core/markup/spacesAndLegend.test.ts\` | \`asigna automáticamente el Space a las marcas contenidas y dibuja la tabla de leyenda con cantidades por Subject en /AP\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Revu/Acrobat |`
7. `| **Quantity Link: sincronización de totales de medición por Subject hacia un libro .xlsx (ADR-0081)** | \`shipped\` | \`src/services/quantityLink.test.ts\` | \`actualiza las celdas vinculadas por Subject en un archivo .xlsx existente cuando cambian las mediciones del plano\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
8. `| **Escenario S2 completo: takeoff de planta con calibración, área con hueco, conteo, costes y exportación .xlsx (ADR-0081)** | \`shipped\` | \`tests/e2e/pdf-viewer.spec.ts\` | \`Escenario S2 (ADR-0081): calibra, mide área con recorte, cuenta puertas, calcula subtotales y exporta .xlsx\` | PENDIENTE DE VERIFICAR por el usuario con un plano real |`

---

### FASE C — Documento, Navegación y Páginas (Cierra con el Escenario S4)

#### Hitos de la Fase C

| ID | Hito | Tam. | Dep. | Alcance Exacto y Capas Afectadas |
|---|---|---|---|---|
| **C.1** | **Pestañas multi-documento (P5-B.2, ADR-0082)** | **L** | Fase A | `useDocumentTabsStore.ts`: gestiona múltiples sesiones simultáneas con sus propios bytes, marcas, historial de 50 pasos, calibraciones y estado sucio. Barra `DocumentBar` con conmutación instantánea y guardas de cierre. |
| **C.2** | **Reordenar páginas y arrastre en miniaturas (P5-C.1, ADR-0083)** | **M–L** | C.1 | `reorderPdfPages` y remapeo consistente de `pageIndex` en marcas, calibraciones y enlaces. Botones y drag & drop en `ThumbnailsSidebar`. Registro en `PARITY.md` de las operaciones de insertar, eliminar, rotar y extraer. |
| **C.3** | **Combinar PDFs, Desaplanar marcas (Unflatten) y Procesos por lotes (P5-C.3 + P5-C.4, ADR-0084)** | **L** | C.2 | `Combine PDFs`: une archivos remapeando páginas y marcas.<br>`Unflatten`: recupera marcas aplanadas a partir de metadatos marcados en el content stream.<br>`Batch`: ejecuta aplanado, exportación o numeración sobre múltiples archivos. |
| **C.4** | **Recortar páginas (CropBox), encabezados/pies y marca de agua con system:true (P5-C.2, ADR-0085)** | **M–L** | C.2 | Fijar `/CropBox` y `/TrimBox`. Estampado de encabezados, pies, numeración Bates y marca de agua con metadato `system: true` para identificarla y actualizarla sin tocar marcas de usuario. |
| **C.5** | **Etiquetas de página (PageLabels), Marcadores (Bookmarks) y Zoom a ventana / Rotar vista (P5-B.3 + P5-B.5, ADR-0086)** | **M** | C.1 | Árbol `/PageLabels` del PDF en miniaturas y barra de estado. Tests y paridad de `BookmarksPanel` (`/Outlines`). Herramienta `Zoom Window` (atajo `Z`) y test dedicado para `Rotate View 90°`. |
| **C.6** | **Abrir desde el Explorador ("Abrir con") y Archivos Recientes + Cierre E2E de S4 (P5-B.6, ADR-0087)** | **M** | C.1–C.5 | Comando Tauri para leer argumentos de línea de comandos (`args`) y registrar asociaciones `.pdf`. Menú `File ▸ Open Recent`. Prueba E2E completa del escenario S4 (3 pasadas consecutivas). |

#### Filas Nuevas para `PARITY.md` (Fase C)
1. `| **Pestañas multi-documento: abrir varios PDFs a la vez con marcas, historial y estado sucio independientes (ADR-0082)** | \`shipped\` | \`src/store/useDocumentTabsStore.test.ts\` | \`mantiene varios documentos en pestañas independientes con sus marcas, undo/redo y página activa sin mezclarlos\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
2. `| **Insertar, eliminar, rotar, extraer y reordenar páginas remapeando marcas, calibraciones y enlaces (ADR-0083)** | \`shipped\` | \`src/core/pages/pageOperations.test.ts\` | \`reordena páginas del PDF y remapea pageIndex de marcas y calibraciones conservando cada marca en su hoja\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
3. `| **Combinar varios PDFs, desaplanar marcas propias de REA (Unflatten) y procesos por lotes con informe (ADR-0084)** | \`shipped\` | \`src/core/pdf/combineAndUnflatten.test.ts\` | \`combina PDFs con sus marcas, aplana y recupera las marcas originales al desaplanar (unflatten)\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
4. `| **Recortar páginas (/CropBox), encabezados/pies con numeración y marca de agua con flag system:true (ADR-0085)** | \`shipped\` | \`src/core/pages/cropAndWatermark.test.ts\` | \`aplica recorte /CropBox, numeración de páginas y marca de agua identificada con system:true actualizable\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Revu/Acrobat |`
5. `| **Etiquetas de página (/PageLabels), marcadores (/Outlines), Zoom a ventana (Z) y rotación de vista (ADR-0086)** | \`shipped\` | \`src/components/NavigationAndLabels.test.tsx\` | \`lee y edita etiquetas de página y marcadores, encuadra una región con Zoom Window y rota la vista 90 grados\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
6. `| **Abrir PDF por argumentos del sistema ("Abrir con") y menú File ▸ Open Recent (ADR-0087)** | \`shipped\` | \`src/services/fileDialogService.test.ts\` | \`carga el PDF recibido por argumento de arranque en Tauri y gestiona la lista de archivos recientes\` | PENDIENTE DE VERIFICAR por el usuario desde el Explorador de Windows |`
7. `| **Escenario S4 completo: 3 PDFs en pestañas, reordenar páginas con marcas, numerar, combinar y aplanar (ADR-0087)** | \`shipped\` | \`tests/e2e/pdf-viewer.spec.ts\` | \`Escenario S4 (ADR-0087): abre 3 documentos en pestañas, reordena páginas conservando sus marcas, numera y combina\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`

---

### FASE D — Rendimiento en Planos Grandes (Cierra con el Escenario S3)

#### Hitos de la Fase D

| ID | Hito | Tam. | Dep. | Alcance Exacto y Capas Afectadas |
|---|---|---|---|---|
| **D.1** | **Generador de plano E-size (~100 MB) y Benchmark base (P5-A.1, ADR-0088)** | **M** | Fase C | Generar plano sintético E-size (`3600 × 2400 pt`, ~100 MB) con 5 000 marcas. Medir primer render, memoria pico, latencia de pan y guardado, registrando los números en `docs/perf/BASELINE.md`. |
| **D.2** | **Índice espacial y virtualización para 5 000 marcas (P5-A.4, ADR-0089)** | **M** | D.1 | Índice en grilla 2D por página para hit-testing y marquee en < 10 ms con 5 000 marcas; culling de marcas fuera de pantalla y virtualización en `MarkupsList`. |
| **D.3** | **Renderizado acotado al viewport visible a zoom máximo (P5-A.2, ADR-0090)** | **L** | D.1 | Renderizado acotado a la región visible con sobreexploración cuando las dimensiones escaladas superen el límite de canvas de WebView2 (`16384 px`), eliminando pantallas blancas. |
| **D.4** | **Guardado incremental en streaming + Cierre E2E de S3 (P5-A.3, ADR-0091)** | **M** | D.2, D.3 | Comando Rust `append_pdf_revision` que escribe solo el tramo nuevo sin clonar 100 MB por IPC. Cierre automatizado del escenario S3 (3 pasadas consecutivas). |

#### Filas Nuevas para `PARITY.md` (Fase D)
1. `| **Banco de pruebas de plano grande E-size (3600x2400 pt) y mediciones base en docs/perf/BASELINE.md (ADR-0088)** | \`shipped\` | \`src/core/perf/largeBlueprintBench.test.ts\` | \`mide tiempo de primer render, hit-testing con 5000 marcas y memoria de guardado sobre plano E-size sintético\` | No aplica (benchmarking automatizado con registro en BASELINE.md) |`
2. `| **Escalabilidad con 5 000 marcas: índice espacial, culling de viewport y virtualización sin degradación (ADR-0089)** | \`shipped\` | \`src/core/markup/spatialIndex.test.ts\` | \`ejecuta hit-testing y selección marquee sobre 5 000 marcas en menos de 10 ms mediante índice espacial\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
3. `| **Renderizado por región visible a zoom máximo en planos E-size sin desbordar el límite de canvas (ADR-0090)** | \`shipped\` | \`src/components/viewer/TiledHighZoom.test.tsx\` | \`en una hoja E-size a 600% de zoom renderiza la región visible sin superar el área máxima de canvas ni quedar en blanco\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
4. `| **Guardado incremental de memoria acotada por apéndice binario en Rust sin clonar el PDF en IPC (ADR-0091)** | \`shipped\` | \`src/services/pdfPersistenceService.test.ts\` | \`envía únicamente el tramo incremental al comando nativo sin convertir el PDF base completo a array JSON\` | PENDIENTE DE VERIFICAR por el usuario con un plano grande en ventana nativa |`

---

### FASE E — Comparación de Documentos y Sets (Cierra con el Escenario S5)

#### Hitos de la Fase E

| ID | Hito | Tam. | Dep. | Alcance Exacto y Capas Afectadas |
|---|---|---|---|---|
| **E.1** | **Compare Documents con nubes automáticas de diferencias (P6-A.2, ADR-0092)** | **L** | Fase C | Compara píxel a píxel dos revisiones alineadas, agrupa diferencias por componentes conexas y genera marcas `cloud` automáticas en la capa `"Comparison"` encerrando cada cambio. |
| **E.2** | **Sets de planos con índice y enlaces automáticos entre hojas (P6-C.1, ADR-0093)** | **L** | Fase C | Archivo de proyecto `.reas.json`. Extrae códigos de plano (`Sheet Number`) del cajetín y genera hiperenlaces `/Link` automáticos cuando el código de una lámina aparece citado en otra. |
| **E.3** | **Cierre E2E del Escenario S5 (ADR-0094)** | **S–M** | E.1, E.2 | Test E2E del flujo S5 completo: comparar rev. A y rev. B → verificar nubes automáticas en diferencias → exportar informe (3 pasadas consecutivas). |

#### Filas Nuevas para `PARITY.md` (Fase E)
1. `| **Compare Documents: detecta regiones cambiadas entre dos PDFs y genera nubes de revisión automáticas (ADR-0092)** | \`shipped\` | \`src/core/compare/compareDocuments.test.ts\` | \`detecta las regiones que cambiaron entre la revisión A y la revisión B y crea nubes de revisión en esas coordenadas\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa con dos revisiones reales |`
2. `| **Sets de planos (Document Sets): índice de láminas y generación automática de enlaces entre hojas (ADR-0093)** | \`shipped\` | \`src/core/sets/documentSets.test.ts\` | \`indexa las láminas de un Set por número de plano y crea enlaces /Link automáticos donde aparece su código en otras hojas\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
3. `| **Escenario S5 completo: comparar rev. A y rev. B, generar nubes automáticas y exportar informe (ADR-0094)** | \`shipped\` | \`tests/e2e/pdf-viewer.spec.ts\` | \`Escenario S5 (ADR-0094): compara dos revisiones de un plano, genera nubes automáticas en las diferencias y exporta el informe\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`

---

### FASE F — Seguridad, Redacción, OCR y Resto de Capacidades

#### Hitos de la Fase F

| ID | Hito | Tam. | Dep. | Alcance Exacto y Capas Afectadas |
|---|---|---|---|---|
| **F.1** | **Abrir y guardar PDFs cifrados con contraseña y permisos (P7-A, ADR-0095)** | **L** | Fase D | Soporte de `/Encrypt` (RC4 y AES R2–R6). Diálogo de contraseña al abrir, verificación de `/U` y `/O`, descifrado en memoria y preservación del cifrado al guardar incrementalmente. |
| **F.2** | **Redacción permanente y Search & Redact (P7-C, ADR-0096)** | **L** | F.1 | Herramienta de marcado de redacción (`/Redact`) y búsqueda y redacción (`Search & Redact`). `Apply Redactions` reescribe el content stream purgando físicamente los textos y trazos bajo la caja (con test de oro que extrae el texto y prueba su ausencia). |
| **F.3** | **OCR local sobre planos escaneados (P7-E, ADR-0097)** | **M–L** | Fase C | Generación de capa de texto invisible (`/Tr 3`) alineada geométricamente sobre planos escaneados para hacerlos buscables (`Ctrl+F`) y resaltables. |
| **F.4** | **Caret, Borrador de trazo e Imagen como marca (P3-H.2/3/4, ADR-0098)** | **M–L** | Fase A | `Caret` para insertar y reemplazar texto sobre `TextLayer`. `Eraser` para dividir o recortar trazos `freehand`. `Image` para insertar imágenes PNG/JPEG del usuario como sello. |
| **F.5** | **Orden Z (Bring to Front/Send to Back) e Instantánea (Snapshot, G) (ADR-0099)** | **M** | Fase A | Acciones de orden Z en marcas y en `/Annots` con undo. Herramienta `Snapshot` (atajo `G`) para copiar al portapapeles una región en alta resolución y pegarla como imagen. |
| **F.6** | **Secuencias numeradas de marcas y Perfiles de interfaz (ADR-0100)** | **M** | Fase B | Numeración incremental automática (`1, 2, 3…`) en marcas. Perfiles de interfaz (`Review`, `Takeoff`, `Field`, `Custom`) que conmutan paneles, columnas y cinta. |
| **F.7** | **Relleno dinámico de áreas (Dynamic Fill, J) (ADR-0101)** | **M–L** | Fase B | Detección automática por flood-fill del contorno cerrado de habitaciones/recintos con umbral de vanos para generar mediciones de área, perímetro o Espacios con un solo clic. |

#### Filas Nuevas para `PARITY.md` (Fase F)
1. `| **Abrir y guardar PDFs cifrados (/Encrypt RC4 y AES) con contraseña y preservación de cifrado (ADR-0095)** | \`shipped\` | \`src/core/pdf/pdfEncryption.test.ts\` | \`abre un PDF protegido con contraseña, edita marcas y vuelve a guardarlo cifrado verificando contraseña y permisos\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Acrobat/Revu |`
2. `| **Redacción real (/Redact) y Search & Redact: elimina el texto y gráficos subyacentes del content stream (ADR-0096)** | \`shipped\` | \`src/core/pdf/redaction.test.ts\` | \`TEST DE ORO: aplicar redacción elimina físicamente el texto del content stream y PDF.js ya no puede extraerlo\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Acrobat/Revu |`
3. `| **OCR local sobre páginas escaneadas: inyecta capa de texto invisible (/Tr 3) buscable y seleccionable (ADR-0097)** | \`shipped\` | \`src/core/pdf/ocrLayer.test.ts\` | \`inserta palabras reconocidas por OCR como texto invisible /Tr 3 en la página y permite buscarlas y resaltarlas\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa con un plano escaneado |`
4. `| **Caret (/Caret insertar y reemplazar texto), borrador de trazo libre e imagen/foto como marca (ADR-0098)** | \`shipped\` | \`src/core/markup/caretEraserImage.test.ts\` | \`crea marcas /Caret de inserción y reemplazo, divide trazos libres con el borrador e incrusta imágenes en /AP\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa y en Revu/Acrobat |`
5. `| **Orden Z (Bring to Front / Send to Back) en pantalla y en /Annots, e Instantánea (Snapshot, G) (ADR-0099)** | \`shipped\` | \`src/core/markup/zOrderAndSnapshot.test.ts\` | \`cambia el orden Z de las marcas en pantalla y en /Annots con undo atómico y captura una región con Snapshot\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
6. `| **Secuencias numeradas de marcas (1, 2, 3 / A, B, C) y perfiles de interfaz (Review, Takeoff, Custom) (ADR-0100)** | \`shipped\` | \`src/components/SequencesAndProfiles.test.tsx\` | \`incrementa automáticamente la secuencia al colocar marcas y cambia la disposición de paneles y columnas según el perfil\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`
7. `| **Relleno dinámico de áreas (Dynamic Fill, J): detecta el contorno encerrado y crea área, perímetro o Space (ADR-0101)** | \`shipped\` | \`src/core/measurements/dynamicFill.test.ts\` | \`detecta por flood-fill el polígono interior de un recinto con umbral de vanos y genera su medición de área\` | PENDIENTE DE VERIFICAR por el usuario en ventana nativa |`

---

## 4. Plan de Ejecución Inmediato

Al recibir la aprobación del usuario, el trabajo comenzará por la **Fase A (Revisión de Ingeniería — Escenario S1)**:

1. `A.0 (ADR-0070)`: Optimización de imports dinámicos en `MenuBar.tsx` y `QuickAccessToolbar.tsx` y enmienda de `docs/SCOPE.md`.
2. `A.1 (ADR-0071)`: Respuestas e hilos en marcas (`/IRT /RT /R`) y estados de revisión estándar en PDF.
3. `A.2 (ADR-0072)`: Ondulado de texto (`squiggly` / `/Squiggly`, `Shift+U`).
4. `A.3 (ADR-0073)`: Alinear, distribuir y voltear marcas.
5. `A.4 (ADR-0074)`: Borde, relleno y alineación del cuadro de texto + Test E2E del escenario S1 en 3 pasadas consecutivas.
