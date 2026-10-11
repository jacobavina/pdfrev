# ADR-0008: Automatización y Smoke Test de Ventana Nativa con tauri-driver

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Autores:** Equipo REA

---

## 1. Contexto

Hasta la entrega del Bloque B, toda la verificación automatizada de interfaz de REA dependía exclusivamente de Playwright corriendo sobre un navegador Chromium web. Aunque Playwright ofrece alta fidelidad para la lógica geométrica, estado Zustand y componentes React, adolece de una brecha arquitectónica crítica respecto al producto final empaquetado:
1. **Ausencia del entorno nativo:** En el navegador web convencional, `window.__TAURI__` y `window.__TAURI_INTERNALS__` no existen. Las invocaciones de persistencia documental `.bbx.json` caen necesariamente al fallback de `localStorage` en vez de ejercitar los comandos reales de Rust (`write_bbx`, `read_bbx`).
2. **Divergencia de motor:** Chromium web no ejecuta el runtime Microsoft WebView2 que Tauri 2 utiliza en Windows, lo que oculta diferencias potenciales en inicialización, renderizado de canvas y gestión de procesos del sistema operativo.
3. **Validación manual costosa:** La única forma de probar la capa IPC y el arranque del binario era mediante interacción manual del usuario en su escritorio.

El hito `P2-X` establece la necesidad de un **smoke test automatizado** que arranque el binario compilado real de REA (`app.exe`), adhiera una sesión WebDriver estándar a la ventana nativa mediante `tauri-driver`, y valide de forma verificable la capa nativa y el renderizado gráfico.

---

## 2. Alternativas Consideradas

1. **Opción A: Framework WebdriverIO con `@wdio/tauri-service`.**
   La solución recomendada por la documentación oficial de Tauri implica instalar WebdriverIO, sus runners, plugins y utilidades. Introduce decenas de dependencias transitivas en `package.json`, incrementa el riesgo de incompatibilidades y colisiona con la directriz de mantener el repositorio ligero y con cero dependencias superfluas.
2. **Opción B: Mantener la verificación 100% manual del usuario.**
   No añade código al repositorio, pero perpetúa la falta de una puerta automatizada para detectar regresiones en los comandos IPC de Rust y en el arranque del empaquetado nativo.
3. **Opción C (Elegida): Cliente WebDriver HTTP nativo en Node.js puro (`scripts/native-smoke.mjs`).**
   Dado que `tauri-driver` expone una interfaz REST estándar W3C WebDriver en el puerto 4444 y Node 24 incorpora `fetch` nativo de manera estándar, es posible implementar la suite completa de smoke test (creación de sesión, consultas DOM, ejecución de scripts asíncronos para IPC, captura de pantalla y acciones de ratón W3C) en un script autocontenido sin añadir **ninguna dependencia npm nueva**.

---

## 3. Decisión

Se adopta la **Opción C**.

Se implementa `scripts/native-smoke.mjs` invocable mediante `npm run test:native` con las siguientes características:
- **Cero dependencias npm nuevas:** Uso exclusivo de módulos nativos de Node (`node:child_process`, `node:fs`, `node:path`, `node:net` y `fetch`).
- **Verificación rigurosa de prerrequisitos:** Antes de interactuar con el driver, comprueba la existencia de `tauri-driver.exe`, la presencia de `msedgedriver.exe`, la coincidencia exacta de versiones entre el driver y el runtime de WebView2 instalado en el equipo, y la existencia del binario compilado de REA (`src-tauri/target/debug/app.exe`).
- **Ciclo de vida automático:** Si `tauri-driver` no está ejecutándose en el puerto 4444, el script lo inicia como proceso hijo y garantiza su terminación limpia (`cleanup`) al finalizar o ante interrupciones (`SIGINT`).
- **Cobertura del Smoke Test:**
  1. Adhesión de sesión WebDriver a la ventana nativa de REA.
  2. Verificación de renderizado real en el `<canvas>` (dimensiones y píxeles no nulos comprobados por `getImageData`).
  3. Ejecución real de IPC: invocación de `write_bbx` atómico sobre un archivo temporal, comprobación en disco de que el archivo existe y que no quedan residuos `.tmp`, invocación de `read_bbx` para validar la lectura vía Rust, y eliminación del archivo de prueba.
  4. Interacciones de ratón W3C Actions API (selección de herramienta Rectángulo, trazo en el lienzo y selección con clic).
  5. Generación de capturas de pantalla PNG como evidencia en `tests/native-artifacts/` (incorporado a `.gitignore`).
- **Integración con `scripts/verify.mjs`:** El smoke test se desacopla de la puerta de verificación rápida por defecto y se ejecuta **únicamente** cuando se suministra el flag `--with-native`.

---

## 4. Alcance Real y Límites Intrínsecos

Es imperativo documentar con total honestidad qué cubre `tauri-driver` y qué permanece fuera de su alcance técnico:

### Lo que SÍ cubre tauri-driver frente a Playwright
- **Capa IPC de Rust:** Invocación real de handlers registrados en `tauri::generate_handler!`, validando serialización, deserialización, llamadas al sistema de archivos del SO y manejo de errores.
- **Runtime real WebView2:** Ejecución sobre el motor WebView2 enlazado dinámicamente en Windows, comprobando renderizado de WebGL/Canvas y estilos nativos.
- **Empaquetado y arranque del binario:** Verifica que `app.exe` compila, inicia su bucle de eventos nativo y carga los activos de producción (`frontendDist`) sin fallos de ruta o CSP.

