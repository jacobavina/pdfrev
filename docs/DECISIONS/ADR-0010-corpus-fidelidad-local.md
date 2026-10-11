# ADR-0010: Corpus de Fidelidad Local para Evaluación de Motores PDF (D-11)

- **Estado:** Aceptado (aprobado por el usuario, D-11, 2026-10-11)
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA

---

## 1. Contexto

La evaluación empírica y cuantitativa de motores PDF para REA (Hito P3-A.1, decisión D-10) requiere someter a las distintas alternativas de motor (Actual ampliado, Núcleo propio en Rust, Crates de pdfcraft, PDFium) a una batería extensa de documentos PDF con características estructurales diversas: tablas xref clásicas y xref streams, object streams comprimidos, linearización, rotaciones de página, anotaciones complejas, firmas digitales y archivos cifrados.

Sin embargo, la directriz de gobernanza `AGENTS.md` §1 ("Política de activos, absoluta y sin excepciones") prohíbe de forma terminante commitear o distribuir cualquier documento PDF de prueba ajeno, propietario o de origen no trazable. Los documentos de prueba del repositorio deben ser generados deterministamente por el proyecto o contar con licencias permisivas explícitas, autoría documentada y control estricto de hashes en `ATTRIBUTION.md`.

Para solventar este dilema sin comprometer el rigor de las pruebas ni relajar la política de activos del repositorio, el usuario aprobó en la decisión **D-11 (2026-10-11)** una política dual de corpus: fixtures sintéticos propios versionados y un corpus externo masivo estrictamente local, gobernado mediante un manifiesto versionado.

---

## 2. Decisión

Se adopta la siguiente política de corpus de fidelidad para el spike de motor y futuros arneses de interoperabilidad de la Fase 3:

### 2.1 Fixtures Sintéticos Propios (Versionados en Git)
1. Los archivos PDF generados por el script determinista propio `spikes/motor/scripts/make-synthetic-fixtures.mjs` que posean un tamaño reducido ($\le 100\text{ KB}$) se versionan directamente en el repositorio dentro de `spikes/motor/fixtures/`.
2. Estos fixtures cubren casos estructurales mínimos controlados:
   - `classic-xref.pdf`: Tabla xref estándar (PDF 1.4).
   - `xref-stream.pdf`: Stream binario de referencias cruzadas (PDF 1.5).
   - `object-streams.pdf`: Objetos agrupados y comprimidos en `/ObjStm`.
   - `linearized.pdf`: Diccionario `/Linearized 1.0` en cabecera para fast web view.
   - `with-annots.pdf`: Diccionario `/Annots` preexistente con anotaciones gráficas.
   - `simulated-signature.pdf`: Campo `/Sig` y `/AcroForm` con firma digital estructural simulada (sin criptografía).
   - `rotated-90.pdf`: Página con orientación visual `/Rotate 90`.
   - `cropbox-mediabox.pdf`: Discrepancia intencional entre área física (`MediaBox`) y área visible (`CropBox`).
3. **Fixtures pesados regenerables:** Los fixtures sintéticos de gran tamaño o densidad (`sheet-e-dense.pdf`, `pages-300.pdf` y `large-100mb.pdf`) se generan deterministamente mediante el mismo script pero quedan estrictamente excluidos de control de versiones a través de `.gitignore`.

### 2.2 Corpus Externo Masivo Local (Excluido de Git)
1. Para medir robustez de apertura y render sobre casos reales y fuzzeados, se utiliza la suite de pruebas del proyecto de código abierto Mozilla PDF.js (`test/pdfs/`).
2. **Descarga local automatizada:** El script `spikes/motor/scripts/download-pdfjs-corpus.mjs` descarga los archivos reales `.pdf` (excluyendo enlaces `.link` a URLs de terceros) en una carpeta local `corpus/pdfjs/`.
3. **Fijación de versión (Pinning):** Se fija estrictamente el commit de origen del repositorio `mozilla/pdf.js` (`881eb97f9413f57104dd43b55fa1cc5457fb54fe`).
4. **Exclusión absoluta de Git:** El directorio `corpus/` se añade a `.gitignore`. Ningún archivo PDF externo se añade jamás a Git ni se empaqueta en los instaladores de producción de REA.
5. **Manifiesto de integridad versionado:** La trazabilidad de los archivos locales se garantiza mediante `spikes/motor/corpus-manifest.json`, el cual se versiona y registra:
   - URL del repositorio origen y commit exacto.
   - Licencia del repositorio origen (`Apache-2.0`).
   - Lista completa de archivos con tamaño en bytes, suma criptográfica SHA-256 y detección estructural de cifrado (`/Encrypt`).
6. **Archivos cifrados:** La presencia de directivas de cifrado (`/Encrypt`) se detecta analíticamente en el manifiesto (25 archivos cifrados identificados en el corpus), permitiendo evaluar el soporte de cifrado de cada motor sin requerir utilidades externas del sistema como `qpdf`.

---

## 3. Consecuencias y Cumplimiento

1. **Alineación con AGENTS.md §1:** Ningún byte ajeno o de terceros entra al árbol de Git ni se distribuye con el producto.
2. **Determinismo y reproducibilidad:** Cualquier colaborador o agente puede reconstruir exactamente el mismo conjunto de prueba ejecutando `node spikes/motor/scripts/download-pdfjs-corpus.mjs` y `node spikes/motor/scripts/make-synthetic-fixtures.mjs`.
3. **Validez técnica:** El manifiesto permite contrastar los resultados de pruebas métricas (M1, M4) contra 990 archivos PDF reales de amplio espectro técnico sin violar ninguna directriz legal ni de gobernanza.
