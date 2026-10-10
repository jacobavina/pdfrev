# ADR-0005: Gestor de Historial Command con Límite Forzado de 50 Pasos

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Autores:** Equipo REA

---

## 1. Contexto
En herramientas de edición CAD para planos de ingeniería, los usuarios ejecutan cientos de acciones continuas (dibujo, arrastre, rotación, modificación de estilos, borrado). Sin un control estricto sobre el historial de operaciones:
1. Las pilas ilimitadas de undo/redo acumulan clones completos del estado, consumiendo memoria RAM exponencialmente hasta bloquear el WebView.
2. Traslaciones complejas de múltiples marcas o grupos (como `Cloud+` o multiselecciones) pueden quedar desincronizadas si cada marca genera un comando individual de undo, obligando al usuario a pulsar `Ctrl+Z` docenas de veces para revertir un solo gesto de ratón.

---

## 2. Alternativas Consideradas
1. **Historial nativo de Zustand (middleware temporal tipo `zundo`):** Descartado. Guarda snapshots completos del árbol de estado, lo que es ineficiente para cientos de marcas y dificulta acciones compuestas atómicas con metadatos.
2. **Pila lineal sin límite superior:** Descartado por fuga de memoria progresiva (memory leak) en sesiones prolongadas.
3. **Patrón Command con interfaz tipada y gestor desacoplado `HistoryManager`:** Cada comando encapsula `execute()` y `undo()`. El constructor fuerza un tope mínimo innegociable de 50 pasos (`Math.max(50, maxSteps)`), podando el fondo de la pila (`shift()`) al exceder la capacidad.

---

## 3. Decisión
Construir una clase pura `HistoryManager` basada en el patrón Command, integrada con el almacén Zustand a través de comandos atómicos agregados como `commitMoveMarkups`.

Anclas de implementación verificadas:
- En `src/store/history/command.ts` (línea 7, declaración de `class HistoryManager`).
- En `src/store/history/command.ts` (líneas 12-13, constructor que fuerza `Math.max(50, maxSteps)`).
- En `src/store/history/command.ts` (líneas 19-20 y 42-43, recorte preventivo de `undoStack`).
- En `src/store/history/command.ts` (líneas 31-32, recorte preventivo de `redoStack`).
- En `src/store/useMarkupStore.ts` (línea 6, instancia `markupHistory = new HistoryManager(50)`).
- En `src/store/useMarkupStore.ts` (línea 8, interfaz `MoveMarkupItem`).
- En `src/store/useMarkupStore.ts` (línea 266, acción `commitMoveMarkups` que agrupa traslaciones compuestas en un único comando).

---

## 4. Consecuencias
- **Positivas:** Memoria acotada y predecible; reversión atómica de movimientos que afectan a $K$ marcas (un solo `Ctrl+Z` restaura todas las marcas desplazadas juntas); soporte completo para atajos de teclado estándar (`Ctrl+Z`, `Ctrl+Y`).
- **Negativas / Mitigaciones:** Toda acción destructiva o de movimiento debe empaquetarse en un objeto que implemente la interfaz `Command`.

---

## 5. Evidencia
- En `src/store/history/command.test.ts`, pruebas automatizadas verifican que el constructor eleva cualquier límite inferior a 50 pasos y que los pasos número 51 y posteriores descartan exactamente los elementos más antiguos manteniendo el tope.
- Pruebas E2E en `tests/e2e/pdf-viewer.spec.ts` (A.0, A.1 y A.2) validan que un único `Control+z` revierte arrastres simples, grupos Cloud+ y multiselecciones completas.
