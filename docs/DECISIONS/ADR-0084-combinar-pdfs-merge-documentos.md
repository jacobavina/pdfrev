# ADR-0084: Combinar Documentos PDF (Merge PDF) con Reordenación y Apertura en Pestaña

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Autor:** Jacob Aviña / Antigravity
- **Hito:** Fase C (Documento, Navegación y Páginas — P5-C.3 / C.3)
- **Decisión anterior:** ADR-0083 (Pestañas multi-documento con sesiones independientes) y ADR-0082 (Reordenación de páginas con drag & drop).

---

## Contexto y Necesidad de Producto

En Bluebeam Revu 21, la capacidad de unir múltiples planos, especificaciones y adendas en un único juego de planos consolidado (**File ▸ Combine...** / **Document ▸ Pages ▸ Combine...**) es una función crítica para contratistas generales, subcontratistas y oficinas técnicas:
- Permite recibir planos de arquitectura, estructura e instalaciones como archivos separados y ensamblarlos en un único PDF ordenado.
- El usuario debe poder agregar varios archivos, reorganizar su orden de aparición hacia arriba o hacia abajo, definir el nombre del archivo de salida y generar el documento combinado.
- El documento resultante debe abrirse inmediatamente como una pestaña nueva e independiente (aprovechando la arquitectura de pestañas de ADR-0083), con sus páginas accesibles en el panel de miniaturas (`ThumbnailsSidebar`) y listo para su calibración y marcado sin sobreescribir los documentos ya abiertos.

---

## Decisiones Técnicas

### 1. Función Pura de Combinación (`mergePdfDocuments`)
En `src/core/pages/pageOperations.ts`:
- Se define la interfaz `MergeSourceDocument`:
  ```ts
  export interface MergeSourceDocument {
    name: string;
    bytes: Uint8Array;
    pageIndices?: number[];
  }
  ```
- La función `mergePdfDocuments(sources: MergeSourceDocument[]): Promise<Uint8Array>`:
  1. Valida que exista al menos un documento (`sources.length > 0`).
  2. Carga `PDFDocument` de `pdf-lib` de forma asíncrona mediante importación dinámica para no penalizar el bundle inicial.
  3. Crea un nuevo documento contenedor `mergedDoc = await PDFDocument.create()`.
  4. Para cada archivo fuente:
     - Carga el documento origen ignorando posibles cifrados no restrictivos (`ignoreEncryption: true`).
     - Valida los índices de página solicitados (o incluye todas las páginas por defecto).
     - Copia las páginas mediante `mergedDoc.copyPages(srcDoc, indices)`.
     - Añade cada página copiada al documento destino (`mergedDoc.addPage(page)`).
  5. Serializa y devuelve los bytes finales del PDF unificado (`await mergedDoc.save()`).

### 2. Orquestación del Servicio (`executeCombineDocuments`)
En `src/services/pageService.ts`:
- Invoca `mergePdfDocuments` con la lista de archivos seleccionados.
- Al obtener los bytes resultantes, delega en `loadPdfData` (`fileDialogService.ts`).
- Gracias a la arquitectura de ADR-0083, `loadPdfData` registra automáticamente el nuevo PDF como una nueva pestaña en `useDocumentTabsStore`, activándola en el espacio de trabajo sin interferir con las pestañas preexistentes.
- Emite una notificación toast confirmando el número de documentos y páginas unificadas.

### 3. Diálogo de Interfaz (`CombinePdfsModal.tsx`)
En `src/components/modals/CombinePdfsModal.tsx`:
- Diálogo modal con diseño Revu 21:
  - Cabecera con icono `Layers` (`size={16}`), título "Combine PDF Files" y botón de cierre `X` (`size={16}`).
  - Botón "Add Files…" que invoca el diálogo de selección múltiple nativo en Tauri (`@tauri-apps/plugin-dialog` con `multiple: true`) o el selector HTML múltiple en navegador.
  - Tabla interactiva con el orden de los archivos, nombre, conteo de páginas y botones de acción por fila:
    - `ChevronUp` (mover arriba).
    - `ChevronDown` (mover abajo).
    - `Trash2` (eliminar de la lista).
  - Resumen en tiempo real del total de archivos y páginas a combinar.
  - Campo de entrada editable para el nombre del archivo resultante (por defecto: `Combined Document.pdf`).
  - Botón primario "Combine" con estado de carga ("Combining…") y atajo de teclado Escape para cancelar.
  - Cumplimiento estricto del sistema de diseño (tokens `cad-panel`, `cad-dark`, `cad-border`, `cad-accent`, escala tipográfica 11/12/13/14/16 px, iconos de 16 px y ausencia de sombras no permitidas).

### 4. Integración en Menú y Carga Perezosa
- En `MenuBar.tsx`: entrada **File ▸ Combine Files...** con icono `Layers` (`size={16}`).
- En `App.tsx`: `CombinePdfsModal` se importa de forma perezosa (`React.lazy`) y se renderiza condicionalmente bajo `Suspense` cuando `combineModalOpen` es `true`.
- Esto garantiza que el tamaño del chunk principal se mantenga estrictamente $\le 800.00$ kB.

---

## Consecuencias y Verificación

1. **Paridad Alcanzada:** REA soporta la combinación de documentos PDF con control de orden e integración en el flujo de trabajo multi-documento.
2. **Preservación del Bundle:** `CombinePdfsModal` y `pdf-lib` residen en fragmentos bajo demanda, manteniendo el chunk principal en 776.93 kB (umbral: 800.00 kB).
3. **Pruebas Automatizadas:**
   - 4 pruebas unitarias de motor en `src/core/pages/pageOperations.test.ts`.
   - 2 pruebas de servicio en `src/services/pageService.test.ts`.
   - 4 pruebas de componente en `src/components/modals/CombinePdfsModal.test.tsx`.
   - 9 pruebas de sistema de diseño en `src/designScale.test.ts`.
