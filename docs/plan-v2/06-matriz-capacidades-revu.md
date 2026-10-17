# 06 — Matriz de capacidades objetivo, escenarios de aceptación y cuestionario

> **Aviso de fuente:** esta matriz se basa en el **conocimiento público general** del producto Revu (no en su
> código, binarios ni capturas: `AGENTS.md` §1–§2). Puede estar incompleta o desactualizada respecto a la versión que
> use el usuario. **Debe validarse con quien usa Revu a diario** (cuestionario §4). "Revu" y "Bluebeam" son marcas de
> terceros, usadas aquí solo de forma nominativa.
>
> **Prioridad:** **M** (must, imprescindible para el público objetivo) · **S** (should) · **C** (could) · **W** (won't
> por ahora). **Público:** **K** = construcción/takeoff · **I** = revisión de ingeniería.
> **Estado REA** (verificado el 2026-10-16 contra el código, los ADR 0014–0069, `PARITY.md` y las suites; ver §6):
> ✅ hecho · 🟡 parcial · ⬜ no existe. Cada ✅ cita su fila de PARITY.md o su test; sin cita no hay ✅.

---

## 1. Matriz de capacidades

### 1.1 Visualización y navegación

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Abrir PDF desde diálogo | ✅ ADR-0017 (5319ddd) · `src/services/fileDialogService.test.ts` (9 tests) y E2E de carga del fixture | — | M | K I |
| Abrir desde el Explorador ("Abrir con", argumentos), recientes | ⬜ (sin recientes de archivos; solo de herramientas en Tool Chest) | P5-B.6 | M | K I |
| Zoom, rotación de vista | 🟡 Zoom ✅ ADR-0019/0023 (28f3240/724c53e) · PARITY «Atajos de vista de Revu (Ctrl+9/0/8/4/5/3)» y «Control de zoom con doble clic en el plano»; rotación de vista implementada (View ▸ Rotate View 90°) sin test dedicado | P5-B.5 | M | K I |
| Mano, ajustar a ancho/página, zoom a ventana | 🟡 Pan ✅ ADR-0052 (4c6f951) · PARITY «Pan: arrastrar, Espacio mantenido y botón central»; ajustar a ancho/página ✅ ADR-0019 (28f3240) · PARITY «Vista continua, ajustar a página/ancho…»; zoom a ventana ⬜ | P5-B.5 | M | K I |
| Vista continua multipágina | ✅ ADR-0019 (28f3240) · PARITY «Vista continua, ajustar a página/ancho, Ctrl+rueda, cota (Shift+L), puntos de control y zoom con doble clic (ADR-0019/0020/0021)» | — | M | K I |
| Pestañas / varios documentos | ⬜ (un documento a la vez) | P5-B.2 | M | K I |
| Miniaturas | ✅ ADR-0016/0037 (d5a0fdf/665bdff) · `src/components/ThumbnailsSidebar.test.tsx` (2 tests) | — | M | K I |
| Marcadores (índice) | 🟡 Panel implementado (ADR-0017, 5319ddd) con el índice del PDF; sin test automatizado ni fila PARITY | P5-B.3 | S | I |
| Etiquetas de página | ⬜ (grep `PageLabel`: vacío) | P5-B.3 | S | K |
| Búsqueda de texto | ✅ ADR-0016 (d5a0fdf) · `src/core/search/textSearch.test.ts` (8) y `src/components/PdfViewerSearch.test.tsx` (2) | — | M | K I |
| Planos grandes (E-size, 100 MB) con fluidez | ⬜ sin medir (el spike del motor evaluó un corpus de 1,001 PDFs, ADR-0010; no hay benchmark de E-size/100 MB) | P5-A | M | K I |
| Vista dividida sincronizada | ✅ ADR-0049 (08c5322) + ADR-0054 (b5d6f79) · PARITY «Vista lado a lado (Split View)…», «Sync de la vista lado a lado…» y «Sincronización en ambos sentidos…» | — | S | I |
| Instantánea (snapshot) | ⬜ | P5-B.7 | C | I |
| Panel de capas (OCG) | ✅ ADR-0024 (444000d) + ADR-0046 (2358596) · PARITY «Capas del PDF (/OCG) leídas al abrir y visibilidad en el panel Layers», «Capas lógicas OCG…», «Capas del plano conservadas…» y «Capa de anotaciones ajenas leída de su /OC» | — | M | K I |

