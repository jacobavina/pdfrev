# ADR-0043: Panel que se abre al seleccionar una marca

- **Estado:** Aceptado (captura del usuario, 2026-10-15: "quiero que cuando seleccione un elemento se abra en
  automático la barra de propiedades o la más importante para ese elemento")
- **Fecha:** 2026-10-15

## 1. Contexto

Los paneles Properties y Measure empiezan plegados a la derecha. Para cambiar el borde o la flecha de un callout
había que seleccionarlo y luego abrir Properties a mano. En Revu, la barra de propiedades muestra siempre lo de la
marca seleccionada.

## 2. Decisión

1. Al cambiar la selección a una o más marcas se abre su panel (`watchSelectionPanels`):
   - Si todas las marcas seleccionadas son mediciones, se abre **Measure** (escala, valor, profundidad).
   - Si no, se abre **Properties** (estilo, texto, flecha, borde).
   - Vaciar la selección no pliega ni abre nada.
2. El panel se abre al soltar el botón, no al pulsarlo. Abrirlo al pulsar estrecharía el visor en medio de un
   arrastre y movería el plano bajo el cursor.
3. Se puede apagar en **View ▸ Open Panel on Selection**. La preferencia se guarda y viene encendida por defecto.

## 3. Consecuencias

- Las pruebas E2E que hacen clic por coordenadas arrancan con la opción apagada (`addInitScript`), porque abrir un
  panel cambia el ancho del visor. La apertura automática tiene su propia prueba, que la enciende desde View.

## 4. Evidencia

`src/services/selectionPanelService.test.ts` y el E2E "Al seleccionar una marca se abre su panel de propiedades, y
se puede apagar en View (ADR-0043)".
