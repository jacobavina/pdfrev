# ADR-0033: Distancia de Acrobat con líneas de referencia, flechas angostas y separador de miles

- **Estado:** Aceptado (captura del usuario con mediciones de Acrobat, 2026-10-14: "así se ven las mediciones de
  Acrobat, se ven más estéticas y mejor proporcionadas"; "eso de caption inside on top no lo vi")
- **Fecha:** 2026-10-14

## 1. Contexto

La captura muestra dos distancias de Acrobat.
- **Flecha:** cerrada, rellena y angosta (unos 16 × 12 px, es decir ~20° por lado), no abierta y ancha como en
  ADR-0032.
- **Líneas de referencia:** la línea de medida está desplazada de los puntos medidos y unas líneas perpendiculares
  bajan hasta ellos, sobresaliendo un poco al otro lado (`/LL`, `/LLE`).
- **Valor:** texto normal y oscuro con separador de miles (`1,551.89`), metido en un hueco de la línea.

El usuario no encontró la opción del valor dentro o encima, que solo estaba en una sección aparte del panel
Measure.

## 2. Decisión

1. **Flechas**: media apertura de 0.36 rad (~20.6°, punta de ~41°), medida en la captura. Afecta a todas las
   flechas, abiertas, cerradas e invertidas.
2. **Length**: flecha **cerrada y rellena** en ambos extremos por defecto (antes abierta). Sigue siendo editable en
   Start/End, también desde el inspector de propiedades, que ahora incluye a Length.
3. **Líneas de referencia** (Measure ▸ Distance Properties ▸ "Leader lines"):
   - Con la opción activa, tras el segundo clic un tercer clic fija cuánto se separa la línea de medida. Es el
     tercer movimiento de Acrobat, y la vista previa lo muestra en vivo.
   - Las referencias salen del punto medido y sobresalen 5 pt. Son continuas aunque la medida sea discontinua.
   - La medida sigue siendo entre los puntos medidos.
   - En el PDF se escribe `/LL` con signo, `/LLE 5` y `/LLO 0` junto a `/IT /LineDimension` y `/Measure`.
   - Una distancia de Acrobat o Revu con `/LL` y `/Measure` se importa como Length con su línea desplazada, no
     como cota. Una `/Line` con `/LL` sin `/Measure` sigue siendo cota.
   - Se selecciona haciendo clic en la línea desplazada o en sus referencias, y sus tres puntos tienen control.
4. **Separador de miles** en todos los valores: longitudes, áreas, volúmenes y pies-pulgadas (`1,234'-6"`), con
   `groupThousands`/`formatNumber`.
5. **Dónde poner el valor**: "Caption" pasa a Distance Properties del panel Measure, junto a Label, Length y Leader
   lines. El inspector de propiedades muestra "Value position" cuando hay distancias seleccionadas.

## 3. Consecuencias

- Cambia otra vez la punta de las flechas existentes (más angosta) y el extremo por defecto de Length. Se
  actualizaron las pruebas de ADR-0032 que fijaban punta de 60° y flecha abierta. La flecha de la herramienta
  Arrow sigue abierta.
- Los números de 1,000 o más llevan coma en pantalla, en el PDF y en la lista de marcas.

## 4. Evidencia

`src/core/markup/acrobatDistance.test.ts`, `src/components/PdfViewerAcrobatStyle.test.tsx` y el E2E "Distancia de
Acrobat con líneas de referencia (ADR-0033)".