### Lo que NO cubre tauri-driver (Límites de WebDriver y CDP)
- **Defectos de intercepción del Shell / OLE del Sistema Operativo:**
  * **Análisis del defecto `IDropTarget` OLE de Tauri (commit `c618b34`):**
    ¿Habría detectado WebDriver el rechazo de arrastre (cursor de prohibido) que provocaba `dragDropEnabled: true`? **NO.**
    WebDriver inyecta las acciones de puntero a través de comandos de Chromium DevTools Protocol (`Input.dispatchMouseEvent`). Estas acciones se despachan directamente en la cola de entrada del motor de renderizado web; **no generan mensajes OLE `DoDragDrop` en el bucle Win32 ni ejercitan la interfaz COM `IDropTarget`** registrada por Tauri en el `HWND` de la ventana. Por tanto, un arrastre sintetizado por WebDriver habría sido procesado como un evento DOM estándar, arrojando un falso verde exactamente igual que Playwright.
- **Diálogos de archivo nativos:** Los cuadros de diálogo nativos de Windows (`OpenFileDialog` provistos por `@tauri-apps/plugin-dialog`) congelan el hilo de la ventana y no son accesibles a través del DOM de WebView2.
- **Eventos globales del SO:** Atajos globales de teclado, menús contextuales nativos de la barra de título de Windows y escalado de DPI del escritorio.

> **Conclusión sobre la disciplina:** La regla de `AGENTS.md` (Sección 8) permanece plenamente vigente. La automatización nativa con `tauri-driver` es una herramienta de regresión invaluable para IPC y renderizado, pero la aceptación definitiva de funcionalidades dependientes del shell continúa exigiendo la validación manual del usuario.

---

## 5. Consecuencias y Aislamiento del Binario (Self-Contained Build)

- **Positivas:**
  - REA cuenta por primera vez con una suite automatizada capaz de ejercitar la capa Rust nativa y el WebView2 real.
  - Cero incremento en el árbol de dependencias (`node_modules` intacto).
  - Ejecución rápida (< 6 segundos en máquina local).
- **Aislamiento crítico frente a `tauri dev`:**
  - **Problema de fondo:** `tauri dev` genera un ejecutable en `src-tauri/target/debug/app.exe` configurado con `devUrl: "http://localhost:1420"`, sin empaquetar los assets del frontend. Si se ejecuta el smoke test sin un servidor Vite activo en el puerto 1420, WebView2 falla al cargar la página pero Tauri inyecta de todos modos `window.__TAURI_INTERNALS__`, produciendo un fallo determinista en la detección del DOM de la aplicación.
  - **Solución implementada:**
    1. **Ruta aislada:** El smoke test consume exclusivamente `src-tauri/target/smoke/app.exe`, una ruta que `tauri dev` jamás sobreescribe.
    2. **Inspección estricta de bytes (Prerrequisito 1.5):** El runner lee los bytes del binario con `fs.readFileSync` antes de lanzar y aborta con error explicativo si contiene `localhost:1420` o si carece de marcadores de frontend incrustado (`index.html`).
    3. **Flag `--build`:** Soporte de compilación desatendida mediante `npm.cmd run test:native -- --build` (o `npm.cmd run test:native:build`), que compila el frontend, ejecuta `tauri build --debug --no-bundle -c '{"build":{"devUrl":null}}'` y copia el resultado a `src-tauri/target/smoke/app.exe`.
    4. **Comando para PowerShell:** `npm.cmd run test:native`.
- **Negativas / Mitigaciones:**
  - Requiere dependencias externas del entorno (`tauri-driver.exe` en Cargo y `msedgedriver.exe` en el equipo).
  - Mitigado mediante la detección anticipada de prerrequisitos con mensajes de error formativos y la exclusión del smoke test de la puerta de verificación rápida habitual (`verify.mjs` por defecto).

---

## 6. Evidencia

1. **Sesión WebDriver establecida:**
   ```text
   Session ID: dcc74605fce7350b2dd9b638b900a2ec
   Navegador:  webview2 156.0.4314.15
   Driver:     156.0.4314.15 (00dfb331201464939135eb6052ffa7b15260dc4f)
   ```
2. **IPC Rust verificado:**
   - Creación y persistencia atómica de `temp_native_smoke.bbx.json` confirmada por `fs.existsSync`.
   - Ausencia de archivo temporal `.tmp` residual confirmada.
   - Lectura íntegra mediante `read_bbx` con matching de campos JSON.
3. **Renderizado y acciones W3C con aserciones estrictas:**
   - Ventana configurada a dimensión realista de 1280x900 px vía `POST /session/:id/window/rect`.
   - 12,610 píxeles opacos detectados en el canvas principal `#pdf-render-canvas` (800x600 px).
   - Trazo de rectángulo calculado con coordenadas proporcionales dentro del lienzo (del 25% al 65% de ancho y 25% al 55% de alto).
   - **Aserción estricta de store:** comprobación de que `useMarkupStore.getState().markups.length` incrementa exactamente de 1 a 2 marcas (+1) con autor por defecto `'Revisor Técnico'`.
   - **Aserción estricta de selección:** clic sobre el borde del rectángulo trazado activa la selección y añade el ID de la marca a `selectedMarkupIds`.
   - Artefactos visuales generados en `tests/native-artifacts/pdf-canvas-smoke.png` y `tests/native-artifacts/native-rectangle-drawn.png` (mostrando visualmente "LISTA DE MARCAS (2)" con las dos filas en el panel inferior).
4. **Verificación en frío con puerto 1420 vacío:**
   - Confirmado con `Get-NetTCPConnection -LocalPort 1420` arrojando vacío.
   - Detección de binario autocontenido en `src-tauri/target/smoke/app.exe` sin dependencias de red local.
