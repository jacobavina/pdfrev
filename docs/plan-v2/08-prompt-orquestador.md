Trabajas en C:\dev\rea (REA: editor PDF para planos de construcción e ingeniería que reimplementa las FUNCIONES de Bluebeam Revu;
Tauri 2 + React 18 + TypeScript + Vite + PDF.js + pdf-lib + Zustand + Vitest + Playwright; backend Rust en src-tauri). Idioma: español.
Windows (PowerShell). Entorno en cada comando: $env:PATH = "C:\Program Files\nodejs;C:\Users\jmm_j\.cargo\bin;$env:PATH"; $env:NODE_OPTIONS = "--use-system-ca"

MODO DE TRABAJO — ORQUESTADOR AUTÓNOMO:
1) Usa el skill /plan de Antigravity con TODA esta especificación para generar el plan de implementación y la lista de tareas (si /plan no
   existe en tu entorno, genera un artefacto de plan equivalente). Guarda el plan en docs/plan-v2/08-plan-orquestador.md y una copia literal de este
   prompt en docs/plan-v2/08-prompt-orquestador.md (primer commit).
2) EJECUTA el plan de principio a fin SIN pedir confirmación entre tareas. Solo te detienes por los BLOQUEOS listados al final.
3) Al terminar, entrega UN informe final. Un auditor independiente verificará cada afirmación contra el disco, git y los logs: no inventes nada.

LEE ANTES: AGENTS.md (manda sobre todo), CLAUDE.md, docs/STATUS.md, docs/plan-v2/README.md, 02-arquitectura-interop.md, 03-plan-por-fases.md,
07-estrategia-de-motor-y-completitud.md, docs/perf/SPIKE-MOTOR.md, docs/DECISIONS/ADR-0011-motor-pdf.md. Comprueba git status limpio
(HEAD esperado 647b1e0 o posterior); si no está limpio, DETENTE.

DECISIONES APROBADAS POR EL USUARIO AL ENTREGARTE ESTE PROMPT (2026-10-11):
 - ADR-0011: opción A ahora (PDF.js para render + escritor de actualización incremental propio); crates de pdfcraft detrás de una façade en Fase 7.
   Cambia su estado a "Aceptado" con esta fecha.
 - D-1: el PDF es la fuente de verdad (anotaciones PDF estándar con /AP); el .bbx.json queda como autoguardado/recuperación y metadatos de REA.
 - D-2: camino A′ (cerrar Bloque C con C.4, C.5 y C.6; Capas/Sellos pasan a Fase 3). D-3: inspector de propiedades (P2-C.6) aprobado.
 - Con estas aprobaciones SÍ puedes actualizar docs/SCOPE.md, ROADMAP.md, docs/STATUS.md y PARITY.md según docs/plan-v2/04 §1 (sin relajar AGENTS.md).

OBJETIVO DE ESTA EJECUCIÓN: que el usuario pueda ABRIR la app y trabajar con un conjunto útil de funciones de Revu. Ejecuta los paquetes EN ORDEN;
cada paquete debe dejar la app funcionando y la suite verde, de modo que, si te bloqueas, lo ya terminado sea usable.

PAQUETE 0 — Contabilidad (solo docs): aplica las decisiones anteriores en SCOPE/ROADMAP/STATUS/PARITY/ADR-0011; .gitignore para logs del orquestador
 (.orquestador/). Commit "docs(z.1): aprobar opcion A, D-1, D-2 y D-3 y alinear documentos".

