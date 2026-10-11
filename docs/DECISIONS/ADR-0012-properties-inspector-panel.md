# ADR-0012: Inspector de Propiedades de Marcas y Comandos Atómicos (D-3)

- **Estado:** Aceptado (aprobado por el usuario en decisión D-3, 2026-10-11)
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA
- **Relacionado con:** [ADR-0005](file:///C:/dev/rea/docs/DECISIONS/ADR-0005-command-history-manager.md), [ADR-0006](file:///C:/dev/rea/docs/DECISIONS/ADR-0006-shared-markup-render-pipeline.md), [03-plan-por-fases.md](file:///C:/dev/rea/docs/plan-v2/03-plan-por-fases.md)

---

## 1. Contexto

En Bluebeam Revu, el panel lateral de propiedades permite al usuario inspeccionar y modificar interactivamente los atributos visuales y metadatos de cualquier marca seleccionada o grupo de marcas seleccionadas (color de trazo, relleno, grosor, opacidad, estilo de guiones, tamaño de fuente, texto, autor y estado).

En REA, hasta el Hito P2-C.3, las marcas solo podían editarse mediante herramientas modales puntuales (como el menú contextual de estados en `MarkupsList`) o arrastre en el lienzo. Para cerrar la Fase 2 bajo la decisión **D-3 (2026-10-11)** y el camino **A′ (D-2)**, se aprueba la incorporación del **Inspector de Propiedades (`P2-C.6`)** como panel lateral dedicado.

---

## 2. Decisión

Se define e implementa el componente `PropertiesInspectorPanel` y su comando atómico de historial con las siguientes directrices arquitectónicas:

### 2.1 Representación de la Selección y Valores Mixtos
1. **Selección vacía:** Cuando no hay marcas seleccionadas (`selectedMarkupIds.length === 0`), el panel muestra un estado vacío informativo que invita al usuario a seleccionar una marca en el plano o en la lista inferior.
2. **Selección única ($K=1$):** El panel muestra los valores actuales exactos de la marca seleccionada.
3. **Selección múltiple ($K > 1$):**
   - Si todas las marcas seleccionadas comparten el mismo valor en una propiedad (p. ej., todas tienen `strokeWidth: 2`), se muestra ese valor.
   - Si las marcas poseen valores divergentes en una propiedad (p. ej., una tiene `#ff0000` y otra `#0000ff`), el campo muestra un valor mixto representado formalmente por el glifo `"—"` (*em-dash*).
   - Al modificar un campo que mostraba `"—"`, el nuevo valor ingresado por el usuario se propaga uniformemente a todas las marcas seleccionadas en esa única acción.

### 2.2 Comando Atómico con Undo/Redo (`UpdateMarkupPropertiesCommand`)
1. Todo cambio realizado en el Inspector (sea sobre 1 o $K$ marcas) se despacha a través de una instancia única de `UpdateMarkupPropertiesCommand` registrada en `commandHistoryManager`.
2. El comando captura en un mapa inmutable el estado previo (`oldProperties`) y el estado posterior (`newProperties`) de cada marca afectada.
3. Al presionar `Ctrl+Z`, todas las marcas afectadas regresan simultáneamente a su valor original en un solo paso de historial.

### 2.3 Guardas Numéricas y Prevención de Corrupción
1. **Prohibición de `NaN`:** Los campos numéricos (`strokeWidth`, `opacity`, `fontSize`) validan la entrada del usuario antes de aplicar el cambio. Si la entrada es inválida o no parseable, se descarta silenciosamente o se normaliza al valor seguro predeterminado.
2. **Límites Físicos:**
   - Grosor de trazo (`strokeWidth`): clamp estricto $\ge 1\text{ pt}$.
   - Opacidad (`opacity`): clamp estricto en el rango $[0.05, 1.0]$.
   - Tamaño de fuente (`fontSize`): clamp estricto en el rango $[6, 72]\text{ pt}$.

---

## 3. Consecuencias y Verificación

1. **Usabilidad profesional:** Proporciona paridad directa con el panel de propiedades de Bluebeam Revu sin alterar el flujo CAD del visor.
2. **Inmutabilidad estricta:** Alineado con `AGENTS.md` §4, cada comando genera nuevos objetos de marca copiando propiedades sin mutación directa en memoria.
3. **Pruebas:** Cubierto por pruebas unitarias en `UpdateMarkupPropertiesCommand.test.ts` y pruebas de integración/componente en `PropertiesInspectorPanel.test.tsx`.
