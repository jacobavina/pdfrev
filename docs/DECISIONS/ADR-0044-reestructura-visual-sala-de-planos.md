# ADR-0044: Reestructura visual "sala de planos": cinta con pestañas, barra de propiedades y riel de paneles

- **Estado:** Aceptado (usuario, 2026-10-15: "hazme una reestructura visual completa de la app [...] sigue sin
  gustarme visualmente")
- **Fecha:** 2026-10-15
- **Sustituye:** la cinta de una fila (ADR-0017/0034), la paleta neutra de ADR-0036 y las tiras plegadas de los
  paneles derechos

## 1. Contexto

Diagnóstico de la versión anterior:
- La cinta metía en 70 px treinta herramientas en iconos de 18 px sin nombre, más los controles de estilo y de
  texto. Era densa y difícil de leer.
- Los paneles derechos plegados ocupaban tres tiras con texto vertical.
- La lista de marcas gastaba una fila entera en filtros.
- Todo el cromo era el mismo gris neutro, así que la hoja no destacaba del fondo.

## 2. Decisión

1. **Paleta "sala de planos"** (`src/index.css`):
   - Neutros grafito con un leve tinte azul de plano, nunca gris puro.
   - Un único acento azul cianotipo para selección, foco y herramienta activa.
   - Un pozo más oscuro que el cromo bajo la hoja, y la hoja con sombra de papel (`sheet-shadow`): el plano es lo
     más luminoso de la pantalla.
   - Ambos temas comparten los tokens `--cad-*`.
2. **Cinta con pestañas**, como Revu:
   - Pestañas Markup, Measure e Insert.
   - Cada herramienta muestra icono y nombre (`.ribbon-tool`).
   - Select y Pan están siempre a la vista.
   - La pestaña sigue a la herramienta activa: un atajo de medición abre Measure.
   - A la derecha de las pestañas se ven la herramienta activa y su atajo.
3. **Barra de propiedades en su propia franja**: estilo de línea, relleno, extremos, opacidad y texto, en secciones
   con rótulo corto. Con selección dice "Properties · N selected" en el acento; sin ella, "Style (new markups)".
4. **Riel derecho** (`RightRail`):
   - Un icono por panel (Properties, Measure, Tool Chest), con el abierto marcado por el acento.
   - Un panel a la vez (`useUiStore.rightPanel`); un segundo clic lo pliega.
   - Plegado, el panel ya no deja tira.
   - El riel izquierdo comparte el estilo (`.rail-btn`).
5. **Lista de marcas compacta**:
   - Búsqueda y filtros en la fila del título.
   - Encabezados en versalitas pequeñas.
   - Alto por defecto de 168 px.
6. **Encabezado**: menú abierto con resalte suave en lugar de relleno del acento, y logotipo sin degradado.

## 3. Consecuencias

- El cromo superior crece unos 50 px (pestañas y franja de propiedades); la lista de marcas baja de 200 a 168 px.
- Se actualizaron las pruebas que:
  - buscaban las herramientas de medición sin abrir su pestaña;
  - comprobaban una clase de estilo en vez de `aria-pressed`;
  - esperaban ver las tiras plegadas;
  - fijaban el alto anterior de la lista;
  - hacían clic en puntos que ahora quedan bajo la lista.

## 4. Evidencia

`src/components/shell/Redesign.test.tsx` y la batería E2E completa con el nuevo diseño.
