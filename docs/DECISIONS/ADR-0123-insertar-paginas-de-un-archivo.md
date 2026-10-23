# ADR-0123: Insertar páginas de un archivo

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Con Replace Pages (ADR-0114) se sustituían páginas, pero no se podían añadir las de otro PDF sin quitar ninguna: una
lámina nueva en un juego, un anexo al final. Está en la oleada 2 de `docs/plan-v2/10-brecha-menus-revu.md`.

## 2. Decisión

1. **Document ▸ Insert Pages from File…** pide un PDF (selector de archivo), las páginas que se insertan (lista como
   `1-3, 5`, por defecto todas) y la posición: **antes** de la página actual, **después** o **al final**. El diálogo dice
   en qué páginas quedarán y cuántas tendrá el documento.
2. Las páginas se copian en el orden escrito (se puede invertir o repetir). Las anotaciones propias del otro PDF viajan
   con sus páginas, como anotaciones del archivo.
3. Marcas, escalas y viewports de medición de las páginas que quedan después se **corren** (como al insertar una página
   en blanco); las etiquetas de página por posición se reinician; la página actual pasa a la primera insertada.
4. No se puede deshacer, igual que el resto de operaciones de páginas; el diálogo lo avisa.

## 3. Alcance y límites

- Las páginas insertadas conservan su tamaño: si es distinto del resto, cada una se ve y se mide con el suyo.
- No inserta páginas en blanco ni imágenes (hay *Insert Blank Page After*); no copia marcadores del otro PDF.

## 4. Pruebas

- `src/core/pages/insertPages.test.ts` (4): posición, inserción en orden, principio y final, y errores.
- `src/components/modals/InsertPagesDialog.test.tsx` (5): menú, inserción con marcas, escalas y viewports corridos, antes y
  al final, lista inválida y Escape.
- E2E `Insert Pages (ADR-0123)`: un PDF real pasa de 3 a 5 páginas.
