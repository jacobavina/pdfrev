# ADR-0061: Autosize Text de Revu en callouts y cuadros de texto

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0040 (tipografía de las marcas) y ADR-0042 (callout de Revu)

## 1. Contexto

El usuario mostró la barra del Callout de Revu:
- línea, opacidad, tipo y grosor;
- extremo (End) y tamaño (Auto);
- relleno y opacidad, y forma (Shape);
- fuente, tamaño, Autosize Text y estilo.

Pidió integrar **Autosize Text** donde aplique. En Revu, con esa opción, el texto de la marca cambia de tamaño al
redimensionar la marca. No hay documentación pública de su algoritmo. Se toma la interpretación de que el texto adopta el
mayor tamaño con el que cabe en su caja.

## 2. Decisión

1. **Módulo puro `src/core/markup/autosizeText.ts`:**
   - `autosizeFontSize` da el mayor tamaño, en pasos de 0.5 pt entre 4 y 144, con el que el texto envuelto por palabras
     cabe en la caja.
   - Usa el mismo `wrapCalloutText` y los mismos márgenes que el dibujo: callout con 16 pt de inserción y 3 pt entre
     líneas; cuadro de texto con 12 pt y 2 pt.
   - `effectiveTextSize` devuelve ese tamaño con `customFields.autoSizeText = 1`, o el tamaño elegido si no.
2. **El mismo tamaño en tres sitios:**
   - **Pantalla:** el cuadro de texto ahora también envuelve el texto y escala con el zoom, como ya hacía su `/AP`.
   - **`/AP` y aplanado.**
   - **`/DA` del FreeText:** la caja se calcula igual que en el `/AP`, para que Revu y Acrobat partan del mismo tamaño
     al editar.
3. **Redimensionar:** al redimensionar la caja, el texto crece o encoge, porque el tamaño se calcula de la caja en cada
   dibujo. Al confirmar el texto de un callout con Autosize, la caja se conserva y el texto se ajusta a ella; sin
   Autosize, la caja se sigue ajustando al texto, como antes.
4. **Barra de propiedades:**
   - Botón `ribbon-autosize-text` junto al tamaño de fuente, con una A y flechas hacia las esquinas como el de Revu.
   - Con selección, alterna la opción en los callouts y cuadros de texto seleccionados.
   - Sin selección, con Callout, Text o Cloud+, la fija para los nuevos (`useToolStore.autoSizeText`). La nota de Cloud+
     es un callout y la hereda.

**Fuera de alcance** (otras opciones de esa barra de Revu): Shape del cuadro y el tamaño "Auto" del extremo.

## 3. Verificación

- `src/core/markup/autosizeText.test.ts`:
  - `da el mayor tamaño con que el texto cabe en la caja y crece o encoge con ella`
  - `la pantalla, el /AP y el /DA escriben el texto del callout con el tamaño que llena la caja`
- `src/components/RevuEditing.test.tsx`: `Autosize Text de la barra se activa en el callout seleccionado y en los callouts nuevos (ADR-0061)`
- Revisado en la vista previa del navegador: un callout con Autosize pasa de 9.5 pt a 30 pt en dos líneas al agrandar
  su caja.