### 1.2 Herramientas de marcado

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Rectángulo, elipse, línea, polígono | ✅ · PARITY «Herramientas geométricas base (círculo, polígono, escape)» + E2E `Sub-entregable 0.2` | — | M | K I |
| Polilínea abierta | ✅ ADR-0014 (bc7ddb6) · PARITY «Herramientas Revu y portapapeles (polyLine, underline, strikeOut, /LE, bloqueo, portapapeles)» | — | M | K I |
| Flecha / línea con extremos | ✅ ADR-0014 (bc7ddb6) + ADR-0018 (f0abc85) · PARITY «Flechas y tipos de línea…(ADR-0018)» y «Extremos y patrón de línea en el PDF (/AP, /LE, /BS) con ida y vuelta» | — | M | I |
| Nube de revisión (+ Cloud+) | ✅ ADR-0021/0039/0041/0069 · PARITY «Nubes de revisión con arcStep persistido…», «Cloud+ como grupo indivisible…», «Nube y Cloud+ de forma libre…», «Nube como la de Revu…», «Cloud+ con directriz sin flecha…» y «Tiradores de Cloud+…» | — | M | I |
| Callout | ✅ ADR-0042/0067 · PARITY «Callout / Nota técnica con directriz conectada», «Callout de Revu/Foxit…», «Callout con directriz horizontal…», «Callout con dos clics…» | — | M | I |
| Cuadro de texto con borde/relleno | 🟡 Texto ✅ ADR-0061 (314e56f) · PARITY «Autosize Text de Revu…»; borde y relleno se dibujan en pantalla y /AP (`src/core/markup/render.ts`: rect con fill y stroke), pero sin test dedicado | P3-H.2 | M | I |
| Nota adhesiva | ✅ · PARITY «Nota adhesiva técnica (`stickyNote`)» | — | S | I |
| Resaltador vectorial / de texto | ✅ · PARITY «Resaltador vectorial (`highlightVector`)» y «Resaltado de texto (`highlightText` con TextLayer)» | — | M | I |
| Subrayado, tachado, ondulado de texto | 🟡 Subrayado y tachado ✅ ADR-0014 (bc7ddb6) · PARITY «Herramientas Revu y portapapeles…»; ondulado ⬜ (grep `squiggly`: vacío) | P3-H.3 | M | I |
| Insertar/reemplazar texto (caret) | ⬜ (grep `caret` en src: vacío) | P3-H.3 | C | I |
| Lápiz (mano alzada) | ✅ (`freehand`) · PARITY «Atajos de teclado de Revu (P, …) (ADR-0052)» y hit-testing por tipo en `src/utils/coordinates.test.ts` | — | S | I |
| Borrador de trazo | ⬜ | P3-H.2 | C | I |
| Imagen / foto como marca | ⬜ (los sellos son dibujos vectoriales propios, no imágenes) | P3-H.4 | S | K I |
| Sellos (estáticos y dinámicos) | ✅ ADR-0026 (444000d) + ADR-0040 (330d88a) + ADR-0045 (b03a318) · PARITY «Sellos en el PDF (/Stamp con /Name estándar)…», «Sellos de Revu…», «Sellos de Foxit…», «Texto dinámico de los sellos…» y «Selector de sellos por secciones…» | — | M | I |
| Hipervínculo | ✅ ADR-0027 (46a9c3d) · PARITY «Hyperlink, File Attachment y campos de formulario desde Tools (ADR-0027)» y «Enlaces propios del PDF navegables con un clic» | — | S | I |
| Copiar/pegar/duplicar (también entre páginas) | ✅ ADR-0014 (bc7ddb6) · `src/store/useMarkupStore.test.ts` (copySelectedMarkups, pasteMarkups con nuevo groupId, duplicateSelectedMarkups) + PARITY «Herramientas Revu y portapapeles…» | — | M | K I |
| Alinear/distribuir, voltear/rotar marca | 🟡 Rotar ✅ ADR-0039 (330d88a) · PARITY «Tiradores de Revu: vértices pequeños, escalar por las esquinas y rotar»; alinear/distribuir/voltear ⬜ | P3-H.5 | S | I |
| Bloquear marca | ✅ ADR-0014 (bc7ddb6) · PARITY «Herramientas Revu y portapapeles…» (test `marcas bloqueadas quedan protegidas contra borrado, movimiento y actualización de propiedades`) | — | S | I |
| Orden Z (traer/enviar al fondo) | ⬜ | P3-H.5 | C | I |
| Mover / transformar / multiselección (marquee) | ✅ · PARITY «Move y Transform con umbral 4px…» y «Multiselección con Marquee…» | — | M | K I |
| Edición por vértices | ✅ ADR-0021 (28f3240) + ADR-0069 (f1d1d07) · PARITY «Puntos de control: cambiar la forma de la nube y demás marcas (deshacible)», «Tiradores de Cloud+…» y su E2E | — | S | K |
| Inspector de propiedades | ✅ P2-C.6 (e6a7b8a) · PARITY «P2-C.6: Inspector de propiedades de marca (Bloque C, D-3)» | — | M | K I |
| Tool Chest (paletas, recientes, arrastrar) | ✅ · PARITY «Tool Chest: Paletas persistidas en IndexedDB y drag & drop (Bloque B)» | — | M | K I |
| Deshacer/rehacer (50 pasos) | ✅ · PARITY «Historial Command con tope estricto de 50 pasos (undo/redo)» | — | M | K I |

