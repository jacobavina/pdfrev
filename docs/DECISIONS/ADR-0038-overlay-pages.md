# ADR-0038: Overlay Pages (comparar revisiones de un plano)

- **Estado:** Aceptado (roadmap de revisión de construcción, continuación pedida por el usuario: "continua",
  2026-10-14)
- **Fecha:** 2026-10-14

## 1. Contexto

En revisión de planos, comparar dos revisiones de una misma hoja es una tarea diaria. Revu lo resuelve con Overlay
Pages: cada versión se tiñe de un color y se superponen, así que lo común queda oscuro y lo agregado o quitado
salta a la vista. REA no tenía forma de comparar.

## 2. Decisión

1. **Document ▸ Overlay Pages:**
   - **Overlay with Another PDF…**: otra revisión; se elige el archivo y se compara la misma página o la última.
   - **Overlay with a Page of This Document**: la página siguiente, o la anterior si es la última.
2. **Mezcla** (`core/compare/overlayTint.ts`, puro):
   - Cada página es una capa de su color con opacidad igual a su "tinta" (1 − luminancia).
   - Las capas se multiplican sobre blanco: lo común queda oscuro y lo exclusivo sale en su color.
   - Página actual en rojo y comparada en azul por defecto.
   - `changedRatio` estima cuánto cambió.
3. **Capa** sobre la página activa: los dos renders se hacen con PDF.js a la escala y rotación del visor. Las marcas
   siguen encima y se pueden revisar y medir sobre la comparación.
4. **Barra de comparación** flotante sobre el visor:
   - Leyenda con mostrar u ocultar cada capa.
   - Intercambiar colores y elegir la página comparada.
   - Alinear la comparada con desplazamientos de 1 pt (10 pt con Mayús) y restablecer.
   - Cerrar.
5. Barra y capa se cargan bajo demanda (presupuesto del bundle). El estado no se guarda en el PDF ni en el
   historial.

## 3. Consecuencias

- La alineación es por desplazamiento manual. La alineación por tres puntos de Revu queda pendiente.
- Comparar en planos muy grandes y con mucho zoom hace un render extra de cada página al cambiar la vista.

## 4. Evidencia

`src/core/compare/overlay.test.tsx` y el E2E "Overlay Pages (ADR-0038)".
