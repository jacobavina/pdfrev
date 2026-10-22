# ADR-0109: Paste in Place, Format Painter y Hide

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Tres funciones de la primera oleada de `docs/plan-v2/10-brecha-menus-revu.md` que Revu ofrece en Edit y REA no tenía:
repetir una marca en el mismo sitio de otra hoja, copiar el aspecto de una marca a otras y ocultar marcas sin borrarlas.

## 2. Decisión

1. **Paste in Place** (`Ctrl+Shift+V`, `Edit ▸ Paste in Place`, menú contextual): pega lo copiado con `Ctrl+C` en la
   página actual con las mismas coordenadas. Sin desplazamiento no se recorta nada hacia dentro de la hoja (el pegado
   normal sí limita a 0.01–0.98).
2. **Format Painter**, en dos pasos: `Copy Format` (`Ctrl+Shift+C`) toma el formato de la marca seleccionada y
   `Paste Format` (`Ctrl+Alt+V`) lo aplica a la selección, con un solo comando de historial.
   - Se copia el estilo (color, relleno, grosor, opacidad, trazo discontinuo, color y tamaño de texto) y el formato de
     texto (negrita, cursiva, alineación).
   - Tipo de línea con patrón solo a las marcas que lo admiten, hatch solo a formas cerradas y extremos de línea solo
     a líneas. La forma, el contenido y el tipo de marca no cambian (una nube no se convierte en rectángulo).
   - No se pintan marcas bloqueadas, sellos, imágenes, enlaces, adjuntos, campos de formulario ni contadores.
3. **Hide** (`Edit ▸ Hide`, menú contextual) pone `hidden` en las marcas seleccionadas: no se dibujan, no se
   seleccionan, no son candidatas de snap y no se aplanan al exportar. Se escribe el bit Hidden (2) de `/F` de la
   anotación (con Print 4, y Locked 128 si lo estaba) y se lee al abrir, de modo que otros visores también la ocultan.
   `Edit ▸ Show Hidden Markups` las vuelve a mostrar todas. Ocultar y mostrar son un paso de historial. Las marcas
   bloqueadas no se ocultan.

## 3. Alcance y límites

- Format Painter no es un modo con cursor (como la brocha de Revu): son dos órdenes con atajo.
- Las marcas ocultas siguen en la lista de marcas y en los informes; Hide solo afecta a lo que se ve y se imprime.
- Mostrar es global (todas las ocultas), no por selección, porque lo oculto no se puede seleccionar.

## 4. Pruebas

- `src/core/markup/formatPainter.test.ts` (5): qué se copia y a quién, copia defensiva, tipos excluidos.
- `src/core/pdf/hiddenInterop.test.ts` (2): bit Hidden de `/F` de ida y vuelta, y no aplanar marcas ocultas.
- `src/components/EditCopyActions.test.tsx` (8): menús y atajos, página destino, Undo, Hide en el plano real.