### 1.3 Lista de marcas y revisión

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Lista de marcas, selección bidireccional | ✅ ADR-0060 · PARITY «Tabla técnica `MarkupsList` con sincronización bidireccional» y «Markups List de Revu: abre cerrada…» | — | M | K I |
| Filtrar y ordenar | ✅ (C.1) · PARITY «P2-C.1: Filtrado multifactor y ordenación estable con benchmark < 10ms (Bloque C)» | — | M | K I |
| Estados de revisión (menú contextual) | ✅ P2-C.2 (d310a87) · PARITY «P2-C.2: Menú contextual de estados técnicos con comando de historial (Bloque C)» | — | M | I |
| Respuestas / hilos | ⬜ (grep `inReplyTo|replyTo|thread` en src: vacío) | P3-E.2 | M | I |
| Columnas personalizadas | ✅ P2-C.3 (fbbb4d9, 2937fc3, 8109a6f; persistencia 91c474b/bf7be61) · PARITY «P2-C.3: Parser de columnas personalizadas sin eval y persistencia en .bbx.json (Bloque C)», «Columnas de Revu en la lista de marcas…» y «Grupos por Subject y texto de cada columna» | — | M | K |
| Resumen de marcas (PDF/CSV) | ✅ P2-C.4 (e6a7b8a) · PARITY «P2-C.4: Exportación estructurada a CSV con BOM y Reporte Resumen PDF (Bloque C)» | — | M | I |
| Anotaciones foráneas (importar PDFs de otros) | ✅ ADR-0013 (adc9ff1) + ADR-0053 (c1f9efb) + ADR-0055 (b65adb3) · PARITY «Cotas de Revu/Acrobat (/Line con /LL) importadas como cota», «Mediciones hechas en Acrobat/Revu se abren…», «Distancias de Acrobat con /LL se importan…», «Callout /FreeTextCallout y sellos /Stamp de otras aplicaciones…», «Capa de anotaciones ajenas leída de su /OC» e «Importar y rellenar formularios AcroForm…» | — | **M** | K I |
| Guardar las marcas **dentro** del PDF (editables en Revu/Acrobat) | ✅ ADR-0013 (adc9ff1) · PARITY «Persistencia incremental en PDF con anotaciones estándar ISO 32000-1 y /AP», «Ida y vuelta sin pérdidas…», «Nube visible en Revu/Acrobat…», «Sellos en el PDF…», «Las mediciones nuevas se guardan como /Polygon…», «Callout estándar en el PDF…» y «Count guardado como /Polygon /PolygonCount…» (verificación visual en Revu/Acrobat pendiente del usuario) | — | **M** | K I |

### 1.4 Medición y takeoff

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Calibración de escala | ✅ ADR-0015 (c622016) + ADR-0025 (444000d) + ADR-0031 (4b57d21) · PARITY «Escala de página guardada en el PDF (/VP /Measure)…», «Escalas de Revu/Acrobat leídas al abrir», «Calibrate por dos puntos…» y «Calibrar recalcula las mediciones existentes…» | — | **M** | K |
| Escalas múltiples por hoja (viewports) | 🟡 Calibración por página ✅ (ADR-0015); varias escalas por hoja (viewports) ⬜ | P4-A.3 | M | K |
| Longitud / polilínea | ✅ ADR-0015 (c622016) · PARITY «Medición de área por polígono con perímetro…», «Perimeter (Shift+Alt+P)…», «Distancia en tres pasos como Acrobat…» y «Medir con clic-clic…» | — | **M** | K |
| Perímetro y área (con recortes) | 🟡 Perímetro y área ✅ ADR-0015/0029 (c622016/eec83fa) · PARITY «Medición de área por polígono con perímetro…» y «Perimeter (Shift+Alt+P)…»; recortes (cutouts) ⬜ | P4-B.2 | **M** | K |
| Conteo por símbolo/Subject | ✅ ADR-0015 (c622016) + ADR-0059 (72aae8c) + ADR-0063 (84d9381) · PARITY «Count de Revu: símbolos…», «Count guardado como /Polygon /PolygonCount…» y «Count: cada símbolo con su tirador…» | — | **M** | K |
| Ángulo, radio, diámetro | ✅ ADR-0029 (eec83fa) + ADR-0051 (784e12f) · PARITY «Angle (Shift+Alt+G)…», «Radius (Shift+Alt+R) y Diameter (Shift+Alt+D)» y «Volumen, ángulo, conteo, radio y diámetro con las claves de Revu (ADR-0051)» | — | S | K |
| Volumen / profundidad | ✅ ADR-0029 (eec83fa) · PARITY «Volume (Shift+Alt+V)…» | — | S | K |
| Acotación con flechas | ✅ ADR-0020 (28f3240) + ADR-0032/0033 (76347a7/7cc2c09) · PARITY «Cota en el PDF (/Line con /LL, /IT /LineDimension, texto en /AP)…», «Flechas al estilo de Acrobat…» y «Distance como en Acrobat…» | — | S | K I |
| Snap (extremos, ortogonal) | ✅ ADR-0025 (444000d) + ADR-0031 (4b57d21) + ADR-0047/0048 (7004807/cec5d64) · PARITY «Snap to drawing…», «Trazo recto con Shift…» y «Shift a 45°…» | — | S | K |
| Subtotales por Subject/capa/página | 🟡 Totales por tipo, página y documento ✅ ADR-0015 (c622016) · PARITY «Panel de mediciones: totales por tipo y unidad, perímetro, página/documento»; desglose por Subject/capa ⬜ | P4-C.2 | **M** | K |
| Precios unitarios y costes | ⬜ | P4-C.3 | S | K |
| Herramientas de medición en Tool Chest | ⬜ (el Tool Chest guarda paletas y recientes de marcas, no de mediciones) | P4-C.4 | M | K |
| Exportar a Excel (.xlsx) | ⬜ (el único `xlsx` del repo es un MIME en `src/services/linkService.ts:138`; no hay generador; exportService solo hace CSV y PDF) | P4-D.2 | **M** | K |
| Exportar a CSV / informe PDF | ✅ P2-C.4 (e6a7b8a) · PARITY «P2-C.4: Exportación estructurada a CSV con BOM y Reporte Resumen PDF (Bloque C)» | — | M | K |
| Relleno dinámico (Dynamic Fill) | ⬜ | — | C | K |

