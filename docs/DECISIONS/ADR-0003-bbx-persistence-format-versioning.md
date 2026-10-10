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
