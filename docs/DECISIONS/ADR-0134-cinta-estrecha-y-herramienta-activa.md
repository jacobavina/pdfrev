# ADR-0134: Cinta estrecha y herramienta activa

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

El plan de diseño (`docs/plan-v2/11-plan-de-diseno.md`, hallazgos 9 y 10) dejó dos puntos propuestos: la cinta Markup tiene unas
40 herramientas en un solo carril que se corta en ventanas estrechas (se llega a ellas desplazando), y la herramienta activa
solo se veía en la cinta, que puede tenerla fuera de la vista.

## 2. Decisión

1. **More tools:** cuando el carril de la cinta no cabe (`scrollWidth` mayor que `clientWidth`, vigilado con `ResizeObserver`)
   aparece a la derecha un botón con el doble chevron. Abre una lista en dos columnas, con icono y nombre, de **todas las
   herramientas de la pestaña activa** (Select, más Text & Review y Draw en Markup; Measure; o Stamp, Link, Attach y Field en
   Insert). Elegir una la activa y cierra la lista; Escape y el clic fuera también la cierran.
2. Si la cinta cabe entera el botón no existe: no cambia nada respecto a antes. El carril sigue desplazándose como siempre.
3. **Herramienta activa:** la barra de estado muestra `Tool: <nombre>` junto a las coordenadas, con el nombre corto de la
   cinta y, para las que no están en ella (Hyperlink, File Attachment, Snapshot, Select Text, Lasso), uno propio. El título
   lleva el nombre largo con su atajo.

## 3. Alcance y límites

- No se colapsan los grupos a botones desplegables (la primera propuesta): se conserva la cinta tal cual y se añade la lista
  como salida, que es menos invasivo y no cambia lo que ya conoces.
- La lista no repite los estilos (color, grosor) de cada herramienta; eso sigue en el panel de propiedades.

## 4. Pruebas

- `src/components/shell/RibbonOverflow.test.tsx` (3): aparece solo cuando se corta, lista y activa una herramienta y se
  cierra, y lista las de cada pestaña con Escape.
- `src/components/shell/StatusBarActiveTool.test.tsx` (2): nombre corto y nombres de las herramientas fuera de la cinta.
- E2E `Cinta estrecha (ADR-0134)`: con 900 px de ancho aparece el botón, se elige Ellipse y la barra de estado lo muestra.
- `designScale.test.ts`: la lista flotante de la cinta entra en la lista blanca de `shadow-float`.
