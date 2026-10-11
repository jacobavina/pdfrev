# ROADMAP.md — Plan Maestro de Fases, Bloques e Hitos de REA

Este documento establece la hoja de ruta técnica estructurada por fases e hitos identificables (`P<Fase>-<Bloque>.<Hito>`).

---

## Estado Global del Proyecto

```mermaid
flowchart LR
    F1["Fase 1: Motor Base CAD (Cerrada)"] --> F2A["Fase 2: Bloque A (Cerrado)"]
    F2A --> F2B["Fase 2: Bloque B (Cerrado)"]
    F2B --> F2C["Fase 2: Bloque C (En curso)"]
    F2C --> F2D["Fase 2: Bloque D (Capas y Sellos)"]
    F2D --> F3["Fases Futuras (Propuesta en docs/plan-v2/)"]
```

---

## Fase 1: Motor Base y Shell CAD (CERRADA Y VERIFICADA)

- `P1-0.1` — Visor PDF con worker web dinámico PDF.js por URL (`?url`) y canvas offscreen. **[CERRADO]**
- `P1-0.2` — Figuras geométricas básicas (círculo, polígono) y cancelación con `Escape`. **[CERRADO]**
- `P1-0.3` — Exportación vectorial a PDF con pdf-lib e inspección de content stream binario. **[CERRADO]**
- `P1-0.4` — Persistencia atómica `.bbx.json` con comandos Rust (`write_bbx`, `read_bbx`, `.tmp` + `sync_all`). R9 verificado por el usuario. **[CERRADO]**
- `P1-0.5` — Rotación unificada de Viewport (0°, 90°, 180°, 270°) combinando `page.rotate` y store. **[CERRADO]**
- `P1-0.6` — Hit-testing matemático riguroso para los 14 tipos de marcas reconocidos (0 caídas a `return true`). **[CERRADO]**
- `P1-0.7` — Gestor de Historial Command con tope estricto de 50 pasos para undo y redo. **[CERRADO]**

---

## Fase 2: Herramientas Técnicas de Marcado y Manipulación (EN CURSO)

### Bloque A: Marcado Técnico y Manipulación Interactiva (CERRADO)

| ID | Hito | Estado | Dependencia |
|---|---|---|---|
| `P2-A.0` | Move y Transform con umbral 4px, clamp estricto `[0..1]` y undo atómico | **CERRADO** (commit `6e7f0e3`) | Fase 1 |
| `P2-A.1` | Nubes de revisión con `arcStep` persistido, abombamiento determinista y Cloud+ como grupo | **CERRADO** (commit `b2ee813`) | `P2-A.0` |
| `P2-A.2` | Multiselección con Marquee por intersección y traslación conjunta | **CERRADO** (commit `d525990`) | `P2-A.1` |
| `P2-A.3` | Callout / Nota técnica con directriz conectada y cuadro de texto plano | **CERRADO** (commit `083a37b`) | `P2-A.2` |
| `P2-A.4` | Nota adhesiva técnica (`stickyNote`) | **CERRADO** (commit `75fd7be`) | `P2-A.3` |
| `P2-A.5` | Resaltador vectorial (`highlightVector`) | **CERRADO** (commit `8ffdb81`) | `P2-A.4` |
| `P2-A.6` | Resaltado de texto (`highlightText` con TextLayer de PDF.js) | **CERRADO** (commit `f895824`) | `P2-A.5` |

> [!NOTE]
> **Hito `P2-X` (Automatización de Ventana Nativa con `tauri-driver`):**
> Integración de WebDriver para pruebas automatizadas directamente sobre la ventana nativa de Tauri (`ADR-0008`). **[CERRADO y verificado en frío]**: Smoke test autocontenido en `scripts/native-smoke.mjs` (`npm run test:native`), verificando arranque, render de canvas, IPC real de Rust y acciones W3C. Ejecutable opcionalmente en la puerta de calidad mediante `verify.mjs --with-native`.

---

### Bloque B: Tool Chest (CERRADO Y VERIFICADO POR EL USUARIO)

