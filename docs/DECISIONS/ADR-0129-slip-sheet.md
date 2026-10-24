# ADR-0129: Slip Sheet

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Oleada 4 de `docs/plan-v2/10-brecha-menus-revu.md`: cuando llega una revisión de un juego de planos, hay que cambiar cada
lámina vieja por la nueva y no perder las marcas hechas. Replace Pages (ADR-0114) lo permite, pero obliga a escribir a mano
los números de página de ambos lados y a repetirlo si la revisión viene en otro orden.

## 2. Decisión

1. **Document ▸ Slip Sheet…** pide el PDF de la revisión y empareja **cada página del documento con la lámina nueva que
   tiene el mismo número de lámina**.
2. **Número de lámina:** se lee del texto de la página (`sheetKey`): una a tres letras, guion o punto opcional, y de uno a tres
   dígitos con decimales opcionales (`A-101`, `S2.01`, `A 101`; con espacio solo si las letras son mayúsculas). Se normaliza
   (`a-101` = `A 101` = `A101`), se toma el último candidato (el cajetín va al final) y se ignoran unidades y palabras como
   `PT`, `DE`, `PAGE` o `REV`.
3. **Emparejamiento (`matchSheets`):** cada lámina nueva se usa una sola vez. Si ninguna coincide (PDF sin texto o sin
   números), se empareja **por posición** hasta donde alcance la revisión.
4. **Lista de revisión antes de aplicar:** cada página muestra su lámina nueva ("by sheet", "by order" o "manual") y se puede
   cambiar o dejar como está (*Keep this page*). Si dos páginas eligen la misma lámina nueva no se deja aplicar.
5. **Aplicar (`slipSheetPdf`):** cada página se sustituye en su sitio (las posiciones no se mueven, así que marcas, escalas,
   viewports, etiquetas y página actual siguen valiendo). Las **marcas se conservan** por defecto (opción para quitarlas) y
   las láminas nuevas sin pareja se pueden **añadir al final**. Las anotaciones propias del PDF nuevo viajan con sus páginas.

## 3. Alcance y límites

- Las marcas se guardan en coordenadas relativas a la página: si la lámina nueva tiene otro tamaño o el dibujo se movió, las
  marcas conservadas quedan en la misma posición relativa y hay que revisarlas. No hay alineación automática de planos.
- La lectura del número depende de que esté escrito como texto en la página; un cajetín escaneado sin OCR no se reconoce (se
  puede emparejar a mano o por orden).
- No se deshace con Undo (cambia los bytes del documento, como Replace Pages); se marca como modificado.

## 4. Pruebas

- `src/core/pages/slipSheet.test.ts` (8): lectura del número, último candidato y descartes, emparejamiento con otro orden y
  láminas de más, uso único, respaldo por posición, sustitución en sitio, añadir al final y errores.
- `src/components/modals/SlipSheetDialog.test.tsx` (6): menú, emparejamiento y lámina sobrante, lo que se manda al aplicar,
  cambio manual y duplicados, respaldo por orden sin conservar marcas, y Escape. Encontró un defecto de diseño (reinicio del
  diálogo al elegir el archivo) que ya está corregido.
- E2E `Slip Sheet (ADR-0129)`: una revisión generada con pdf-lib sustituye las tres láminas del plano de prueba y el visor
  muestra las nuevas.
