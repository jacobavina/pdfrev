# CLAUDE.md — Notas de trabajo para REA (Revu Engineering Architecture)

Este archivo contiene la guía operativa diaria para el desarrollo en el repositorio.
**Regla de precedencia:** Si alguna instrucción de este archivo contradice a `AGENTS.md`, **prevalece estrictamente `AGENTS.md`**.

---

## 1. Ejecución de la Aplicación

### A. Aplicación Nativa (Tauri 2)
> [!IMPORTANT]
> **La aplicación nativa DEBE ejecutarse en la terminal DEL USUARIO:**
> ```cmd
> npm.cmd run tauri dev
> ```
> *(En Linux/macOS: `npm run tauri dev`)*

### B. Aviso Crítico sobre el Runner del Agente
- **El entorno del agente es desasistido (headless / background):** no tiene acceso a una sesión de escritorio interactiva visible para el usuario.
- Si el agente lanza `npm run tauri dev`, el proceso puede arrancar en segundo plano pero **no mostrará una ventana interactiva en la pantalla del usuario**.
- **Por tanto:** El agente **NUNCA** declara que la ventana nativa, un diálogo del sistema o un render visual "funciona". La validación de la GUI nativa la realiza exclusivamente el usuario.

---

## 2. Ejecución de Pruebas y Puertas de Calidad

### Puerta Única de Verificación (Recomendada)
Para ejecutar la verificación completa antes de cualquier commit:
```powershell
node scripts/verify.mjs
```
Para incluir las 3 pasadas obligatorias de E2E:
```powershell
node scripts/verify.mjs --with-e2e
```

### Ejecución de Suites Individuales
En Windows PowerShell, configurar siempre el entorno previo si es necesario:
```powershell
$env:PATH = "C:\Program Files\nodejs;C:\Users\jmm_j\.cargo\bin;$env:PATH"; $env:NODE_OPTIONS = "--use-system-ca"
```

1. **Pruebas Unitarias (Vitest):**
   ```powershell
   npm.cmd test -- --run
   ```
2. **Pruebas Nativas Rust (`cargo test`):**
   ```powershell
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
3. **Compilación y Empaquetado (TypeScript + Vite):**
   ```powershell
   npm.cmd run build
   ```
4. **Pruebas End-to-End (Playwright):**
   *Nota: Todo hito requiere un mínimo de 3 pasadas consecutivas en verde.*
   ```powershell
   npm.cmd run test:e2e
   ```
   *Para ejecutar un test específico:*
   ```powershell
   npx.cmd playwright test -g "Nombre del Test"
   ```

---

## 3. Mapa de Carpetas y Arquitectura

```text
C:\dev\rea\
├── src/
│   ├── core/                  # Núcleo puro: funciones matemáticas, geométricas y descriptores SVG (render.ts).
│   │                          # Sin dependencias de DOM, React, Tauri ni window. Testeable en Node/Vitest puro.
│   ├── services/              # Capa de I/O y adaptadores externos:
│   │                          # - pdfService.ts (PDF.js, render offscreen, rotación y viewport).
│   │                          # - pdfExportService.ts (pdf-lib, inyección vectorial de content stream).
│   │                          # - bbxPersistenceService.ts (.bbx.json 1.1.0, invocación IPC nativa, migrador).
│   │                          # - fileDialogService.ts (diálogos y carga de datos).
│   ├── store/                 # Gestión de estado (Zustand):
│   │                          # - useMarkupStore.ts (marcas, grupos, selección, estado sucio).
│   │                          # - useDocumentStore.ts (PDF cargado, páginas, zoom, rotación).
│   │                          # - useToolStore.ts (herramienta activa, paleta y estilos).
│   │                          # - history/command.ts (gestor de historial Command con tope de 50 pasos).
│   ├── components/            # Capa UI fina en React 18:
│   │                          # - TopBar.tsx (barra de herramientas, botones de acción y paginador).
│   │                          # - PdfViewer.tsx (canvas PDF.js + overlay interactivo SVG + editor inline).
│   │                          # - MarkupsList.tsx (tabla técnica bidireccional inferior).
│   │                          # - ThumbnailsSidebar.tsx (panel lateral colapsable de miniaturas).
│   ├── types/                 # Definición de tipos TypeScript estricto (markup.ts, etc.).
│   └── utils/                 # Utilidades matemáticas y transformaciones (coordinates.ts, dragInteraction.ts).
├── src-tauri/                 # Backend nativo en Rust (Tauri 2):
│   ├── src/lib.rs             # Comandos atómicos write_bbx (.tmp + sync_all + rename) y read_bbx.
│   └── Cargo.toml             # Configuración del paquete Rust.
├── scripts/                   # Scripts de desarrollo y automatización sin dependencias extra:
│   ├── make-fixture.ts        # Generador determinista de planos PDF de prueba sintéticos.
│   └── verify.mjs             # Runner multiplataforma de verificación en cadena.
├── fixtures/                  # Planos PDF sintéticos generados internamente con sus metadatos conocidos.
├── public/                    # Activos estáticos web y fixtures expuestos al servidor de desarrollo.
├── tests/                     # Suites de prueba E2E (tests/e2e/pdf-viewer.spec.ts).
├── docs/                      # Documentación viva y control de alcance:
│   ├── STATUS.md              # Estado real sin adornos de cada fase y sub-entregable.
│   ├── SCOPE.md               # Límites IN y OUT del proyecto por fase.
│   └── DECISIONS/             # Registros de decisiones arquitectónicas (ADR-XXXX).
├── AGENTS.md                  # Reglas críticas de gobernanza técnica, políticas de activos y DoD.
├── CLAUDE.md                  # Este archivo de notas operativas y comandos de desarrollo.
├── ATTRIBUTION.md             # Inventario exhaustivo de activos y licencias con hash SHA-256.
├── PARITY.md                  # Matriz de paridad funcional vinculada al test exacto que la prueba.
└── ROADMAP.md                 # Plan maestro de fases, bloques e hitos técnicos.
```

---

## 4. Convenciones Operativas Clave

1. **Evitar Ejecución de `npm.ps1`:** En Windows PowerShell, invocar explícitamente `npm.cmd` o `node scripts/verify.mjs` para evitar el bloqueo del sistema por políticas de ejecución de scripts (`ExecutionPolicy`).
2. **Cero Warnings de Propiedades DOM:** Al manipular SVG o HTML dinámico en React, usar siempre identificadores camelCase (`strokeWidth`, `strokeDasharray`, etc.) mediante mapeos como `normalizeSvgAttrs`.
3. **Escritura Atómica Obligatoria:** Nunca escribir directamente sobre archivos de persistencia de usuario sin pasar por el esquema de fichero temporal (`.tmp`) con sincronización física de buffers (`sync_all`) y reemplazo atómico (`rename`).
4. **Commits Granulares:** Un commit por sub-entregable completado, prefijado por su identificador de hito (ej. `P2-A.0: ...`, `P2-A.1: ...`).