| ID | Hito | Estado | Dependencia |
|---|---|---|---|
| `P2-B.1` | Almacenamiento y persistencia de paletas en IndexedDB (`fake-indexeddb`, migración v1->v2) | **CERRADO** (commit `d48d132`) | Bloque A completo |
| `P2-B.2` | Modos de herramienta: Modo Propiedad (P) y Modo Dibujo (D) con comando atómico | **CERRADO** (commit `0edeaa3`) | `P2-B.1` |
| `P2-B.3` | Miniaturas vectoriales canónicas (`ToolVectorThumbnail` vía render canónico) | **CERRADO** (commit `0edeaa3`) | `P2-B.2` |
| `P2-B.4` | Panel lateral Tool Chest y botón contextual en MarkupsList | **CERRADO** (commit `d42dc3b`) | `P2-B.3` |
| `P2-B.5` | Drag & drop al lienzo con centrado $\le 5\text{ px}$ y `dragDropEnabled: false` | **CERRADO** (commit `c618b34`, verificado por el usuario) | `P2-B.4` |

---

### Bloque C: MarkupsList Completa (EN CURSO)

| ID | Hito | Estado | Dependencia |
|---|---|---|---|
| `P2-C.1` | Ordenación bidireccional y filtrado multicriterio con benchmark < 10ms | **Entregado** (commit `d3b8d55`); verificación nativa pendiente | Bloque B completo |
| `P2-C.2` | Menú contextual de estados técnicos con comando atómico y sincronización de grupos | **Commiteado** (commit `d310a87`); verificación nativa pendiente | `P2-C.1` |
| `P2-C.3` | Columnas personalizadas con parser de gramática cerrada y persistencia en .bbx.json | **No empezado** (depende de Z.2) | `P2-C.2` |
| `P2-C.4` | Exportación CSV (RFC 4180 + BOM) y Reporte Resumen PDF | **No empezado** | `P2-C.3` |
| `P2-C.5` | E2E del bloque completo y verificación nativa | **No empezado** | `P2-C.4` |
| `P2-C.6` | Inspector de propiedades de marca | **Propuesto, pendiente de aprobación** (requiere ADR y decisión D-3) | `P2-C.5` |

---

### Bloque D: Capas Lógicas y Sellos Dinámicos

| ID | Hito | Estado | Dependencia |
|---|---|---|---|
| `P2-D.1` | Capas CAD lógicas con visibilidad persistida en el modelo `.bbx.json` | **No empezado** (propuesto reubicar a Fase 3 `P3-F.1`) | Bloque C completo |
| `P2-D.2` | Sellos dinámicos técnicos basados en primitivas vectoriales limpias | **No empezado** (propuesto reubicar a Fase 3 `P3-F.2`) | `P2-D.1` |

---

## Fases Futuras

> [!NOTE]
> Las Fases 3 y 4 están sujetas a la propuesta de reestructuración del Plan Maestro v2 hacia interoperabilidad PDF estándar con Bluebeam Revu y Adobe Acrobat. Véase [`docs/plan-v2/`](docs/plan-v2/README.md) para el detalle de la propuesta pendiente de aprobación del usuario.

### Fase 3: Calibración, Acotación, Takeoff y Estimación de Costes
- `P3-0.1` — Calibración de escala de plano sobre segmento conocido.
- `P3-0.2` — Acotación lineal, perimetral y superficial en escala real de ingeniería.
- `P3-0.3` — Conteo automático de símbolos y etiquetas técnicas.
- `P3-0.4` — Tablas de cubicación y takeoff de materiales con costes unitarios.
- `P3-0.5` — Exportación estructurada avanzada a Excel (`.xlsx`) y CSV.

### Fase 4: Comparación Diferencial y Juegos de Planos (Sets)
- `P4-0.1` — Superposición de planos (Overlay Pages) con código cromático de diferencias.
- `P4-0.2` — Comparación lado a lado con Split View y paneo sincronizado.
- `P4-0.3` — Gestión de conjuntos de planos (Document Sets) con vinculación de hiperenlaces.