### 1.5 Documento y páginas

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Insertar/eliminar/reordenar/rotar/extraer páginas | 🟡 Insertar/eliminar/rotar/extraer ✅ ADR-0016 (d5a0fdf) · `src/core/pages/pageOperations.test.ts` (11 tests); reordenar ⬜ (`pageOperations.ts` elimina pero no mueve) | P5-C.1 | M | K I |
| Recortar páginas | ⬜ (el CropBox solo se usa para coordenadas, no para recortar) | P5-C.2 | S | K |
| Encabezados, pies, numeración, marca de agua | ⬜ (grep `watermark`: vacío) | P5-C.2 | S | I |
| Combinar PDFs | ⬜ (grep `mergePdf`: vacío) | P5-C.3 | M | K I |
| Aplanar marcas | ✅ (export aplanado) · PARITY «Exportación vectorial PDF con inspección de content stream» + E2E `Sub-entregable 0.3 / 0.4` | — | M | I |
| "Desaplanar" marcas propias de REA | ⬜ | P5-C.3 | S | I |
| Procesos por lotes (enlaces, hojas de reemplazo, firmar, aplanar, resumen) | ⬜ (solo borrado múltiple de marcas) | P5-C.4 / P6-C.1 | S | K I |
| OCR | ⬜ | P7-E | S | K |
| Comparar documentos | ⬜ (Overlay Pages compara revisiones, no es comparación de documentos) | P6-A.2 | M | I |
| Superponer páginas (overlay) | ✅ ADR-0038 (435887b) + ADR-0050 (598177b) · PARITY «Overlay Pages: comparar revisiones con colores…», «Overlay Pages en la app…» y «Overlay Pages: alinear por 2 o 3 pares de puntos…» | — | M | I |
| Sets de planos, enlaces entre hojas | ⬜ | P6-C.1 | S | K I |
| Abrir y guardar PDFs cifrados, permisos | ⬜ (los PDF cifrados se rechazan explícitamente: «password-protected or encrypted» en `src/services/fileDialogService.ts`) | P7-A | **M** | K I |
| Formularios (rellenar y crear, sin JavaScript) | ✅ ADR-0027 (46a9c3d) + ADR-0055 (b65adb3) · PARITY «Campos AcroForm reales…», «Ida y vuelta de formularios…», «Botones de opción agrupados…» e «Importar y rellenar formularios AcroForm…» | — | S | I |
| Firmas digitales (firmar, verificar, preservar) | ✅ ADR-0056 (80d7ffe) + ADR-0058 (29ec422) · PARITY «Crear certificado digital autofirmado PKCS#12…», «Firmar campos de firma…», «Volver a guardar un PDF firmado sin romper la firma…» y filas de .pfx/KDF/cifrados | — | S | I |
| Redacción real (incl. buscar y redactar) | ⬜ | P7-C | S | I |
| Colaboración en la nube (Studio) | ⬜ | — | W | K I |
| Crear PDF desde Office/CAD | ⬜ | — | W | K I |

### 1.6 Funciones propias de Revu añadidas el 2026-10-11 (conocimiento público, **a validar por el usuario**)

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Leyendas de marcas en el plano (tabla automática de símbolos y cantidades) | ⬜ | Fase 4 | S | K |
| Espacios (regiones con nombre que agrupan marcas y medidas) | ⬜ | Fase 4 | S | K |
| Relleno dinámico de áreas (Dynamic Fill) | ⬜ | Fase 4 | C | K |
| Vínculo de cantidades a hoja de cálculo (Quantity Link) | ⬜ | Fase 4 | S | K |
| Secuencias numeradas de marcas | ⬜ | Fase 5 | C | I |
| Perfiles de interfaz (paneles y barras por tarea) | ⬜ | Fase 5 | C | K I |

> **Cambio 2026-10-11:** cifrado, formularios, firmas, redacción y OCR pasan de W/C a planificados en Fase 7 por el
> objetivo "funciones de Revu con la completitud de pdfcraft" (`07`).

## 2. Nota sobre la columna "Prio." de Interoperabilidad

Las dos filas en **negrita** de §1.3 (importar anotaciones ajenas y guardar dentro del PDF) son **M** para ambos
públicos porque sin ellas ningún otro valor se materializa en un flujo real. Por eso la Fase 3 va antes.

## 3. Escenarios de aceptación de extremo a extremo (criterio de "terminado" a nivel producto)

Cada escenario es una prueba E2E (automatizada donde sea posible) **más** una ejecución del usuario con un plano
real. Un escenario "pasa" cuando el informe del usuario lo confirma.

**S1 — Revisión de plano de ingeniería (Fase 3).** Abrir un plano recibido con anotaciones de otra persona →
las ve todas (propias y foráneas), intactas → añade nube + callout + resaltado de texto → cambia el estado de dos
marcas y responde a un comentario → Guardar (Ctrl+S) → el archivo se abre en **Revu y Acrobat** con las marcas
visibles y editables, estados y respuestas en su lista → mueve una marca allí y guarda → REA lo reabre sin pérdidas
(`arcStep`, grupo, campos).

**S2 — Takeoff de una planta (Fase 4).** Abrir plano → calibrar sobre una cota conocida → medir áreas de
habitaciones con huecos → medir longitudes de muros → contar puertas por tipo (Subject) → tabla con subtotales por
Subject y capa → asignar precios unitarios → exportar `.xlsx` con totales con fórmula → coincide con la medición
manual del usuario dentro de la tolerancia acordada → el PDF guardado conserva las mediciones al abrirlo en Revu
(`/Measure`, H-11).

