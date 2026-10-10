# ADR-0001: Configuración Dinámica del Worker Web de PDF.js

- **Estado:** Aceptado
- **Fecha:** 2026-10-09
- **Autores:** Equipo REA

---

## 1. Contexto
PDF.js requiere un Web Worker independiente para descomprimir y renderizar páginas PDF sin bloquear el hilo principal de la interfaz de usuario en el WebView de Tauri. En aplicaciones empaquetadas con Vite y Tauri 2, la carga tradicional del worker mediante URLs externas (CDN) genera fallos en entornos sin conexión a internet y vulnerabilidades de seguridad. Por otro lado, empaquetar el worker en el mismo bundle principal incrementaba el tamaño del chunk inicial a más de 1.9 MB, ralentizando drásticamente el inicio de la app.

---

## 2. Alternativas Consideradas
1. **Descarga desde CDN remoto (`unpkg` / `cdnjs`):** Descartado de inmediato. REA es una herramienta local-first que debe operar en redes aisladas (air-gapped) en obra o despachos técnicos.
2. **Inclusión en el bundle monolítico de Vite:** Descartado. Aumenta el tiempo de arranque y causa advertencias severas de rendimiento (`chunk size > 500 kB`).
3. **Worker dedicado empaquetado localmente vía consulta de URL (`?url` de Vite):** Vite compila el worker en un asset independiente (`dist/assets/pdf.worker.min-*.mjs`) y resuelve una URL local segura en tiempo de construcción.

---

## 3. Decisión
Adoptar la importación del worker nativo ESM de `pdfjs-dist` mediante el sufijo `?url` de Vite y configurar explícitamente `GlobalWorkerOptions.workerSrc` dentro de una función de inicialización idempotente.

Anclas de implementación verificadas:
- En `src/services/pdfService.ts` (línea 6, importación de símbolo `pdfWorkerUrl` desde `'pdfjs-dist/build/pdf.worker.min.mjs?url'`).
- En `src/services/pdfService.ts` (líneas 10-19, función `configurePdfWorker`).
- En `src/services/pdfService.ts` (línea 14, asignación `GlobalWorkerOptions.workerSrc = pdfWorkerUrl`).
- En `src/services/pdfService.ts` (líneas 22 y 36, invocación de `configurePdfWorker()` antes de `pdfjsLib.getDocument`).

---

## 4. Consecuencias
- **Positivas:** El renderizado de PDF funciona completamente desconectado; el chunk principal se redujo a ~583 kB; el worker se ejecuta en un hilo separado del sistema operativo.
- **Negativas / Mitigaciones:** Requiere el manejo cuidadoso de rutas relativas y compatibilidad con el esquema de carga de Tauri (`tauri://` y `http://localhost`).

---

## 5. Evidencia
- Suite E2E en `tests/e2e/pdf-viewer.spec.ts` verifica el renderizado real de 78,000+ píxeles rasterizados en el canvas.
- Salida del comando de construcción (`npm run build`):
  `dist/assets/pdf.worker.min-yatZIOMy.mjs 1,375.84 kB` emitido como chunk aislado e independiente del bundle principal.
