# ROADMAP.md — Plan Maestro de Fases, Bloques e Hitos de REA

Este documento establece la hoja de ruta técnica estructurada por fases e hitos identificables (`P<Fase>-<Bloque>.<Hito>`).

---

## Estado Global del Proyecto

```mermaid
flowchart LR
    F1["Fase 1: Motor Base CAD (Cerrada)"] --> F2A["Fase 2: Bloque A (En curso)"]
    F2A --> F2B["Fase 2: Bloque B (Pendiente)"]
    F2B --> F2C["Fase 2: Bloque C (Pendiente)"]
    F2C --> F2D["Fase 2: Bloque D (Pendiente)"]
    F2D --> F3["Fase 3: Takeoff y Estimación"]
    F3 --> F4["Fase 4: Comparación y Sets"]
    F4 --> F5["Fase 5: Gran Formato 100MB+"]
```

---

## Fase 1: Motor Base y Shell CAD (CERRADA Y VERIFICADA)

- `P1-0.1` — Visor PDF con worker web dinámico PDF.js por URL (`?url`) y canvas offscreen. **[CERRADO]**
- `P1-0.2` — Figuras geométricas básicas (círculo, polígono) y cancelación con `Escape`. **[CERRADO]**
- `P1-0.3` — Exportación vectorial a PDF con pdf-lib e inspección de content stream binario. **[CERRADO]**
- `P1-0.4` — Persistencia atómica `.bbx.json` con comandos Rust (`write_bbx`, `read_bbx`, `.tmp` + `sync_all`). R9 verificado por el usuario. **[CERRADO]**
- `P1-0.5` — Rotación unificada de Viewport (0°, 90°, 180°, 270°) combinando `page.rotate` y store. **[CERRADO]**
- `P1-0.6` — Hit-testing matemático riguroso para los 14 tipos de marcas reconocidos. **[CERRADO]**
- `P1-0.7` — Gestor de Historial Command con tope estricto de 50 pasos para undo y redo. **[CERRADO]**

---

## Fase 2: Herramientas Técnicas de Marcado y Manipulación (EN CURSO)

### Bloque A: Marcado Técnico y Manipulación Interactiva

| ID | Hito | Estado | Dependencia |
|---|---|---|---|
| `P2-A.0` | Move y Transform con umbral 4px, clamp estricto `[0..1]` y undo atómico | **CERRADO** (commit `6e7f0e3`) | Fase 1 |
| `P2-A.1` | Nubes de revisión con `arcStep` persistido, abombamiento determinista y Cloud+ como grupo | **CERRADO** (commit `b2ee813`) | `P2-A.0` |
| `P2-A.2` | Multiselección con Marquee por intersección y traslación conjunta con undo atómico | **CERRADO** (commit `d525990`) | `P2-A.1` |
| `P2-A.3` | Callout / Nota técnica con directriz inteligente y cuadro de texto plano | **PENDIENTE DE PLAN** | `P2-A.2` |
| `P2-A.4` | Polilíneas abiertas y Flechas técnicas independientes | **NO EMPEZADO** | `P2-A.3` |
| `P2-A.5` | Resaltador técnico con modo `multiply` y alineación ortogonal / snap | **NO EMPEZADO** | `P2-A.4` |
| `P2-A.6` | Sellos técnicos predefinidos y firmas de aprobación | **NO EMPEZADO** | `P2-A.5` |

> [!NOTE]
> **Hito Futuro `P2-X` (Automatización de Ventana Nativa con `tauri-driver`):**
> Integración de WebDriver para pruebas automatizadas directamente sobre la ventana nativa de Tauri. Marcado explícitamente como **posterior al Bloque A**. No forma parte del alcance actual de la Fase 2 y se regirá por su propio `ADR-0007`.

---

### Bloque B: Tabla Técnica de Marcas (`MarkupsList`)

| ID | Hito | Estado | Dependencia |
|---|---|---|---|
| `P2-B.1` | Sincronización bidireccional interactiva y centrado automático en viewport | **NO EMPEZADO** | Bloque A completo |
| `P2-B.2` | Filtrado dinámico por columnas (autor, estado de aprobación, capa, página) | **NO EMPEZADO** | `P2-B.1` |
| `P2-B.3` | Selección múltiple desde tabla y operaciones en lote (eliminar, cambiar estado) | **NO EMPEZADO** | `P2-B.2` |
| `P2-B.4` | Exportación de resumen de marcas a formato tabular plano | **NO EMPEZADO** | `P2-B.3` |

---

### Bloque C: Inspector de Propiedades, Estilos y Capas

| ID | Hito | Estado | Dependencia |
|---|---|---|---|
| `P2-C.1` | Inspector contextual flotante de propiedades geométricas y de estilo | **NO EMPEZADO** | Bloque B completo |
| `P2-C.2` | Gestión de capas CAD (visibilidad, bloqueo y asignación de marcas) | **NO EMPEZADO** | `P2-C.1` |
| `P2-C.3` | Bloqueo de marcas contra edición y comando duplicar con offset paramétrico | **NO EMPEZADO** | `P2-C.2` |

---

### Bloque D: Calibración de Escala y Acotación Básica

| ID | Hito | Estado | Dependencia |
|---|---|---|---|
| `P2-D.1` | Herramienta de calibración de escala mediante segmento de cota conocido | **NO EMPEZADO** | Bloque C completo |
| `P2-D.2` | Acotación lineal y rectangular básica mostrando medidas en escala real | **NO EMPEZADO** | `P2-D.1` |

---

## Fases Futuras

### Fase 3: Takeoff, Mediciones Especializadas y Estimación de Costes
- `P3-0.1` — Conteo automático de símbolos y etiquetas técnicas.
- `P3-0.2` — Fórmulas de cubicación y medición de polígonos irregulares.
- `P3-0.3` — Exportador nativo a Microsoft Excel (`.xlsx`) y CSV estructurado.

### Fase 4: Comparación Diferencial y Juegos de Planos (Sets)
- `P4-0.1` — Superposición de planos (Overlay Pages) con código cromático de diferencias.
- `P4-0.2` — Comparación lado a lado con Split View y paneo sincronizado.
- `P4-0.3` — Gestión de conjuntos de planos (Document Sets) con vinculación de hiperenlaces.

### Fase 5: Rendimiento de Gran Formato y Aceleración
- `P5-0.1` — Tiling dinámico y virtualización de lienzo para planos complejos > 100 MB.
- `P5-0.2` — Aceleración gráfica por hardware para decenas de miles de anotaciones concurrentes.