**S3 — Plano grande (Fase 5).** Abrir un plano de ≈100 MB E-size → primer render dentro del umbral acordado →
zoom al máximo sin errores de canvas → pan fluido → 5 000 marcas sin degradación notable → guardar sin sobrepasar
memoria.

**S4 — Hoja de un set (Fase 5/6).** Abrir 3 PDFs en pestañas → insertar/reordenar páginas → las marcas siguen en la
página correcta tras reordenar → numeración de páginas → combinar y aplanar → exportar.

**S5 — Revisión de versiones (Fase 6).** Superponer rev. A y rev. B de una hoja → ver diferencias → generar nubes
automáticas en las regiones cambiadas → exportar el informe.

## 4. Cuestionario para el usuario (calibra las prioridades)

Responder en `docs/plan-v2/` (nuevo archivo `07-respuestas-usuario.md`) o en el chat:

1. ¿Qué versión de Revu y de Acrobat usas? ¿Sistema operativo y resolución habitual?
2. De la matriz §1, ¿qué 10 funciones usas **a diario** y cuáles nunca?
3. ¿Cuál es el plano más grande que abres (tamaño en MB, páginas, formato de hoja)? ¿Qué es "lento" para ti?
4. En takeoff: ¿qué unidades usas (métrico, pies-pulgadas)? ¿Mides con escala única o varias por hoja?
5. ¿Qué entregables de takeoff necesitas (Excel con qué columnas, informe PDF, otro)?
6. ¿Trabajas con planos **firmados** o cifrados? ¿Con qué frecuencia?
7. ¿Compartes PDFs anotados con otras personas que usan Revu/Acrobat? ¿Qué debe verse idéntico sí o sí?
8. ¿Necesitas que varias personas editen el mismo plano (flujo de turnos) o solo tú?
9. ¿El nombre/marca "REA" y la extensión `.bbx.json` te importan de cara a distribución?
10. ¿Qué es lo primero que esperas poder hacer con REA "en serio" y para cuándo?

## 5. Cómo se usa esta matriz

- Antes de cada fase, revisar filas M/S de esa fase con el usuario; mover prioridades según el cuestionario.
- Al cerrar un hito, marcar ✅ y citar la fila de `PARITY.md` que lo prueba.
- Nuevas ideas: añadir fila aquí **primero**; entra al plan solo con prioridad M/S, ADR y aprobación.

## 6. Estado verificado el 2026-10-16

**Método:** cada fila se contrastó contra el código de `src/` (greps listados abajo), los ADR 0014–0069 de
`docs/DECISIONS/`, el historial de git (ADR → commit), `PARITY.md` (192 filas, 180 `shipped` + el hito ADR-0069) y
las suites (802 unitarios en 95 archivos, 36 E2E en 3 pasadas verdes, 13 cargo). Regla aplicada: una fila solo pasa
a ✅ si su fila de PARITY o su test existe y pasa; si la capacidad está en el código sin prueba automatizada, queda
🟡. Las filas que seguían siendo ciertas tal cual no se tocaron (se verificaron y se listan en §6.3).

### 6.1 Filas cambiadas (antes → después) y evidencia

