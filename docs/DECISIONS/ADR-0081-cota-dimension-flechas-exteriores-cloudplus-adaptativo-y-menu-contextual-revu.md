# ADR-0081: Cota / Dimension con Flechas Exteriores para Tramos Cortos, Adaptación de Cloud+ al Zoom y Paridad en Menús Contextuales y Recortes de Revu 21

- **Estado:** Aceptado
- **Fecha:** 2026-10-17
- **Hito:** Fase B — Medición, Takeoff y Paridad Revu 21

## Contexto

En el trabajo diario de estimación, takeoff e inspección de planos arquitectónicos e ingenieriles con Bluebeam Revu 21:
1. **Apelotonamiento de Flechas en Cotas Cortas (`Dimension`):**
   - En vanos reducidos, muros estrechos o distancias pequeñas (por ejemplo, vanos de puerta de 16 ft o medidas con longitud $< 2.5 \times \text{arrowSize}$), las dos flechas interiores de la cota quedaban enfrentadas a escasa distancia o solapadas directamente sobre el rótulo numérico (`16.42 ft`), produciendo un choque visual ilegible ("amontonadas").
   - La herramienta `Length` ya disponía de la funcionalidad de flechas exteriores con colas (`outsideArrowLayout`, ADR-0063), pero la herramienta `Dimension` carecía de dicha integración tanto en el renderizado SVG en pantalla (`render.ts`) como en los appearance streams PDF (`operators.ts`).
   - Además, la distancia de retranqueo de las líneas de extensión (`gap`), el vuelo (`overshoot`) y el margen del texto (`textGap`) en `dimension` no escalaban proporcionalmente con el zoom (`pxPerPt`), desajustándose visualmente a diferentes niveles de magnificación.
2. **Alejamiento Excesivo de la Caja de Texto en `Cloud+`:**
   - Al trazar una nube con llamada (`Cloud+`), la caja de texto se ubicaba con un desplazamiento porcentual estático sobre las dimensiones totales de la lámina (+0.07 en X, -0.10 en Y).
   - En planos arquitectónicos de gran formato (Arch D / Arch E) y con niveles de zoom elevados (200%–300%), este porcentaje se traducía en cientos de píxeles en pantalla, arrojando la caja fuera del campo de visión del usuario.
3. **Pérdida de Opacidad de Relleno en Áreas al Guardar y Reabrir:**
   - Al guardar un PDF con mediciones de Área y volver a abrirlo, el relleno aparecía como un bloque opaco al 100% de color rojo sólido, ocultando por completo la información arquitectónica subyacente.
   - El escritor incremental (`incrementalWriter.ts`) omitía el operador `/ca` (fill opacity conforme a ISO 32000-1 Tabla 168) y truncaba la transparencia en el array de color interior `/IC [r g b]`, provocando que los visores externos y el lector de anotaciones de REA asumieran 100% de opacidad.
4. **Paridad de Menú Contextual Jerárquico y Herramientas de Recorte:**
   - En Revu 21, el menú contextual del lienzo organiza las acciones secundarias en submenús desplegables (*flyouts*): Control Point, Layer, Order (Bring to Front, Send to Back), Alignment, Set Status y Add to Tool Chest.
   - Las nuevas herramientas de recorte de medición (`polygonCutout` y `ellipseCutout`) deben contar con ajuste magnético a líneas y vértices del plano (`SNAP_TOOLS`), restricciones ortogonales (`ORTHO_TOOLS`, `SQUARE_TOOLS`) y capacidad de borrado contextual (`deleteCutout`).

## Decisión

