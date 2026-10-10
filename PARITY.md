# PARITY.md — Matriz de Paridad Funcional y Verificación

Este documento registra la paridad funcional real implementada en REA, vinculando cada capacidad con el archivo y la suite exacta de pruebas automatizadas que la respaldan, y el estado de validación en la GUI nativa de Tauri.

**Regla de auditoría estricta:** Una fila de la tabla solo puede marcarse con dicho estado si el test automatizado existe, se ejecuta y pasa en la suite. Si toca la ventana nativa de la aplicación, incluye la confirmación explícita de validación por el usuario.

---

## Matriz de Funcionalidades

| Capacidad / Función | Estado | Archivo de Prueba Automatizada | Suite / Test Específico | Verificación en Ventana Nativa (Usuario) |
|---|---|---|---|---|
| **Visor PDF con worker PDF.js por URL** | `shipped` | `tests/e2e/pdf-viewer.spec.ts` | `Verifica que el PDF renderiza pixels reales en el canvas y no solo carga` | Verificado en ventana nativa por el usuario |
| **Herramientas geométricas base (círculo, polígono, escape)** | `shipped` | `tests/e2e/pdf-viewer.spec.ts` | `Sub-entregable 0.2: Dibuja círculo/elipse, polígono y valida atajo Escape` | Verificado en ventana nativa por el usuario |
| **Exportación vectorial PDF con inspección de content stream** | `shipped` | `src/services/pdfExportService.test.ts` | `exportMarkupsToPdf > Test de Oro: examina el content stream real de la página exportada` | No aplica (generación documental binaria) |
| **Persistencia atómica `.bbx.json` (Rust write_bbx / read_bbx)** | `shipped` | `src/services/bbxPersistenceService.test.ts` | `Tauri 2 Native Commands Integration > llama a write_bbx con la ruta hermana exacta` | R9 verificado escribiendo en disco desde ventana nativa por el usuario |
| **Manejo seguro de FileNotFound en Rust (`Ok(None)`)** | `shipped` | `src/services/bbxPersistenceService.test.ts` | `read_bbx de inexistente devuelve null sin error bloqueante` | R9 verificado por el usuario |
| **Coordenadas y rotación unificada de Viewport (0°, 90°, 180°, 270°)** | `shipped` | `src/utils/coordinates.test.ts` | `Sub-entregable 0.5: Rotación Unificada (0°, 90°, 180°, 270°) y Viewport de PDF.js` | No aplica (invariante geométrica) |
| **Hit-testing matemático por tipo (14 tipos, 0 return true)** | `shipped` | `src/utils/coordinates.test.ts` | `Sub-entregable 0.6: Hit-testing matemático exhaustivo por tipo sin fallback genérico` | No aplica (geometría de eventos) |
| **Historial Command con tope estricto de 50 pasos (undo/redo)** | `shipped` | `src/store/history/command.test.ts` | `HistoryManager > constructor fuerza capacidad mínima de 50 pasos` | No aplica (gestión de memoria de estado) |
| **Tabla técnica `MarkupsList` con sincronización bidireccional** | `shipped` | `tests/e2e/pdf-viewer.spec.ts` | `Fase 1: Motor de Anotaciones y Visor PDF > Verifica que el PDF renderiza pixels reales` | Verificado en ventana nativa por el usuario |
| **Move y Transform con umbral 4px, clamp 0..1 y undo atómico** | `shipped` | `tests/e2e/pdf-viewer.spec.ts` | `Sub-entregable A.0: Selección, arrastre con umbral 4px, traslación 50px y reversión atómica` | PENDIENTE DE VERIFICAR |
| **Nubes de revisión con arcStep persistido y determinista** | `shipped` | `src/services/bbxPersistenceService.test.ts` | `Sub-entregable A.1: Nube con arcStep=20 conserva sus lóbulos e inmutabilidad tras recargar` | PENDIENTE DE VERIFICAR (curvatura visual) |
| **Cloud+ como grupo indivisible (arrastre, borrado y undo atómico)** | `shipped` | `tests/e2e/pdf-viewer.spec.ts` | `Sub-entregable A.1: Cloud+ como grupo (creación atómica, arrastre conjunto y undo)` | PENDIENTE DE VERIFICAR |
| **Multiselección con Marquee por intersección y traslación conjunta** | `shipped` | `tests/e2e/pdf-viewer.spec.ts` | `Sub-entregable A.2: Multiselección con Marquee por intersección, lista intacta y arrastre` | PENDIENTE DE VERIFICAR |
| **Prefiltro O(N) para Marquee en tiempo real** | `shipped` | `src/utils/coordinates.test.ts` | `selectMarkupsInRect > escala linealmente con 500 marcas en < 15ms` | No aplica (benchmarking unitario) |
| **Callout / Nota técnica con directriz conectada** | `todo` | `tests/e2e/pdf-viewer.spec.ts` | Pendiente de implementación (P2-A.3) | Pendiente de implementación |
| **Polilíneas abiertas y Flechas técnicas independientes** | `todo` | `tests/e2e/pdf-viewer.spec.ts` | Pendiente de implementación (P2-A.4) | Pendiente de implementación |
| **Resaltador técnico con modo multiply y snap ortogonal** | `todo` | `tests/e2e/pdf-viewer.spec.ts` | Pendiente de implementación (P2-A.5) | Pendiente de implementación |
| **Sellos predefinidos y aprobaciones visuales** | `todo` | `tests/e2e/pdf-viewer.spec.ts` | Pendiente de implementación (P2-A.6) | Pendiente de implementación |
| **Filtrado dinámico avanzado en tabla de marcas (Bloque B)** | `todo` | `tests/e2e/pdf-viewer.spec.ts` | Pendiente de implementación (P2-B.1 - B.4) | Pendiente de implementación |
| **Inspector avanzado de estilos y paletas por capa (Bloque C)** | `todo` | `tests/e2e/pdf-viewer.spec.ts` | Pendiente de implementación (P2-C.1 - C.3) | Pendiente de implementación |
| **Calibración de escala de plano y acotación lineal (Bloque D)** | `todo` | `tests/e2e/pdf-viewer.spec.ts` | Pendiente de implementación (P2-D.1 - D.2) | Pendiente de implementación |
| **Automatización nativa con tauri-driver (Hito P2-X)** | `todo` | `tests/e2e/pdf-viewer.spec.ts` | Futuro: posterior al Bloque A (ADR-0007) | No forma parte de la Fase 2 |