PAQUETE 1 — Cerrar Bloque C (03 §2):
 - P2-C.4 Exportación: CSV RFC 4180 con BOM UTF-8 y CRLF, mitigación de inyección de fórmulas, respeta filtro/orden/columnas (incluidas personalizadas);
   Reporte Resumen en PDF con pdf-lib (totales por estado/autor/tipo + tabla). Diálogo "Guardar como" nativo; escritura vía comando Rust atómico con
   lista blanca de extensiones (.csv .pdf). Tests que leen los BYTES reales.
 - P2-C.6 Inspector de propiedades: panel de la selección (color de trazo, relleno, grosor, opacidad, guiones, tamaño de fuente, texto, estado), valores
   mixtos como "—", UN comando atómico con undo por cambio, sin NaN. Requiere ADR nuevo (siguiente número libre).
 - Botón Guardar y atajo Ctrl+S (hoy NO existe Ctrl+S; compruébalo y créalo).
 - P2-C.5: E2E del bloque. Cierra el Bloque C en STATUS/PARITY (verificación nativa PENDIENTE del usuario).

PAQUETE 2 — Interoperabilidad: marcas como anotaciones PDF reales (02 §2–§7; 03 §3 bloques B, C, D y E.1). Es el hito más importante.
 - Extrae un emisor PURO de operadores (src/core/pdf/) desde pdfExportService SIN cambiar la salida del "Exportar PDF" aplanado (sus tests de oro no se
   modifican). Úsalo para generar /AP.
 - Escritura de anotaciones estándar para los 14 tipos según la tabla de 02 §3 (Square, Circle, Line, Polygon/PolyLine, FreeText y callout con /CL,
   Text, Ink, Highlight con /QuadPoints, nube con /BE + /AP, grupos con /IRT /RT /Group), con /NM = id, /T, /Contents, fechas, /F 4 y clave /REA
   con los datos propios (arcStep, groupId, customFields...). Toma como base spikes/motor/opcion-a/incremental-writer.mjs pero REESCRÍBELO como código
   de producción tipado y probado en src/core/pdf/ (no lo copies sin tests).
 - Guardar en el PDF: actualización INCREMENTAL (bytes originales intactos) + comando Rust save_pdf atómico (.tmp + sync_all + rename; ruta absoluta;
   extensión .pdf; copia de seguridad <nombre>.pdf.rea-backup la primera vez por sesión; validación ANTES del rename: reabrir con pdf-lib y PDF.js y
   comprobar páginas y nº de anotaciones). Transporta los bytes por IPC binario de Tauri 2 (no como array JSON). PDF cifrado o firmado: no sobrescribir;
   ofrecer "Guardar como copia" con aviso.
 - Lectura: al abrir, importa las anotaciones del PDF (propias por /REA con máxima fidelidad; foráneas soportadas best-effort; no soportadas se
   conservan intactas y se listan como solo lectura). Render en dos capas: page.render con AnnotationMode.DISABLE y el overlay de REA dibuja todas (sin
   duplicados; test de píxeles). Copy-on-write: una anotación foránea no editada se conserva byte a byte.
 - Estados de revisión estándar (/StateModel Review; pending = None) leídos y escritos.
 - Autoguardado: sigue escribiendo el sidecar .bbx.json (recuperación). Guardar/Ctrl+S escribe el PDF. Aviso al cerrar con cambios sin guardar en el PDF.
 - "Exportar PDF" aplanado se conserva tal cual.
 - Pruebas: dorados de diccionarios y /AP (leídos de bytes reales), ida y vuelta exportar→importar = identidad (4 rotaciones, CropBox != MediaBox),
   preservación de foráneas (diff de bytes cero), Rust (atomicidad, backup, rechazo de extensión), E2E de guardar→reabrir.
 - Genera plan/interop/muestra-rea.pdf (desde un fixture SINTÉTICO) con un ejemplo de cada tipo, estados y un grupo, para que el usuario lo abra en Revu y
   Acrobat. Tú no declaras compatibilidad.

PAQUETE 3 — Herramientas de Revu que faltan (03 §3 bloque H): flecha y línea con extremos; polilínea abierta; subrayado y tachado de texto (reutiliza el
 TextLayer de A.6); copiar/pegar/duplicar (también entre páginas); bloquear marca. Cada una con su anotación estándar, atajo, undo atómico y tests.

