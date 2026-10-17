# ADR-0067: Callout y nube con tipo de línea, y callout con dos clics

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0041 (tipos de línea) y ADR-0042 (callout)

## 1. Contexto

El usuario encontró tres problemas al editar marcas:

1. **El callout no cambiaba de tipo de línea.** El panel guardaba el discontinuo (la lista marcaba "Dashed 1"), pero
   la pantalla dibujaba la directriz y la caja continuas. En el /AP la primera directriz salía discontinua y las
   siguientes no, porque la punta de flecha deja el trazo continuo.
2. **El callout solo se creaba arrastrando.** Un clic sin arrastre no hacía nada; había que mantener el botón pulsado.
3. **La nube se convertía en rectángulo.** Cualquier tipo de línea distinto de Cloud convertía la nube en rectángulo
   o polígono. La Cloud+, en cambio, seguía siendo nube con el discontinuo, que es lo que el usuario espera.

## 2. Decisión

1. **Callout con tipo de línea:**
   - En pantalla, la directriz y el borde de la caja llevan el discontinuo; la punta de flecha sigue continua, como en
     las medidas.
   - En el /AP, cada directriz vuelve a fijar el discontinuo antes de trazarse.
2. **Callout con dos clics:** se añade a las herramientas de clic-clic (ADR-0031):
   - primer clic en la punta de la flecha;
   - la vista previa sigue al cursor;
   - segundo clic donde va el texto.
   - Arrastrar sigue funcionando igual.
3. **Nube como la Cloud+:**
   - Solid y los discontinuos (Dashed 1–6, Dotted) la dejan como nube, continua o discontinua.
   - Solo un patrón (Fenceline, Gas, Tracks…) la vuelve rectángulo o polígono, porque no se combina con los lóbulos
     (sin cambios respecto de ADR-0041).
   - La lista de tipos de línea muestra el discontinuo de una nube discontinua, y el tamaño y la inversión de los
     lóbulos siguen editables.
   - Al cambiar el grosor se conserva el discontinuo de la nube.

## 3. Pruebas tocadas

Ninguna prueba existente cambia. La de ADR-0041 que convierte una nube en rectángulo con Tracks sigue valiendo,
porque Tracks es un patrón.

## 4. Verificación

- `src/components/RevuCallout.test.tsx`:
  - `el tipo de línea del callout discontinúa la directriz y el borde de la caja, en pantalla y en el PDF; la punta sigue continua (ADR-0067)`.
    Falla sin el arreglo del /AP.
  - `clic en la punta y clic donde va el texto crean el callout sin mantener el botón pulsado (ADR-0067)`
- `src/components/RevuLineStyles.test.tsx`:
  - `en una nube, un discontinuo o Solid la dejan como nube y la lista lo muestra; solo un patrón la vuelve rectángulo (ADR-0067)`
- Capturas con Playwright a 1440 × 900:
  - un callout creado con dos clics y con Dashed 1;
  - un rectángulo convertido en nube y después en Dashed 1, que sigue siendo nube con lóbulos discontinuos.
