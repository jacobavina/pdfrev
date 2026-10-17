# ADR-0064: Estructura y densidad de la ventana: una fila de navegación, estilo en el panel, lienzo como sujeto

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0044 (cinta con pestañas y sistema visual) y ADR-0062 (legibilidad)

## 1. Contexto

El usuario sigue viendo la interfaz menos profesional que Revu y lo atribuye a la estructura, no al color. Antes de
llegar al lienzo había cinco bandas horizontales (189 px a 1440 × 900):
- menús;
- pestañas de la cinta;
- herramientas;
- tira de propiedades;
- pestaña del documento.

Además:
- la tira de propiedades duplicaba campos del panel de Propiedades;
- los botones de la cinta eran tarjetas redondeadas;
- la herramienta activa llevaba el azul del acento;
- el panel de Propiedades se abría al arrancar.

Las capturas de Revu se usaron solo como referencia de estructura, densidad y jerarquía; no se copió nada (AGENTS.md
§1).

## 2. Decisión

1. **Una sola fila de navegación:**
   - `RibbonTabs` (Markup, Measure, Insert) va en la cabecera, junto a los menús. La pestaña activa vive en
     `useUiStore.ribbonTab`.
   - La cinta queda en una sola banda de herramientas (`<Ribbon showTabs={false} />`). Aislada, sigue mostrando sus
     pestañas.
   - El acceso rápido pasa a la derecha, y el título del documento ocupa el centro como zona neutra.
2. **Sin tira de propiedades:**
   - Su lógica y sus controles pasan, con los mismos `data-testid`, a `StyleSection`. Es una pila vertical
     (`.style-stack`) dentro del panel de Propiedades, que se carga bajo demanda.
   - Con selección edita las marcas; sin ella (o con una herramienta de dibujo activa), el estilo de las nuevas.
   - El panel pierde sus filas duplicadas: color, relleno, grosor, opacidad, tipo de línea, borde del callout, nube,
     extremos y texto. Conserva Lock, Status, Author, Comment y la posición del valor de las distancias.
   - Se mantienen dos detalles del panel, ahora en la sección de estilo:
     - el selector de color libre (`prop-stroke-color`, `prop-fill-color`);
     - las flechas cerradas por defecto de las distancias.
   - Se añade un valor mezclado para el grosor y la tipografía de 8 pt de las mediciones.
3. **Menos altura:**
   - herramientas de 32 px con icono de 18 px y etiqueta de 11 px (banda de 48 px);
   - pestaña del documento de 28 px.
   - Chrome: 189 → 109 px.
4. **Contención visual:**
   - herramientas planas, sin tarjeta (`border-radius: 0`);
   - la activa con un fondo apenas distinto e icono en el color fuerte, sin acento;
   - divisores verticales visibles entre grupos.
   - El azul queda para la selección, el foco y la pestaña activa.
5. **Paneles:**
   - Propiedades arranca plegado: la selección de la demo ya no lo abre; lo abre el usuario.
   - Todas las cabeceras usan `.panel-header`: barra propia con título, acciones a la derecha y borde inferior marcado.
   - Las reglas siguen ocultas por defecto, como en Revu.
6. **Lienzo:** `--cad-canvas` ya era un token más oscuro que los paneles en ambos temas.
   - En el claro se oscurece de 196 203 213 a 166 175 188. La hoja blanca pasa de 1.63:1 a 2.22:1 contra el mantel.
   - El oscuro no cambia: la hoja ya contrasta 19:1.
7. **Bundle:** la tira sale del paquete principal y se carga con el panel.

## 3. Pruebas tocadas y por qué

**Pruebas que montaban `<Ribbon />` para usar los controles de estilo**
(`RevuEditing`, `RevuLineStyles`, `RevuCallout`, `PdfViewerAcrobatStyle`):
- ahora montan la cinta junto a `StyleSection`, que es donde viven esos controles;
- las aserciones no cambian.

**Pruebas que usaban las filas eliminadas del panel**
(`PropertiesInspectorPanel`, `PdfViewerAcrobatFlow`, `DesignSystem`, `PdfViewerAcrobatStyle`):
- usan los controles equivalentes de la sección de estilo.

**E2E**
- Tres pruebas abren el panel de Propiedades (`expand-properties-btn`) antes de usar el estilo, porque ya no está en la
  cinta.
- Donde luego se dibuja por coordenadas, lo cierran antes de dibujar, para que el visor recupere su ancho.
- La de Ctrl+S elige el grosor de 5 pt con el selector en vez de escribir 6 en el campo numérico eliminado.

**Redesign.test.tsx**
- La prueba "la barra de propiedades va en su propia franja…" se sustituye por la que asegura que esa franja ya no
  existe.

## 4. Verificación

- `src/components/shell/Redesign.test.tsx` (renderiza la `App` completa):
  - `una sola fila de navegación: los menús y las pestañas de la cinta comparten la cabecera y la tira de propiedades no existe`
  - `el panel de Propiedades arranca plegado y el estilo se edita dentro de él al abrirlo`
  - `la cinta ya no lleva la tira de propiedades: el estilo vive en el panel de Propiedades (ADR-0064)`
  - `herramientas planas sin tarjeta; la activa sin el azul del acento; grupos con divisor; lienzo como token más oscuro que los paneles`
- Medición del chrome y capturas: `docs/audits/rediseno-2026-10-16.md`.
- `npx.cmd impeccable detect http://localhost:1421` y `src/`: exit 0.
