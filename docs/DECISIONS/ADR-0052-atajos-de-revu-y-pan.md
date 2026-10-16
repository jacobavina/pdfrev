# ADR-0052: Atajos de teclado de Revu y desplazamiento del plano (Pan)

- **Estado:** Aceptado (pendiente de la lista de paridad: "atajos que chocan con Revu"; lista oficial de Bluebeam:
  support.bluebeam.com/revu/resources/keyboard-shortcuts.html)
- **Fecha:** 2026-10-15

## 1. Contexto

Varios atajos de REA chocaban con los de Revu:
- P era Polygon (en Revu es Pen).
- F era Pen, O era Ellipse (en Revu es E) y Shift+Alt+R era Radius (en Revu es Shift+Alt+U).
- Faltaban Shift+N (Polyline), U (Underline), D (Strikethrough), S (Stamp), Shift+V (Pan), Alt+L, Alt+P y
  Ctrl+Shift+F7/F8.

Además, la herramienta Pan no desplazaba el plano y la ayuda anunciaba un Espacio que no hacía nada.

## 2. Decisión

1. **Atajos de Revu**:
   - P = Pen, Shift+P = Polygon, Shift+N = Polyline, E = Ellipse.
   - U = Underline, D = Strikethrough, S = Stamp.
   - Shift+V = Pan y Shift+Alt+U = Radius.
   - Alt+L muestra u oculta la lista de marcas; Alt+P, Properties.
   - Ctrl+Shift+F7 = Snap to Markup; Ctrl+Shift+F8 = Snap to Content.
   - Los anteriores que no chocan con Revu (F, O y Shift+Alt+R) siguen funcionando.
   - Los títulos de la cinta y la ayuda (F1) anuncian los de Revu.
2. **Pan**:
   - Arrastrar con la herramienta Pan desplaza el plano.
   - Mantener Espacio cambia a Pan y al soltarlo vuelve la herramienta anterior.
   - El botón central del ratón desplaza el plano con cualquier herramienta, como en Revu.
3. Corrección: Shift+N y Shift+Q ya no activan Note y Callout (sus atajos de una letra no excluían Shift).

## 3. Evidencia

`src/components/RevuShortcuts.test.tsx`.
