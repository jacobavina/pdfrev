# ADR-0091: Compare Documents, nubes automáticas en las diferencias

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase E, Hito E.1
- **Decisión anterior:** ADR-0090 (renderizado por región). Complementa Overlay Pages (ADR-0038/0050), que ya
  superpone dos páginas en rojo y azul sin crear marcas.

## 1. Contexto

Overlay Pages deja ver visualmente las diferencias entre dos revisiones, pero el revisor tiene que localizarlas a ojo
y marcarlas a mano. Revu ofrece Compare Documents: detecta los cambios y los señala.

## 2. Decisión

1. **Núcleo puro (`src/core/compare/compareDocuments.ts`):**
   - sobre dos rasterizaciones RGBA del mismo tamaño, marca las celdas de una rejilla de 8 px donde la luminancia
     cambia más de 48;
   - dilata la máscara 2 celdas para unir trazos cercanos de un mismo cambio;
   - agrupa en componentes conexas, descarta grupos con menos de 2 celdas reales (ruido de antialiasing) y devuelve
     la caja de cada una, normalizada a la hoja, con 6 px de margen.
2. **Servicio (`src/services/compareService.ts`):**
   - `Document ▸ Compare Documents…` pide la otra revisión;
   - rasteriza la página activa de ambas a 1600 px de ancho (la otra se ajusta al tamaño de la primera);
   - añade una nube por región, con el tamaño de lóbulos de las nubes nuevas, en la capa **Comparison**, con el texto
     "Changed vs <archivo> (n of N)", en **un solo paso de historial**;
   - avisa si no hay diferencias o si las hojas tienen proporciones distintas.

## 3. Alcance y límites

- Compara la página activa con la misma página de la otra revisión (no empareja páginas ni alinea los dibujos). Para
  alinear revisiones desplazadas sigue estando Overlay Pages con alineación por puntos.
- Detecta cambios gráficos por píxel; no distingue "movido" de "borrado y añadido".
- El informe del escenario S5 del plan maestro (exportar) lo cubrirá el hito E.3.

## 4. Pruebas

- `src/core/compare/compareDocuments.test.ts` (4): regiones, ruido, agrupación y máscara.
- `src/services/compareService.test.ts` (3): nubes en la capa Comparison con undo en un paso.
- E2E `Compare Documents (ADR-0091)`: genera una revisión B con `pdf-lib`, la elige en el selector de archivos real y
  comprueba que aparece una nube con su texto.
