# ADR-0003: Formato de Persistencia `.bbx.json` Versionado (1.1.0) y Migrador

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Autores:** Equipo REA

---

## 1. Contexto
La persistencia de anotaciones de revisión arquitectónica debe ser interoperable, portable y desacoplada del archivo PDF original para permitir revisiones concurrentes sin alterar los planos certificados con firma digital. Si el formato de serialización no está versionado o no incluye validación de esquema, la evolución del software entre fases (ej. agregar `groupId`, `customFields` o nuevos tipos de marca) provocará corrupción silenciosa o rechazo de archivos antiguos.

---

## 2. Alternativas Consideradas
1. **Incrustar directamente en el PDF como anotaciones estándar (FDF / XFDF):** Descartado para la persistencia de trabajo diaria. Requiere re-guardar el PDF entero en cada edición, invalida firmas digitales previas y pierde metadatos CAD especializados de REA.
2. **JSON libre sin versionar:** Descartado. Altamente vulnerable a roturas de compatibilidad ante cualquier refactorización.
3. **Archivo de formato propio `.bbx.json` con cabecera de versión semántica (1.1.0) y migrador canónico:** Cada archivo almacena su versión explícita y se valida en frontera con la función `migrateBbxDocument`.

---

## 3. Decisión
Definir la estructura de archivo hermano `<nombre-plano>.bbx.json` bajo la especificación `BbxDocumentFile` versión `1.1.0`, canalizando toda lectura obligatoriamente a través de `migrateBbxDocument`.

Anclas de implementación verificadas:
- En `src/types/markup.ts` (línea 1, array constante `VALID_MARKUP_TYPES`).
- En `src/types/markup.ts` (línea 57, definición de `interface Markup`).
- En `src/types/markup.ts` (líneas 98-99, definición de `interface BbxDocumentFile` con campo `version: '1.1.0'`).
- En `src/types/markup.ts` (línea 112, función `migrateBbxDocument`).
- En `src/types/markup.ts` (línea 238, serialización con versión escrita `1.1.0`).
- En `src/services/bbxPersistenceService.ts` (línea 117, lectura canalizada por `migrateBbxDocument`).
- En `src/services/bbxPersistenceService.ts` (línea 179, escritura con encabezado de versión `1.1.0`).

---

## 4. Consecuencias
- **Positivas:** Compatibilidad retroactiva garantizada entre versiones; archivos con coordenadas corruptas o tipos inexistentes son detectados y saneados o rechazados ruidosamente; soporte nativo para campos avanzados como `groupId` y `customFields`.
- **Negativas / Mitigaciones:** Cualquier adición al modelo de datos requiere registrar el caso de migración en `migrateBbxDocument` y acompañarla de su test unitario.

---

## 5. Evidencia
- En `src/services/bbxPersistenceService.test.ts`, tests unitarios comprueban la migración exitosa de esquemas 1.0.0 a 1.1.0 y el rechazo explícito de versiones no compatibles.

---

## 6. Addendum 2026-10-10: Endurecimiento del Migrador (Hito Z.2)

- **Contexto:** Identificada degradación silenciosa de datos en `migrateBbxDocument`: ausencia de `customColumns` en el esquema tipado `BbxDocumentFile`, omisión de validación en `Markup.customFields`, y degradación muda de tipos y estados no reconocidos hacia valores por defecto (`rectangle` y `pending`).
- **Decisión:**
  1. Extender `BbxDocumentFile` con la propiedad opcional `customColumns?: BbxCustomColumn[]`, sujeta a validación estricta de identificadores, nombres y tipos admitidos (`BbxCustomColumnType`). Columnas inválidas se descartan y generan advertencia.
  2. Endurecer la validación de `Markup.customFields`: admisión exclusiva de valores `string` (longitud acotada $\le 2000$ caracteres) y `number` estrictamente finitos (`Number.isFinite`), descartando claves vacías, excesivas o reservadas/peligrosas (`__proto__`, `constructor`, `prototype`).
  3. Modificar la firma de retorno de `migrateBbxDocument` para devolver `BbxMigrationResult { document: BbxDocumentFile; warnings: string[] }`.
  4. Los avisos por degradación de tipo/estado o descarte de campos/columnas inválidos se propagan a través de `loadBbxForPdf` y se notifican en la interfaz de usuario mediante `toastService` al abrir el documento.
  5. La versión del esquema se mantiene en `1.1.0`, ya que se trata de una extensión de compatibilidad aditiva y opcional; versiones incompatibles (ej. $\ge 2.0.0$) continúan lanzando excepción controlada.
- **Evidencia:** Cobertura de pruebas unitarias en `src/types/markup.test.ts` y pruebas de persistencia sobre fichero real en `src/services/bbxPersistenceService.test.ts` y `src/services/fileDialogService.test.ts`.

- **Tipos Canónicos y Límites de Cantidad (Hito Z.2b):**
  1. El conjunto canónico de tipos de columna (`BbxCustomColumnType`) se fija en `{'text', 'number', 'choice', 'formula'}`. El migrador admite alias en español (`texto`, `número`, `numero`, `opción`, `opcion`, `calculada`) como entrada y los normaliza automáticamente al canónico sin generar avisos. Solo se persisten y retienen en memoria los tipos canónicos.
  2. Se establecen límites cuantitativos estrictos: `MAX_CUSTOM_COLUMNS = 50` columnas por documento y `MAX_CUSTOM_FIELDS_PER_MARKUP = 50` campos por marca, emitiendo un único aviso agregado si se superan los topes y conservando los primeros elementos válidos.
  3. `customColumns` se preserva de extremo a extremo a través del store de documento (`useDocumentStore`) hacia el hook de autoguardado (`useAutoSave`), y las notificaciones de apertura se agrupan en un único toast resumen (`summarizeMigrationWarnings`) para evitar sobrescrituras en la UI.
