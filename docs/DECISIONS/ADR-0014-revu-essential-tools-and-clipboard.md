# ADR-0014: Herramientas Esenciales de Bluebeam Revu, Portapapeles y Protección de Bloqueo

- **Estado:** Aceptado
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA
- **Relacionado con:** [ADR-0003](file:///C:/dev/rea/docs/DECISIONS/ADR-0003-modelo-marcas-y-geometria.md), [ADR-0007](file:///C:/dev/rea/docs/DECISIONS/ADR-0007-optimizacion-renderizado-marcas.md), [ADR-0011](file:///C:/dev/rea/docs/DECISIONS/ADR-0011-motor-pdf.md), [08-plan-orquestador.md](file:///C:/dev/rea/docs/plan-v2/08-plan-orquestador.md)

---

## 1. Contexto

Para consolidar la paridad de funciones operativas con Bluebeam Revu según la especificación del Paquete 3 del Plan Maestro (`08-plan-orquestador.md`), REA requería incorporar un conjunto de capacidades estándar indispensables en el flujo de trabajo de planos de ingeniería y arquitectura:

1. **Extremos de Línea Configurables (`/LE`):** Posibilidad de fijar de manera independiente la terminación inicial y final de líneas y flechas (`openArrow`, `closedArrow`, `circle`, `square`, `diamond`, `none`).
2. **Polilínea Abierta (`polyLine`):** Capacidad de trazar caminos continuos de múltiples vértices sin forzar el cierre geométrico del polígono.
3. **Herramientas de Texto de Marcado (`underline`, `strikeOut`):** Anotaciones de subrayado y tachado textual acordes a la norma ISO 32000-1.
4. **Portapapeles Técnico y Duplicación (`Ctrl+C`, `Ctrl+V`, `Ctrl+D`):** Flujo de copia, pegado con offset de pantalla/página y duplicación inmediata que regenere identificadores únicos preservando relaciones de agrupación (`groupId`).
5. **Bloqueo de Marcas (`locked` / Flag `/F 128`):** Prevención de modificaciones accidentales (movimiento, edición de estilo, borrado) en el lienzo y lista de marcas, persistente en el diccionario PDF.

---

## 2. Decisiones de Diseño

### 2.1 Modelo de Datos y Tipos (`src/types/markup.ts`)
- Se incorporan `'polyLine'`, `'underline'`, `'strikeOut'` a `VALID_MARKUP_TYPES`.
- Se define el tipo estricto `LineEndingStyle = 'none' | 'openArrow' | 'closedArrow' | 'circle' | 'square' | 'diamond'`.
- Se amplía `MarkupStyle` con `lineEndingStart?: LineEndingStyle` y `lineEndingEnd?: LineEndingStyle`.
- Se incorpora el atributo opcional `locked?: boolean` al objeto `Markup`.

### 2.2 Renderizado SVG Puro (`src/core/markup/render.ts`)
- Función pura auxiliar `createLineEndingDescriptor(...)` ubicada en el scope de nivel de módulo para calcular la orientación angular y la geometría de cada marcador terminal (`polyline`, `polygon`, `ellipse`).
- En `case 'line'`, si existen estilos de extremos, el descriptor principal se empaqueta en un nodo `<g>` conteniendo la línea y los descriptores de los marcadores.
- Soporte para `polyLine` generando un descriptor `<polyline>` sin cierre `Z`.
- Soporte para `underline` y `strikeOut` calculando la posición de trazo relativa a la caja delimitadora en espacio de pantalla.

### 2.3 Store, Portapapeles y Bloqueo (`src/store/useMarkupStore.ts`)
- **Portapapeles Interno:** Estado `clipboardMarkups: Markup[]` en Zustand, desacoplado de la API asíncrona del sistema operativo para evitar problemas de permisos de portapapeles en WebView2.
- **Pegado y Duplicación:**
  - `pasteMarkups(targetPageIndex?, offset?)` aplica un desplazamiento por defecto `(+0.02, +0.02)` en coordenadas normalizadas.
  - Genera nuevos UUIDs para cada marca y mapea congruentemente los `groupId` para mantener agrupadas las marcas clonadas.
  - La operación se registra en un único comando de historial transaccional, garantizando reversión con un solo `Ctrl+Z`.
- **Protección de Bloqueo:**
  - Se añade `toggleLockSelectedMarkups()` respaldado por un comando undoable.
  - Las funciones mutadoras de estado (`deleteMarkup`, `deleteSelectedMarkups`, `commitMoveMarkups`, `updateMarkup`, `applyPropertiesToMarkups`) filtran activamente cualquier marca con `locked: true`, imposibilitando la modificación de marcas protegidas tanto desde la UI como programáticamente.
  - El arrastre interactivo en el lienzo (`handleSelectMouseDown`) ignora las marcas bloqueadas.

### 2.4 Persistencia e Interoperabilidad PDF ISO 32000-1
- **Escritor Incremental (`src/core/pdf/incrementalWriter.ts`):**
  - Mapeo de `/Subtype /PolyLine`, `/Subtype /Underline`, `/Subtype /StrikeOut`.
  - Serialización de `/LE [/StartEnding /EndEnding]` estándar para anotaciones de línea.
  - Generación de `/QuadPoints` para subrayado y tachado.
  - Bit 8 del campo de banderas (`/F 132`, con `128` = Locked + `4` = Print) y `/Locked true`.
- **Lector de Anotaciones (`src/core/pdf/annotationReader.ts`):**
  - Lectura e importación simétrica de `/LE` a `style.lineEndingStart` y `style.lineEndingEnd`.
  - Detección de bloqueo si el flag `/F` tiene el bit 128 encendido.
  - Mapeo bidireccional exacto en round-trip de persistencia.

---

## 3. Consecuencias y Verificación

1. **Paridad con Revu:** Se habilitan las herramientas más comunes de revisión arquitectónica y de ingeniería.
2. **Compatibilidad Estándar:** Documentos anotados en REA conservan la apariencia y bloqueo en Adobe Acrobat y Bluebeam Revu sin corrupción de prefijos de bytes.
3. **Calidad y Cobertura:** Suites de Vitest en `useMarkupStore.test.ts`, `render.test.ts`, `operators.test.ts`, `incrementalWriter.test.ts` y `annotationReader.test.ts` verifican exhaustivamente todas las rutas.