| Fila (§, capacidad) | Antes | Después | Evidencia |
|---|---|---|---|
| 1.1 Abrir PDF desde diálogo | ✅ sin cita | ✅ con cita | `src/services/fileDialogService.ts` (`openPdfDialog` vía plugin-dialog, `loadPdfData`); 9 tests en `fileDialogService.test.ts`; E2E carga el fixture en `Verifica que el PDF renderiza pixels reales…` |
| 1.1 Zoom, rotación de vista | ✅ | 🟡 | Zoom con tests (PARITY «Atajos de vista de Revu (Ctrl+9/0/8/4/5/3)» y «Control de zoom con doble clic en el plano»); rotación de vista existe en `MenuBar.tsx` («Rotate View 90°», `rotateClockwise`) pero ningún test la cita (grep `Rotate View|rotateClockwise` en tests: vacío) |
| 1.1 Mano, ajustar, zoom a ventana | 🟡 (zoom/rotación) | 🟡 nota nueva | Pan ✅ PARITY «Pan: arrastrar, Espacio mantenido y botón central» (ADR-0052); ajustar ✅ PARITY «Vista continua, ajustar a página/ancho…» (ADR-0019); zoom a ventana ⬜ (grep `Fit Window`: vacío) |
| 1.1 Vista continua multipágina | ⬜ | ✅ | ADR-0019, commit 28f3240; PARITY «Vista continua, ajustar a página/ancho, Ctrl+rueda, cota (Shift+L), puntos de control y zoom con doble clic (ADR-0019/0020/0021)»; E2E ok 19 en las 3 pasadas |
| 1.1 Miniaturas | ✅ sin cita | ✅ con cita | `src/components/ThumbnailsSidebar.test.tsx` (2 tests: cabecera y botones contextuales); operaciones de página ADR-0016 (`pageService.test.ts`) |
| 1.1 Marcadores (índice) | ⬜ | 🟡 | `LeftDock.tsx` → `BookmarksPanel` con `pdfDoc.getOutline()` (ADR-0017, 5319ddd); grep `bookmark` en tests y PARITY: vacío → sin prueba |
| 1.1 Búsqueda de texto | ⬜ | ✅ | ADR-0016, commit d5a0fdf; `src/core/search/textSearch.test.ts` (8 tests), `src/components/PdfViewerSearch.test.tsx` (2), `src/components/SearchBar.test.tsx` (5) |
| 1.1 Planos grandes | ⬜ sin medir | ⬜ sin medir (nota) | Nota añadida: el spike P3-A.1 evaluó un corpus de 1,001 PDFs (ADR-0010) pero no hay benchmark de E-size/100 MB |
| 1.1 Vista dividida sincronizada | ⬜ | ✅ | ADR-0049 (08c5322) y ADR-0054 (b5d6f79); PARITY «Vista lado a lado (Split View)…», «Sync de la vista lado a lado…», «Sincronización en ambos sentidos…» |
| 1.1 Panel de capas (OCG) | ⬜ | ✅ | ADR-0024 (444000d) y ADR-0046 (2358596); PARITY «Capas del PDF (/OCG) leídas al abrir…» (`pdfLayers.test.ts`), «Capas lógicas OCG…», «Capas del plano conservadas…», «Capa de anotaciones ajenas leída de su /OC» |
| 1.2 Rectángulo, elipse, línea, polígono | ✅ sin cita | ✅ con cita | PARITY «Herramientas geométricas base (círculo, polígono, escape)» + E2E `Sub-entregable 0.2` |
| 1.2 Polilínea abierta | ⬜ | ✅ | ADR-0014, commit bc7ddb6 (`P3-RevuTools`); PARITY «Herramientas Revu y portapapeles (polyLine, underline, strikeOut, /LE, bloqueo, portapapeles)» |
| 1.2 Flecha / línea con extremos | ⬜ | ✅ | ADR-0014 (bc7ddb6) y ADR-0018 (f0abc85); PARITY «Flechas y tipos de línea…(ADR-0018)» (E2E ok 18) y «Extremos y patrón de línea en el PDF (/AP, /LE, /BS) con ida y vuelta» (`lineStylesInterop.test.ts`) |
| 1.2 Nube (+Cloud+) | ✅ sin cita | ✅ con cita | PARITY «Nubes de revisión con arcStep persistido…», «Cloud+ como grupo indivisible…», «Nube y Cloud+ de forma libre…», «Nube como la de Revu…», «Cloud+ con directriz sin flecha…», «Tiradores de Cloud+…» (ADR-0069) |
| 1.2 Callout | ✅ sin cita | ✅ con cita | PARITY «Callout / Nota técnica con directriz conectada», «Callout de Revu/Foxit…», «Callout con directriz horizontal…», «Callout con dos clics…» |
| 1.2 Cuadro de texto con borde/relleno | 🟡 (texto; verificar borde) | 🟡 nota verificada | Texto ✅ (ADR-0061, PARITY «Autosize Text de Revu…»); borde y relleno: `render.ts` `case 'text'` dibuja `rect` con `fill: style.fillColor` y `stroke: style.strokeColor` — dibujado pero sin test dedicado (grep «cuadro de texto» en tests: vacío) |
| 1.2 Nota adhesiva | ✅ sin cita | ✅ con cita | PARITY «Nota adhesiva técnica (`stickyNote`)» (E2E ok 9) |
| 1.2 Resaltador vectorial/de texto | ✅ sin cita | ✅ con cita | PARITY «Resaltador vectorial (`highlightVector`)» y «Resaltado de texto (`highlightText` con TextLayer)» (E2E ok 10 y 11) |
| 1.2 Subrayado, tachado, ondulado | ⬜ | 🟡 | Subrayado/tachado ✅ ADR-0014 (bc7ddb6, /QuadPoints) · PARITY «Herramientas Revu y portapapeles…»; ondulado ⬜ (grep `squiggly|ondulad`: vacío) |
| 1.2 Lápiz | ✅ sin cita | ✅ con cita | PARITY «Atajos de teclado de Revu (P, …) (ADR-0052)» activa `freehand`; hit-testing por tipo en `coordinates.test.ts` |
| 1.2 Sellos | ⬜ | ✅ | ADR-0026 (444000d), ADR-0040 (330d88a) y ADR-0045 (b03a318); PARITY «Sellos en el PDF (/Stamp con /Name estándar)…», «Sellos de Revu…», «Sellos de Foxit…», «Texto dinámico de los sellos…», «Selector de sellos por secciones…»; E2E ok 31 |
| 1.2 Hipervínculo | ⬜ | ✅ | ADR-0027 (46a9c3d); PARITY «Hyperlink, File Attachment y campos de formulario desde Tools (ADR-0027)» y «Enlaces propios del PDF navegables con un clic» |
| 1.2 Copiar/pegar/duplicar | ⬜ | ✅ | ADR-0014 (bc7ddb6); `useMarkupStore.test.ts`: `copySelectedMarkups copia las marcas seleccionadas al portapapeles interno`, `pasteMarkups clona marcas con nuevos IDs, offset y selecciona las nuevas`, `pasteMarkups preserva relaciones de grupo con nuevo groupId único`, `duplicateSelectedMarkups clona inmediatamente sin requerir copy previo` |
| 1.2 Alinear/distribuir, voltear/rotar marca | ⬜ | 🟡 | Rotar ✅ ADR-0039 (330d88a) · PARITY «Tiradores de Revu: vértices pequeños, escalar por las esquinas y rotar»; alinear/distribuir/voltear sin código (solo existe el alineado de Overlay, ADR-0050, que es otra cosa) |
| 1.2 Bloquear marca | ⬜ | ✅ | ADR-0014 (bc7ddb6, flag /F 132); PARITY «Herramientas Revu y portapapeles…» con test `marcas bloqueadas quedan protegidas contra borrado, movimiento y actualización de propiedades` |
| 1.2 Mover / transformar / multiselección | ✅ sin cita | ✅ con cita | PARITY «Move y Transform con umbral 4px…» y «Multiselección con Marquee…» |
| 1.2 Edición por vértices | ⬜ | ✅ | ADR-0021 (28f3240) y ADR-0069 (f1d1d07); PARITY «Puntos de control: cambiar la forma de la nube y demás marcas (deshacible)», «Tiradores de Cloud+…» y E2E `Cloud+ con tiradores…` (ok 36) |
| 1.2 Inspector de propiedades | ⬜ | ✅ | P2-C.6, commit e6a7b8a; PARITY «P2-C.6: Inspector de propiedades de marca (Bloque C, D-3)» |
| 1.2 Tool Chest | ✅ sin cita | ✅ con cita | PARITY «Tool Chest: Paletas persistidas en IndexedDB y drag & drop (Bloque B)» (E2E ok 12) |
| 1.2 Deshacer/rehacer | ✅ sin cita | ✅ con cita | PARITY «Historial Command con tope estricto de 50 pasos (undo/redo)» (`command.test.ts`: `handles at least 50 steps of undo history correctly`) |
| 1.3 Lista de marcas bidireccional | ✅ sin cita | ✅ con cita | PARITY «Tabla técnica `MarkupsList` con sincronización bidireccional» y «Markups List de Revu: abre cerrada…» (ADR-0060, E2E ok 35) |
| 1.3 Filtrar y ordenar | ✅ (C.1) sin cita | ✅ con cita | PARITY «P2-C.1: Filtrado multifactor y ordenación estable con benchmark < 10ms (Bloque C)» |
| 1.3 Estados de revisión | 🟡 (C.2 sin verificar) | ✅ | P2-C.2, commit d310a87; PARITY «P2-C.2: Menú contextual de estados técnicos con comando de historial (Bloque C)» (E2E ok 13) |
| 1.3 Columnas personalizadas | ⬜ | ✅ | P2-C.3: parser/evaluador (fbbb4d9, `parser.test.ts` 42 + `evaluate.test.ts` 11), ordenación (2937fc3), edición en línea (8109a6f), persistencia de extremo a extremo (91c474b, bf7be61); PARITY «P2-C.3: Parser de columnas personalizadas sin eval y persistencia en .bbx.json (Bloque C)» (E2E ok 14) |
| 1.3 Resumen de marcas (PDF/CSV) | ⬜ | ✅ | P2-C.4, commit e6a7b8a; PARITY «P2-C.4: Exportación estructurada a CSV con BOM y Reporte Resumen PDF (Bloque C)» (`exportService.test.ts`, 9 tests; E2E ok 15) |
| 1.3 Anotaciones foráneas | ⬜ | ✅ | ADR-0013 (adc9ff1, `annotationReader.test.ts`), ADR-0053 (c1f9efb) y ADR-0055 (b65adb3); PARITY «Cotas de Revu/Acrobat…», «Mediciones hechas en Acrobat/Revu…», «Distancias de Acrobat con /LL…», «Callout /FreeTextCallout y sellos /Stamp de otras aplicaciones…», «Capa de anotaciones ajenas leída de su /OC», «Importar y rellenar formularios AcroForm…» |
| 1.3 Guardar dentro del PDF | ⬜ | ✅ | ADR-0013 (adc9ff1): escritor incremental ISO 32000-1 §7.5.6 (`incrementalWriter.test.ts`, 7 tests, invariante de bytes), comando Rust `save_pdf` (11 tests cargo); PARITY «Persistencia incremental en PDF con anotaciones estándar ISO 32000-1 y /AP», «Ida y vuelta sin pérdidas…», «Nube visible en Revu/Acrobat…», «Sellos en el PDF…», «Callout estándar en el PDF…», «Count guardado como /Polygon…»; visual en Revu/Acrobat pendiente del usuario |
| 1.4 Calibración | ⬜ | ✅ | ADR-0015 (c622016), ADR-0025 (444000d) y ADR-0031 (4b57d21); PARITY «Escala de página guardada en el PDF (/VP /Measure)…», «Escalas de Revu/Acrobat leídas al abrir», «Calibrate por dos puntos…», «Calibrar recalcula las mediciones existentes…»; E2E ok 23 |
| 1.4 Escalas múltiples por hoja | ⬜ | 🟡 | Calibración por página ✅ (ADR-0015); viewports por hoja sin código |
| 1.4 Longitud / polilínea | ⬜ | ✅ | ADR-0015 (c622016); PARITY «Medición de área por polígono con perímetro…», «Perimeter (Shift+Alt+P)…», «Distancia en tres pasos como Acrobat…», «Medir con clic-clic…» |
| 1.4 Perímetro y área (con recortes) | ⬜ | 🟡 | Perímetro/área ✅ (ADR-0015/0029, PARITY «Medición de área por polígono…» y «Perimeter (Shift+Alt+P)…»); recortes sin código |
| 1.4 Conteo por símbolo/Subject | ⬜ | ✅ | ADR-0015 (c622016), ADR-0059 (72aae8c) y ADR-0063 (84d9381); PARITY «Count de Revu: símbolos…», «Count guardado como /Polygon /PolygonCount…», «Count: cada símbolo con su tirador…» |
| 1.4 Ángulo, radio, diámetro | ⬜ | ✅ | ADR-0029 (eec83fa) y ADR-0051 (784e12f); PARITY «Angle (Shift+Alt+G)…», «Radius (Shift+Alt+R) y Diameter (Shift+Alt+D)», «Volumen, ángulo, conteo, radio y diámetro con las claves de Revu (ADR-0051)» |
| 1.4 Volumen / profundidad | ⬜ | ✅ | ADR-0029 (eec83fa); PARITY «Volume (Shift+Alt+V)…» |
| 1.4 Acotación con flechas | ⬜ | ✅ | ADR-0020 (28f3240) y ADR-0032/0033 (76347a7/7cc2c09); PARITY «Cota en el PDF…», «Flechas al estilo de Acrobat…», «Distance como en Acrobat…» |
| 1.4 Snap | ⬜ | ✅ | ADR-0025 (444000d), ADR-0031 (4b57d21), ADR-0047/0048 (7004807/cec5d64); PARITY «Snap to drawing…», «Trazo recto con Shift…», «Shift a 45°…» |
| 1.4 Subtotales por Subject/capa/página | ⬜ | 🟡 | Totales por tipo, página y documento ✅ ADR-0015 (PARITY «Panel de mediciones: totales por tipo y unidad, perímetro, página/documento»; `markups-totals-summary` en `MarkupsListMeasurements.test.tsx`); desglose por Subject/capa ⬜ (grep `subtotal`: solo una columna de fórmula de ejemplo) |
| 1.4 Exportar CSV / informe PDF | ⬜ | ✅ | P2-C.4 (e6a7b8a); PARITY «P2-C.4: Exportación estructurada a CSV con BOM y Reporte Resumen PDF (Bloque C)» |
| 1.5 Insertar/eliminar/reordenar/rotar/extraer páginas | ⬜ | 🟡 | ADR-0016 (d5a0fdf): `pageOperations.test.ts` (11 tests) cubre rotar 90°/180°, eliminar, insertar en blanco y extraer; reordenar ⬜ (grep `move|reorder` en `pageOperations.ts`: solo `removePage`) |
| 1.5 Aplanar marcas | ✅ sin cita | ✅ con cita | PARITY «Exportación vectorial PDF con inspección de content stream» + E2E `Sub-entregable 0.3 / 0.4` |
| 1.5 Superponer páginas (overlay) | ⬜ | ✅ | ADR-0038 (435887b) y ADR-0050 (598177b); PARITY «Overlay Pages: comparar revisiones con colores…», «Overlay Pages en la app…», «Overlay Pages: alinear por 2 o 3 pares de puntos…»; E2E ok 26 y 34 |
| 1.5 Formularios | ⬜ | ✅ | ADR-0027 (46a9c3d) y ADR-0055 (b65adb3); PARITY «Campos AcroForm reales…», «Ida y vuelta de formularios…», «Botones de opción agrupados…», «Importar y rellenar formularios AcroForm…»; E2E ok 21 |
| 1.5 Firmas digitales | ⬜ | ✅ | ADR-0056 (80d7ffe) y ADR-0058 (29ec422); PARITY «Crear certificado digital autofirmado PKCS#12…», «Firmar campos de firma…», «Volver a guardar un PDF firmado sin romper la firma…» y las filas de .pfx/KDF/cifrados (digitalSignature.test.ts, 7 tests; pkcs12Ciphers.test.ts, 5 tests) |

