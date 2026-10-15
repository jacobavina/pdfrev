# ADR-0036: Sistema visual de herramienta de diseño en toda la app

- **Estado:** Aceptado (pedido del usuario, 2026-10-14: "quiero que se vea como una herramienta de diseñador… con
  mejora visual no me refiero solo a las flechas si no a toda la app")
- **Fecha:** 2026-10-14

## 1. Contexto

ADR-0034 limpió la cinta y la barra superior, pero el resto de la app seguía con estilos sueltos:
- Inspector con etiquetas apiladas, cajas oscuras con borde y colores en texto crudo (`rgba(2, 132, 199, 0.15)`).
- Panel Measure denso.
- Lista de marcas con botones de colores y estados en pastillas con borde.
- Barra de estado monoespaciada.
- Menús, diálogos y avisos con superficies y sombras distintas, y avisos siempre en rojo.

## 2. Decisión

Un sistema visual único, inspirado en herramientas de diseño como Figma, definido en `src/index.css`.

1. **Tokens neutros sin tinte.**
   - Oscuro: paneles grafito (44, 44, 47) sobre fondo (30, 30, 32) y lienzo (24, 24, 26).
   - Claro: superficies blancas con líneas (228, 228, 232).
   - Un solo acento, azul 0D99FF.
   - Tokens nuevos `--cad-field` y `--cad-field-hover` para los campos.
2. **Tipografía.** Segoe UI Variable a 12 px (con Inter y la fuente del sistema como respaldo), suavizado y números
   tabulares en lugar de monoespaciada.
3. **Componentes** (`@layer components`):
   - `ui-input`: 28 px, sin borde hasta el foco, que lleva anillo del acento.
   - `ui-btn` fantasma, `ui-btn-secondary`, `ui-btn-primary` y `ui-btn-danger`.
   - `ui-row`: fila de propiedad, etiqueta de 76 px más control.
   - `ui-label`, `ui-panel-title`, `ui-section-title`, `ui-swatch`, `ui-badge` y `ui-range`.
   - Todos los campos de la app pasan a `ui-input`.
4. **Inspector.**
   - Encabezado de 40 px con título, contador y bloqueo discretos.
   - Filas "etiqueta | control".
   - Colores como muestra más valor legible (`0284C7 · 15%`), con "×" para quitar el relleno.
   - La opacidad lleva su porcentaje a la derecha.
5. **Measure.**
   - Secciones separadas por líneas finas, con el título a la izquierda y el chevron a la derecha.
   - Filas "etiqueta | control".
   - Calibrate como acción principal.
   - Botones de snap en campos de 32 px.
   - Página/Documento como control segmentado.
6. **Lista de marcas.**
   - Barra de título limpia y botones fantasma neutros (sin colores).
   - Encabezado discreto, filas más aireadas y selección con acento suave.
   - Estados como pastillas translúcidas sin borde.
7. **Barra de estado de 26 px; pestaña del documento** como pestaña de editor, subrayada con el acento.
8. **Menús, menús contextuales, buscador, diálogos y avisos.**
   - Superficie de panel, radio de 8–12 px y sombras suaves.
   - Elementos de menú redondeados.
   - Diálogo de calibración con campos y botones comunes.
   - Avisos neutros oscuros.

## 3. Consecuencias

- Cambia el aspecto de toda la app sin cambiar comportamiento, `data-testid` ni títulos. Las pruebas existentes
  pasan sin cambios.
- Las etiquetas del inspector se acortan para la columna de 76 px: Stroke, Weight (pt), Style, Font size, Comment,
  Value.

## 4. Evidencia

`src/components/DesignSystem.test.tsx`, más la suite completa y las E2E sin cambios.
