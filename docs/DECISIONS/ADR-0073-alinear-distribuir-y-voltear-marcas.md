# ADR-0073: Alinear, distribuir y voltear marcas (`transformTools.ts`)

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** `A.3` (Fase A — Revisión de ingeniería, escenario S1)

## Contexto

La matriz de capacidades de Bluebeam Revu (`docs/plan-v2/06-matriz-capacidades-revu.md`, §1.3, capacidad `P3-H.5`) requiere herramientas de alineación (`Align Left`, `Center`, `Right`, `Top`, `Middle`, `Bottom`), distribución uniforme (`Distribute Horizontally`, `Vertically`) y volteo especular (`Flip Horizontal`, `Vertical`) sobre marcas seleccionadas, preservando la atomicidad de los grupos (`groupId`, p. ej. `Cloud+`) y la inmunidad de las marcas bloqueadas (`locked: true`).

## Decisión

1. **Núcleo puro (`src/core/markup/transformTools.ts`):**
   - `alignMarkups(markups, mode)`: agrupa las marcas por `groupId` (cada grupo actúa como una única unidad lógica con su caja envolvente combinada), calcula los extremos o el centro global de las unidades seleccionadas (`>= 2`) y genera los desplazamientos `MoveMarkupItem[]` de las unidades no bloqueadas con ajuste a `[0, 1]`.
   - `distributeMarkups(markups, axis)`: ordena las unidades (`>= 3`) por su centroide a lo largo del eje horizontal o vertical, mantiene fijas la primera y la última unidad y reparte equitativamente el espacio libre entre cajas contiguas.
   - `flipMarkups(markups, axis)`: refleja todos los puntos (`points`) y directrices (`leaders`) de las marcas no bloqueadas respecto al centroide de la caja envolvente de la selección (`2 * cx - x` o `2 * cy - y`), reordenando a forma canónica superior-izquierda → inferior-derecha los tipos de caja de 2 puntos.
2. **Integración atómica en el historial (`src/store/useMarkupStore.ts`):**
   - `commitMoveMarkups(moves, description?)` registra toda la transformación de las $K$ marcas en un único comando de historial reversible con un solo `Ctrl+Z`.
3. **Superficies de UI (`src/components/shell/CanvasContextMenu.tsx`, `src/components/shell/MenuBar.tsx`):**
   - El menú contextual del lienzo (`CanvasContextMenu.tsx`, cargado en diferido) ofrece botones directos para `Flip H`, `Flip V`, las 6 alineaciones (cuando hay `>= 2` unidades) y las 2 distribuciones (cuando hay `>= 3` unidades).
   - El menú `Edit ▸ Align & Flip` (`MenuBar.tsx`) invoca `transformTools.ts` mediante `import()` dinámico para no incrementar el peso del chunk principal.

## Consecuencias

- Las operaciones de maquetación técnica sobre múltiples marcas se ejecutan y deshacen en un solo paso atómico.
- `transformTools.ts` se empaqueta en un chunk separado compartido entre `CanvasContextMenu` y `MenuBar`, sin penalizar el presupuesto de 800 kB del bundle principal.
