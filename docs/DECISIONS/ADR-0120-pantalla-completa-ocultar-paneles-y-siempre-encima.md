# ADR-0120: Full Screen, Hide Panels y Always On Top

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Tres funciones del menú Window de Revu que faltaban (oleada 3 de `docs/plan-v2/10-brecha-menus-revu.md`): dar al plano toda
la ventana o toda la pantalla, y mantener la ventana por encima de las demás.

## 2. Decisión

1. **Full Screen** (`F11`, `View ▸ Full Screen`): en la aplicación de escritorio usa la ventana de Tauri
   (`setFullscreen`); en el navegador, la pantalla completa del documento. El estado se guarda y, en el navegador, se
   sincroniza con `fullscreenchange` (así Esc, que cierra la pantalla completa por su cuenta, no lo deja desfasado).
2. **Hide Panels** (`Shift+F4`, `View ▸ Hide Panels`): guarda qué estaba abierto (el panel izquierdo, el derecho y la lista
   de marcas), los cierra todos y, la segunda vez, abre justo lo que estaba abierto. Con todo cerrado no hace nada.
3. **Always On Top** (`View ▸ Always On Top`, marca de activo): `setAlwaysOnTop` de la ventana de Tauri. En el navegador
   una pestaña no puede ponerse encima de otras ventanas, así que la entrada sale desactivada.
4. **Permisos:** la capacidad de la aplicación (`src-tauri/capabilities/default.json`) añade solo tres permisos de
   ventana, `core:window:allow-set-fullscreen`, `core:window:allow-is-fullscreen` y `core:window:allow-set-always-on-top`.
   El smoke test nativo los ejercita por el IPC real (entra y sale de pantalla completa, pone y quita siempre encima)
   y deja la ventana como estaba.

## 3. Alcance y límites

- Hide Panels no oculta la cinta ni la barra de menús: son los controles. No hay variantes (*Auto-Hide Tabs*, *Panel
  Access*, *Presentation*), que se descartaron por poco uso.
- Siempre encima no se recuerda entre sesiones.

## 4. Pruebas

- `src/core/ui/panelVisibility.test.tsx` (9): paneles abiertos, ocultar y devolver, solo lo que estaba abierto, ventana de
  Tauri simulada para pantalla completa y siempre encima, fallos, menú y teclas F11 y Shift+F4 desde la aplicación.
- E2E `Hide Panels (ADR-0120)`: Shift+F4 en la aplicación real oculta miniaturas y lista de marcas y las devuelve.
- Smoke nativo: pantalla completa y siempre encima por el IPC real (permisos de la capacidad).