1. **Flechas Exteriores en la Herramienta Dimension (`render.ts` y `operators.ts`):**
   - Se integra `outsideArrowLayout(geom.dimStart, geom.dimEnd, inset, ends)` en el bloque `case 'dimension'` de `src/core/markup/render.ts`.
   - Cuando la separación entre líneas de extensión es inferior al umbral crítico ($< 2.5 \times \text{arrowSize}$), las flechas se desplazan al exterior apuntando hacia el interior de la cota, y se dibujan colas exteriores (*stubs*) alineadas con la línea de dimensión, marcadas con `data-arrows="outside"`.
   - Se escalan los parámetros geométricos `gap`, `overshoot` y `textGap` por `pxPerPt` para mantener proporción invariante ante el zoom.
   - En `src/core/pdf/operators.ts`, se replica exactamente la misma lógica geométrica en espacio de puntos PDF para emitir las colas exteriores con `pathPdf` y los extremos invertidos en `/AP /N`, asegurando coincidencia visual absoluta entre pantalla y visores PDF como Bluebeam Revu y Adobe Acrobat.
2. **Adaptación de Cloud+ al Zoom y al Formato de Lámina (`PdfViewer.tsx`):**
   - Se calcula el tamaño de la caja de llamada de forma dinámica mediante `estimateCalloutBoxNormalizedSize` a partir del tamaño de fuente y las dimensiones desescaladas de la página en puntos.
   - La distancia visual (*gap*) entre la nube de revisión y la caja de texto se adapta al nivel de zoom actual, limitándola en pantalla a un rango estricto de 20 px a 36 px (correspondiente a ~24 pt en espacio PDF).
   - Se ancla la directriz al vértice más cercano del contorno de la nube para evitar cruces innecesarios.
3. **Persistencia ISO 32000-1 y Auto-sanación de Opacidad de Relleno (`/ca`):**
   - `src/core/pdf/incrementalWriter.ts`: Se emite de forma explícita la clave `/ca` (fill opacity) en el diccionario de anotación cuando el color de relleno presenta componente alfa o la opacidad de la marca es menor a 1. Asimismo, se almacena `/fillColor` dentro del diccionario privado `/REA`.
   - `src/core/pdf/annotationReader.ts`: Se recupera `/ca` y se reconstruye el color de relleno RGBA. Para documentos o marcas históricas generadas previamente sin `/ca` o con hex sólido, se aplica auto-sanación automática con `translucentFill(fillColor, 0.25)` para garantizar que el plano nunca quede oculto.
4. **Menú Contextual Jerárquico y Snapping en Recortes:**
   - `src/components/shell/CanvasContextMenu.tsx`: Implementación del menú contextual completo con menús flotantes (*flyouts*) posicionados a la derecha con volteo automático a la izquierda si tocan el borde del viewport.
   - Soporte para reordenación Z de marcas (`reorderSelectedMarkups`: Bring to Front, Bring Forward, Send Backward, Send to Back) con comando de historial atómico.
   - Incorporación de `polygonCutout` y `ellipseCutout` en `SNAP_TOOLS`, `ORTHO_TOOLS` y `SQUARE_TOOLS` de `src/components/PdfViewer.tsx` y `src/core/markup/ortho.ts`.
   - Iconografía técnica nítida rediseñada en `src/components/shell/customIcons.tsx`.

## Consecuencias

- **Legibilidad Óptima en Cotas:** Las dimensiones en vanos estrechos o detalles a gran escala muestran flechas limpias en el exterior sin apelotonarse sobre el texto ni entre sí, tanto en pantalla como en el PDF exportado.
- **Ergonomía de Anotación en Cloud+:** El usuario puede trabajar en altos aumentos de zoom sin perder de vista la nota explicativa de la revisión.
- **Integridad Visual en Archivos PDF Reabiertos:** Los polígonos de área conservan su translucidez exacta al guardar e intercambiar archivos con Bluebeam Revu y Adobe Acrobat.
- **Cumplimiento de Puertas de Calidad:**
  - 100% de pruebas unitarias pasando.
  - Paridad verificada en `PARITY.md`.
  - Tamaño de bundle principal respetado por debajo del techo de 800.00 kB.
