# ADR-0131: Atajo del hipervínculo

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

ADR-0027 dejó pendiente el atajo Shift+H del hipervínculo de Revu porque en REA Shift+H es el resaltado de texto (Text
Highlight), que también viene de Revu y se usa mucho más al revisar. La herramienta Hyperlink solo se alcanzaba desde el menú
Tools.

## 2. Decisión

1. **Ctrl+K** activa la herramienta Hyperlink (el atajo que usan casi todos los editores para insertar un enlace). Solo sin
   Shift ni Alt, para no chocar con Ctrl+Shift/Alt+K.
2. Shift+H sigue siendo Text Highlight; no se cambia ningún atajo existente.
3. Tools ▸ Hyperlink muestra el atajo y la guía de funciones lo menciona.
4. File Attachment (la F de Revu, ocupada por Pen) sigue sin atajo: no se pidió y se llega desde el menú.

## 3. Pruebas

- `src/components/HyperlinkShortcut.test.tsx` (2): Ctrl+K activa Hyperlink y Shift+H sigue activando el resaltado de texto; las
  combinaciones con Shift o Alt no la activan y el menú muestra el atajo.
