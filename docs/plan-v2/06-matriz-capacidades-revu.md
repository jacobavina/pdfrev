# 06 — Matriz de capacidades objetivo, escenarios de aceptación y cuestionario

> **Aviso de fuente:** esta matriz se basa en el **conocimiento público general** del producto Revu (no en su
> código, binarios ni capturas: `AGENTS.md` §1–§2). Puede estar incompleta o desactualizada respecto a la versión que
> use el usuario. **Debe validarse con quien usa Revu a diario** (cuestionario §4). "Revu" y "Bluebeam" son marcas de
> terceros, usadas aquí solo de forma nominativa.
>
> **Prioridad:** **M** (must, imprescindible para el público objetivo) · **S** (should) · **C** (could) · **W** (won't
> por ahora). **Público:** **K** = construcción/takeoff · **I** = revisión de ingeniería.
> **Estado REA** (verificado salvo indicación): ✅ hecho · 🟡 parcial · ⬜ no existe.

---

## 1. Matriz de capacidades

### 1.1 Visualización y navegación

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Abrir PDF desde diálogo | ✅ | — | M | K I |
| Abrir desde el Explorador ("Abrir con", argumentos), recientes | ⬜ | P5-B.6 | M | K I |
| Zoom, rotación de vista | ✅ | — | M | K I |
| Mano, ajustar a ancho/página, zoom a ventana | 🟡 (zoom/rotación) | P5-B.5 | M | K I |
| Vista continua multipágina | ⬜ (una página) | P5-B.1 | M | K I |
| Pestañas / varios documentos | ⬜ | P5-B.2 | M | K I |
| Miniaturas | ✅ | — | M | K I |
| Marcadores (índice) | ⬜ | P5-B.3 | S | I |
| Etiquetas de página | ⬜ | P5-B.3 | S | K |
| Búsqueda de texto | ⬜ | P5-B.4 | M | K I |
| Planos grandes (E-size, 100 MB) con fluidez | ⬜ sin medir | P5-A | M | K I |
| Vista dividida sincronizada | ⬜ | P6-B.1 | S | I |
| Instantánea (snapshot) | ⬜ | P5-B.7 | C | I |
| Panel de capas (OCG) | ⬜ | P3-F.1 | M | K I |

### 1.2 Herramientas de marcado

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Rectángulo, elipse, línea, polígono | ✅ | — | M | K I |
| Polilínea abierta | ⬜ | P3-H.1 | M | K I |
| Flecha / línea con extremos | ⬜ | P3-H.1 | M | I |
| Nube de revisión (+ Cloud+) | ✅ | — | M | I |
| Callout | ✅ | — | M | I |
| Cuadro de texto con borde/relleno | 🟡 (texto; verificar borde) | P3-H.2 | M | I |
| Nota adhesiva | ✅ | — | S | I |
| Resaltador vectorial / de texto | ✅ | — | M | I |
| Subrayado, tachado, ondulado de texto | ⬜ | P3-H.3 | M | I |
| Insertar/reemplazar texto (caret) | ⬜ | P3-H.3 | C | I |
| Lápiz (mano alzada) | ✅ (`freehand`) | — | S | I |
| Borrador de trazo | ⬜ | P3-H.2 | C | I |
| Imagen / foto como marca | ⬜ | P3-H.4 | S | K I |
| Sellos (estáticos y dinámicos) | ⬜ | P3-F.2 | M | I |
| Hipervínculo | ⬜ | P3-E.3 | S | I |
| Copiar/pegar/duplicar (también entre páginas) | ⬜ | P3-H.5 | M | K I |
| Alinear/distribuir, voltear/rotar marca | ⬜ | P3-H.5 | S | I |
| Bloquear marca | ⬜ | P3-H.5 | S | I |
| Orden Z (traer/enviar al fondo) | ⬜ | P3-H.5 | C | I |
| Mover / transformar / multiselección (marquee) | ✅ | — | M | K I |
| Edición por vértices | ⬜ | P3-H.5 | S | K |
| Inspector de propiedades | ⬜ | P2-C.6 | M | K I |
| Tool Chest (paletas, recientes, arrastrar) | ✅ | — | M | K I |
| Deshacer/rehacer (50 pasos) | ✅ | — | M | K I |

### 1.3 Lista de marcas y revisión

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Lista de marcas, selección bidireccional | ✅ | — | M | K I |
| Filtrar y ordenar | ✅ (C.1) | — | M | K I |
| Estados de revisión (menú contextual) | 🟡 (C.2 sin verificar) | P2-C.2 / P3-E.1 | M | I |
| Respuestas / hilos | ⬜ | P3-E.2 | M | I |
| Columnas personalizadas | ⬜ | P2-C.3 | M | K |
| Resumen de marcas (PDF/CSV) | ⬜ | P2-C.4 | M | I |
| Anotaciones foráneas (importar PDFs de otros) | ⬜ | P3-C | **M** | K I |
| Guardar las marcas **dentro** del PDF (editables en Revu/Acrobat) | ⬜ | P3-B/D | **M** | K I |

### 1.4 Medición y takeoff

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Calibración de escala | ⬜ | P4-A.2 | **M** | K |
| Escalas múltiples por hoja (viewports) | ⬜ | P4-A.3 | M | K |
| Longitud / polilínea | ⬜ | P4-B.1 | **M** | K |
| Perímetro y área (con recortes) | ⬜ | P4-B.2 | **M** | K |
| Conteo por símbolo/Subject | ⬜ | P4-B.3 | **M** | K |
| Ángulo, radio, diámetro | ⬜ | P4-B.4 | S | K |
| Volumen / profundidad | ⬜ | P4-B.5 | S | K |
| Acotación con flechas | ⬜ | P4-B.6 | S | K I |
| Snap (extremos, ortogonal) | ⬜ | P4-B.7 | S | K |
| Subtotales por Subject/capa/página | ⬜ | P4-C.2 | **M** | K |
| Precios unitarios y costes | ⬜ | P4-C.3 | S | K |
| Herramientas de medición en Tool Chest | ⬜ | P4-C.4 | M | K |
| Exportar a Excel (.xlsx) | ⬜ | P4-D.2 | **M** | K |
| Exportar a CSV / informe PDF | ⬜ | P4-D.1/D.3 | M | K |
| Relleno dinámico (Dynamic Fill) | ⬜ | — | C | K |

### 1.5 Documento y páginas

| Capacidad | REA hoy | Fase / hito | Prio. | Público |
|---|---|---|---|---|
| Insertar/eliminar/reordenar/rotar/extraer páginas | ⬜ | P5-C.1 | M | K I |
| Recortar páginas | ⬜ | P5-C.2 | S | K |
| Encabezados, pies, numeración, marca de agua | ⬜ | P5-C.2 | S | I |
| Combinar PDFs | ⬜ | P5-C.3 | M | K I |
| Aplanar marcas | ✅ (export aplanado) | — | M | I |
| Procesos por lotes | ⬜ | P5-C.4 | S | K I |
| OCR | ⬜ | P5-D.1 | C | K |
| Comparar documentos | ⬜ | P6-A.2 | M | I |
| Superponer páginas (overlay) | ⬜ | P6-A.1 | M | I |
| Sets de planos, enlaces entre hojas | ⬜ | P6-C.1 | S | K I |
| Formularios | ⬜ | — | W/C | I |
| Firmas digitales (crear) | ⬜ | — | W | I |
| Redacción real | ⬜ | — | W/C | I |
| Colaboración en la nube (Studio) | ⬜ | — | W | K I |
| Crear PDF desde Office/CAD | ⬜ | — | W | K I |

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