PAQUETE 4 — Medición básica para takeoff (03 §4, subconjunto): calibración por página (dos puntos + distancia real; unidades m, cm, mm, ft, in; guardas
 contra 0/NaN; indicador de escala visible); herramientas Longitud, Polilínea (longitud total), Área con perímetro, y Conteo; columnas Medida/Unidad en
 la lista de marcas y totales por tipo; incluidas en la exportación CSV. Persistir en /REA y, si es viable, en /Measure estándar. Test de oro: el
 rectángulo conocido de fixtures (300x200 pt) mide exactamente lo esperado a una escala dada, en las 4 rotaciones y a cualquier zoom.

PAQUETE 5 — SOLO si P0–P4 están cerrados y verdes: búsqueda de texto con resaltado y navegación; operaciones de página (rotar, eliminar, insertar en blanco,
 extraer) con remapeo de pageIndex de marcas y de /Annots.

ENTREGA EJECUTABLE (obligatoria al final):
 - Ejecuta npx.cmd tauri build --no-bundle para generar src-tauri\target\release\app.exe (si falla, usa npm.cmd run test:native:build, que deja
   src-tauri\target\smoke\app.exe). Indica la ruta exacta del .exe que el usuario puede abrir con doble clic.
 - Ejecuta el smoke nativo (npm.cmd run test:native) si el entorno lo permite; si no, decláralo.

REGLAS NO NEGOCIABLES (AGENTS.md manda):
 1. Por cada hito: tests nuevos que puedan fallar (demuestra en rojo los clave), node scripts/verify.mjs en verde, y E2E 3 pasadas consecutivas
    (node scripts/verify.mjs --with-e2e --e2e-loop 3 --log-dir tests/e2e-logs) cuando el hito cambie un flujo de usuario. No se commitea en rojo.
 2. Un commit por hito con el id en el mensaje, git add EXPLÍCITO (nunca -A). El conteo de tests nunca baja.
 3. Guarda la salida completa de cada comando de verificación en .orquestador/logs/<hito>-<paso>.log (Tee-Object). Tu informe cita esos logs; PROHIBIDO
    escribir listas, nombres de tests, atajos o cifras que no estén en un log o en el código. Agentes anteriores inventaron listas de tests y atajos:
    eso invalida la entrega.
 4. Nada de eval/new Function; TypeScript estricto sin any ni @ts-ignore; nunca fallar en silencio; toda escritura en disco atómica.
 5. Ningún activo de terceros; fixtures solo sintéticos o del corpus local ignorado (ADR-0010). Nunca commitees PDFs ajenos ni binarios.
 6. PARITY.md: una fila pasa a shipped solo con test existente (nombre copiado del archivo); la columna nativa queda "PENDIENTE DE VERIFICAR por el
    usuario". STATUS.md se actualiza al cerrar cada paquete con conteos COPIADOS de la salida real.
 7. No instales software de sistema. qpdf no está instalado: no lo uses.

BLOQUEOS (únicos motivos para detenerte y preguntar): necesidad de instalar software de sistema o descargar binarios; una decisión de producto no
cubierta aquí; riesgo de perder datos del usuario. Si un hito no logra verde tras 3 intentos serios: descarta SOLO sus cambios sin commitear
(git restore/git clean de sus archivos), márcalo "BLOQUEADO: <motivo>" en STATUS.md y sigue con el siguiente hito independiente.

INFORME FINAL (generado desde git y los logs, no de memoria):
 (a) git log --oneline desde 647b1e0 y git show --stat de cada commit (literal);
 (b) por hito: estado (cerrado/bloqueado), tests añadidos, ruta del log de verify y de las 3 pasadas E2E;
 (c) conteo de tests antes (357) y después, copiado de la salida;
 (d) ruta exacta del .exe para abrir la app;
 (e) UNA sola lista de verificación para el usuario, agrupada: en la app (paso a paso, con textos de UI y data-testid copiados del código) y en
     Revu/Acrobat (abrir plan/interop/muestra-rea.pdf y un PDF guardado por REA: qué debe verse y poder editarse);
 (f) lo no hecho o bloqueado, con motivo.