### 6.2 Filas M revisadas con especial cuidado (fases 3 y 4)

| Fila | Estado final | Nota de auditoría |
|---|---|---|
| Importar anotaciones ajenas | ✅ | annotationReader + ADR-0053/0055 + 7 filas PARITY citadas arriba |
| Guardar dentro del PDF | ✅ | escritor incremental + save_pdf; visual en Revu/Acrobat pendiente del usuario |
| Respuestas / hilos | ⬜ | grep `inReplyTo|replyTo|thread` en src: vacío — no existe, como decía la matriz |
| Columnas personalizadas | ✅ | P2-C.3 completo con persistencia Z.2/Z.2b |
| Resumen PDF/CSV | ✅ | P2-C.4 |
| Calibración | ✅ | ADR-0015/0025/0031 con guardado en /VP /Measure |
| Mediciones (longitud, polilínea, perímetro, área, ángulo, radio, diámetro, volumen) | ✅ | ADR-0015/0029/0030/0051, vivas en Revu/Acrobat (/IT, /Measure) |
| Conteo | ✅ | ADR-0015/0059/0063 con /PolygonCount |
| Subtotales por Subject/capa/página | 🟡 | hay totales por tipo/página/documento; el desglose por Subject/capa NO existe |
| Exportar .xlsx | ⬜ | NO existe: el único `xlsx` del repo es un MIME en `linkService.ts:138`; exportService solo CSV/PDF |

### 6.3 Filas verificadas sin cambio (siguen ciertas tal cual)

⬜ confirmadas por grep/lectura: abrir desde Explorador/recientes (sin código de argumentos ni recientes de archivos),
pestañas/multi-documento, etiquetas de página (`PageLabel`: vacío), instantánea, caret, borrador de trazo,
imagen como marca, orden Z, respuestas/hilos, precios unitarios, mediciones en Tool Chest, .xlsx, Dynamic Fill,
recortar páginas, encabezados/pies/marca de agua (`watermark`: vacío), combinar PDFs (`mergePdf`: vacío),
desaplanar, lotes, OCR, comparar documentos, sets, cifrados (rechazo explícito en `fileDialogService.ts`),
redacción, nube, crear PDF desde Office/CAD, y las seis filas de §1.6.
