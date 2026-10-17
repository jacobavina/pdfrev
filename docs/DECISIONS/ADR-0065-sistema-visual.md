# ADR-0065: Sistema visual: tipografía IBM Plex, iconografía consistente, disciplina de color y blindaje por pruebas

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0062 (escala tipográfica y contraste) y ADR-0064 (estructura y densidad)

## 1. Contexto

La estructura ya estaba resuelta: una fila de navegación, 109 px de chrome y sin la tira de propiedades. Faltaba la
capa estética: tipografía, iconografía, color, ritmo y disciplina de tokens, más un documento y unas pruebas que
impidan que derive.

## 2. Decisión

1. **Tipografía:**
   - IBM Plex Sans 400/500/600 para la interfaz e IBM Plex Mono 400/500 solo para datos (clase `ui-data`, cifras
     tabulares).
   - Origen: npm `@ibm/plex-sans@1.1.0` y `@ibm/plex-mono@2.5.0`, publicados desde `github.com/ibm/plex` (commits en
     `ATTRIBUTION.md`).
   - Se usan los `.woff2` completos, sin recorte a Latin1, para cubrir los glifos de medidas (², ³, °, Ø, fracciones).
   - Van en `src/assets/fonts` con su LICENSE OFL-1.1, `font-display: swap`, sin red.
   - El PDF sigue escribiéndose con Helvetica/WinAnsi. La escala 11/12/13/14/16 no cambia.
2. **Iconos:**
   - un trazo de 1.75 para Lucide y los propios (CSS sobre `svg.lucide` y `svg.rea-icon`), y tamaños 16/18/20;
   - los iconos propios pierden sus grosores y colores particulares;
   - los iconos de tipo de la lista de marcas pasan a gris neutro.
3. **Color:**
   - El acento se reserva para selección, foco, pestaña activa y marca. Todo lo demás pasa a neutro:
     - herramienta activa e interruptores pulsados;
     - botón principal: `cad-strong` sobre `cad-panel`;
     - hover de menús;
     - avisos;
     - el riel, que conserva su barra lateral de pestaña activa.
   - Línea y Relleno pasan a un solo swatch con desplegable (`ColorPicker`): paleta, "sin relleno" y color libre.
   - Desaparece el chip "Properties · N selected". La cabecera del panel ya lo dice ("1 markup" o "New markups"); la
     sección expone `data-target` para pruebas y lectores de pantalla.
   - La banda de documentos usa el tono `cad-dark` y la pestaña activa el del panel, para separarla de la cinta.
   - Foco: anillo de 2 px con el acento, siempre visible.
4. **Ritmo y elevación:**
   - escala de espaciado 4/8/12/16 en cabeceras, cinta, secciones y riel;
   - cabeceras de panel a 32 px;
   - tres niveles de elevación. Todas las sombras de flotantes pasan a `shadow-float`; se quitan las `shadow-sm`
     decorativas.
5. **Tokens y blindaje:**
   - Ningún componente lleva colores literales:
     - el overlay del visor usa tokens `ov-*` mediante `tok()`;
     - los colores del documento pasan a `src/core/markup/palette.ts`.
   - `docs/DESIGN.md` recoge el sistema completo.

## 3. Pruebas tocadas y por qué

- **`RevuEditing`:** tres pruebas comprobaban el texto del chip eliminado; ahora comprueban `data-target` de la
  sección de estilo. La del conteo esperaba el verde literal del tirador; ahora espera el token.
- **`DesignSystem` y `PropertiesInspectorPanel`:** leen el color en el `data-value` del swatch, porque el selector
  libre está ahora dentro del desplegable.
- **E2E de la nube (ADR-0039/0040):** comprueba "1 markup" en la cabecera del panel y `data-target` en lugar del chip.

## 4. Verificación

- `src/designScale.test.ts`:
  - `ningún componente lleva colores literales (hex, rgb, hsl): solo tokens de src/index.css y tailwind.config.js (ADR-0065)`.
    Comprueba primero que su detector caza `#0f172a` y `rgb(30, 41, 59)`; al añadirla encontró un `#ffffffd9` real
    en la miniatura de sellos.
  - `cabeceras de panel, cinta, secciones de estilo y riel usan la escala de espaciado 4/8/12/16 (ADR-0065)`
  - `iconos en 16, 18 o 20 px y con un único trazo de 1.75 para Lucide y los propios (ADR-0065)`
- Capturas a 1440 × 900 con Playwright, en ambos temas y con el panel de Propiedades abierto:
  `docs/audits/sistema-visual-2026-10-16-claro.png` y `-oscuro.png`.
- `npx.cmd impeccable detect http://localhost:1421`: exit 0.
