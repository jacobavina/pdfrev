# ADR-0013: Persistencia Incremental en PDF y Modelo de Anotaciones ISO 32000-1

- **Estado:** Aceptado (alineado con ADR-0011 Opción A, 2026-10-11)
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA
- **Relacionado con:** [ADR-0003](./ADR-0003-bbx-persistence-format-versioning.md), [ADR-0011](./ADR-0011-motor-pdf.md), [08-plan-orquestador.md](#)

---

## 1. Contexto

Para alcanzar paridad funcional con Bluebeam Revu e interoperabilidad con el ecosistema de ingeniería y arquitectura, REA debe persistir marcas directamente en el archivo PDF sin destruir firmas digitales previas, sin corromper la estructura interna del documento y permitiendo que visores externos (Acrobat, Bluebeam Revu, macOS Preview, visores web) visualicen fielmente los marcados técnicos.

El spike de motor P3-A.1 evaluó cuatro arquitecturas y ratificó la **Opción A (ADR-0011)**:
1. Renderizado base con PDF.js (con `AnnotationMode.DISABLE` para capa gráfica limpia sin duplicidad).
2. Capa interactiva de marcas desarrollada en React/SVG/Canvas.
3. Escritor incremental tipado en TypeScript para generar las actualizaciones estándar ISO 32000-1 §7.5.6.
4. Comando nativo Rust `save_pdf` con escritura atómica (`.tmp` + `sync_all` + `rename`) y copia de respaldo `.rea-backup`.

---

## 2. Decisión

### 2.1 Invariante Dura de Preservación de Bytes
Bajo ISO 32000-1 §7.5.6 (Incremental Updates), el escritor incremental (`IncrementalWriter`) nunca modifica los bytes originales del PDF. Se impone la siguiente invariante matemática y de prueba:
$$\text{output}[0 \dots \text{origLen}] \equiv \text{originalBytes}[0 \dots \text{origLen}]$$
Toda nueva anotación, diccionario de apariencia (`/AP /N`), modificación del array `/Annots` de página, tabla de referencias cruzadas (`xref`) y diccionario `trailer` con referencia `/Prev` se añade exclusivamente al final del archivo.

### 2.2 Mapeo Estándar de Anotaciones ISO 32000-1 y Flujos de Apariencia (`/AP`)
Cada marca de REA se traduce a una anotación PDF estándar con su correspondiente Form XObject de apariencia (`/AP /N`):
- `rectangle` $\rightarrow$ `/Subtype /Square`
- `circle` $\rightarrow$ `/Subtype /Circle`
- `line` $\rightarrow$ `/Subtype /Line` con `/L [x1 y1 x2 y2]`
- `polygon` $\rightarrow$ `/Subtype /Polygon` con `/Vertices [...]`
- `polyLine` $\rightarrow$ `/Subtype /PolyLine` con `/Vertices [...]`
- `cloud` / `cloudPlus` $\rightarrow$ `/Subtype /Polygon` con `/BE << /S /C /I 1 >>`
- `callout` $\rightarrow$ `/Subtype /FreeText` con `/IT /FreeTextCallout` o texto de directriz
- `stickyNote` $\rightarrow$ `/Subtype /Text` con `/Name /Note`
- `text` $\rightarrow$ `/Subtype /FreeText` con `/DA (/Helv size Tf ...)`
- `freehand` $\rightarrow$ `/Subtype /Ink` con `/InkList [...]`
- `highlightVector` / `highlightText` $\rightarrow$ `/Subtype /Highlight` con `/QuadPoints [...]`

### 2.3 Metadatos Propios REA (`/REA`) y Estados de Revisión (`/StateModel`)
1. **Diccionario `/REA`:** Cada anotación incorpora un diccionario privado `/REA << /v 1 /tool (...) /arcStep N /fields << ... >> >>` que almacena los metadatos específicos de REA sin interferir con otros visores.
2. **Estados de Revisión Estándar:** Para estados de revisión (`accepted`, `rejected`, `completed`, `cancelled`), se generan anotaciones hijas estándar `/StateModel (Review)` con enlace `/IRT` a la marca padre y `/RT /R`, garantizando que Bluebeam Revu y Adobe Acrobat reconozcan los cambios de estado en sus paneles de marcas nativos.

### 2.4 Render Dual Limpio
Para evitar la doble renderización (duplicidad visual cuando PDF.js dibuja una anotación incrustada y simultáneamente REA dibuja el overlay interactivo), el visor PDF.js se configura formalmente con:
```ts
annotationMode: 0 // pdfjsLib.AnnotationMode.DISABLE
```
REA toma control total de la visualización, selección, redimensionamiento y edición interactiva de las marcas.

### 2.5 Comando Nativo `save_pdf` en Rust
La persistencia física en disco en el entorno de escritorio Tauri 2 delega en el comando Rust `save_pdf`:
1. Verifica ruta absoluta y extensión obligatoria `.pdf`.
2. Genera copia de seguridad automática `<nombre>.pdf.rea-backup` la primera vez por sesión si el archivo original existe.
3. Realiza escritura en archivo temporal `<nombre>.pdf.tmp`, sincroniza con `sync_all()`, y reemplaza atómicamente con `rename()`.

---

## 3. Consecuencias y Verificación

1. **Interoperabilidad bidireccional:** Un PDF anotado en REA se abre en Bluebeam Revu o Adobe Acrobat mostrando las geometrías exactas (`/AP`), autores (`/T`), comentarios (`/Contents`), colores y estados de revisión.
2. **Cero corrupción de archivos:** La escritura incremental previene cualquier alteración a estructuras preexistentes, firmas digitales o flujos comprimidos del documento original.
3. **Respaldo automático:** Si la energía falla o el proceso se interrumpe, el archivo original permanece intacto gracias al renombrado atómico y la copia `.rea-backup`.
4. **Verificación automatizada:** Pruebas unitarias de ida y vuelta en `operators.test.ts`, `incrementalWriter.test.ts`, `annotationReader.test.ts` y pruebas atómicas de Rust en `src-tauri/src/lib.rs`.
