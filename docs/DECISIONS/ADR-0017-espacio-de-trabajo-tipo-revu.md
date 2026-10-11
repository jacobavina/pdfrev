# ADR-0017: Espacio de trabajo de revisión y medición (interfaz inspirada en el flujo de Revu)

- **Estado:** Aceptado (pedido explícito del usuario, 2026-10-11: "no se parece a Bluebeam Revu; repiensa y corrígela")
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA (implementado por Claude Opus 5.5)

---

## 1. Contexto

Tras los paquetes P0–P5 la aplicación tenía muchas funciones, pero su interfaz seguía siendo la de un prototipo:
una sola barra superior con ~30 iconos sin rótulos (que además desbordaba la ventana), tema oscuro único, paneles
derechos diminutos, el indicador de escala flotando sobre el plano, la lista de marcas con altura fija de 200 px, la
ventana nativa abriéndose a 800×600 y medidas sin calibrar expresadas como "1 pt = 1 m". El usuario la percibió,
con razón, como "la misma app de antes" y "no se parece a Revu".

El objetivo del producto (plan v2, `07`) es reproducir las **funciones y flujos** de un editor técnico tipo Revu.
La interfaz es parte de ese flujo: un revisor espera menús, herramientas agrupadas, paneles con pestañas, barra de
estado con escala y coordenadas, y menú contextual sobre las marcas.

## 2. Decisión

Reorganizar el espacio de trabajo con **convenciones genéricas de aplicaciones técnicas de escritorio**, con
**diseño visual propio** (sin iconos, colores, logotipos ni capturas de Bluebeam; `AGENTS.md` §1):

| Zona | Componente | Contenido |
|---|---|---|
| Arriba | `shell/MenuBar.tsx` (`<header>`) | Archivo, Edición, Ver, Documento, Marcado, Medición, Ayuda; título del documento; tema claro/oscuro |
| Arriba | `shell/Ribbon.tsx` | Cinta con grupos rotulados: Archivo, Historial, Selección, Texto y revisión, Dibujo, Medición, Estilo (color y grosor) |
| Izquierda | `shell/LeftDock.tsx` | Pestañas verticales: Páginas (miniaturas existentes), Marcadores (índice del PDF), Capas (visibilidad por capa) |
| Centro | `App.tsx` + `PdfViewer.tsx` | Pestaña del documento; hoja centrada con sombra sobre lienzo gris; scroll completo con zoom alto |
| Derecha | Propiedades, `shell/MeasurementsPanel.tsx`, Tool Chest | Paneles plegables; Mediciones con escala, totales por tipo/unidad, perímetro y detalle |
| Abajo | `MarkupsList.tsx` + `shell/StatusBar.tsx` | Lista redimensionable; barra de estado con página, zoom, rotación, escala (clic para calibrar), coordenadas reales, selección y estado de guardado |
| Plano | `shell/CanvasContextMenu.tsx` | Clic derecho: Propiedades, Estado, Copiar, Duplicar, Bloquear, Eliminar (todo deshacible) |

Decisiones de detalle:

1. **Tema por variables CSS** (`src/index.css`, `tailwind.config.js`): claro por defecto, oscuro opcional; la escala
   `gray` se invierte en el tema claro para conservar el contraste de los componentes existentes sin reescribirlos.
2. **Catálogo único de herramientas** (`shell/toolDefinitions.tsx`) para cinta y menús; los `title` y `data-testid`
   se conservan (los tests los usan).
3. **Área de medición por polígono** (clic por vértice; Enter, doble clic o clic en el primer vértice para cerrar),
   con perímetro y relleno translúcido. Antes solo admitía rectángulos.
4. **Sin calibrar = escala de papel en mm** (`DEFAULT_PAGE_CALIBRATION`): 1 pt = 25.4/72 mm.
5. **Nombres de tipo en español** en lista, filtros y menú contextual (`core/markup/typeLabels.ts`).
6. **Ventana nativa** abre maximizada (mínimo 1024×640).
7. Las exportaciones pedidas desde menús se ejecutan en la lista (respetan filtros y columnas) mediante una petición
   en `useUiStore`; sus errores llegan al usuario como aviso (antes solo `console.error`).

## 3. Alternativas descartadas

- **Copiar la apariencia de Revu** (iconos, colores, disposición exacta): prohibido por la política de activos y
  clean-room funcional.
- **Cinta con pestañas que ocultan herramientas**: rompería tests E2E que pulsan herramientas por título y añade
  clics; se eligió una cinta de una sola fila de grupos, compacta (dos filas de iconos por grupo).
- **Reescribir todos los colores a mano para el tema claro**: ~400 clases; la inversión de la escala `gray` por
  variables logra lo mismo con un cambio central.

## 4. Consecuencias

- La navegación de páginas pasa de la barra superior a la barra de estado; el indicador de escala, del plano a la
  barra de estado (tests actualizados: `page-indicator`, `calibration-indicator`).
- `TopBar.tsx` se elimina; su test de herramientas de medición pasa a `shell/RibbonMeasurements.test.tsx`.
- Pendiente (no incluido): vista continua multipágina, pestañas de varios documentos, búsqueda en panel lateral,
  perfiles de interfaz y cinta personalizable.

## 5. Evidencia

Tests unitarios y de componente (`shell/Shell.test.tsx`, `PdfViewerMeasurements.test.tsx`,
`core/measurements/totals.test.ts`) y E2E "Espacio de trabajo (ADR-0017): …" en `tests/e2e/pdf-viewer.spec.ts`,
con 3 pasadas consecutivas en `node scripts/verify.mjs --with-e2e --e2e-loop 3`. La verificación visual en la
ventana nativa corresponde al usuario.
