# ADR-0037: Sistema visual en Tool Chest, panel izquierdo y miniaturas

- **Estado:** Aceptado (continuación de ADR-0036, pedido del usuario "continua", 2026-10-14)
- **Fecha:** 2026-10-14

## 1. Contexto

ADR-0036 llevó el sistema visual a la mayor parte de la app. Quedaron con estilos antiguos el Tool Chest, el panel
izquierdo (marcadores y capas), las miniaturas de página y las pestañas del panel izquierdo. El Tool Chest además
conservaba un texto en español ("Limpiar"), aunque la interfaz es en inglés (ADR-0022).

## 2. Decisión

1. **Tool Chest.**
   - Encabezado de 40 px con `ui-panel-title`.
   - Secciones con `ui-section-title`, campos `ui-input` y herramientas en tarjetas sobre `cad-field`.
   - Aviso de modo en memoria en ámbar translúcido.
   - "Limpiar" pasa a "Clear", como botón de peligro discreto.
2. **Panel izquierdo.**
   - Ancho de 240 px, encabezados de 40 px y títulos de sección del sistema.
   - Contadores de capas como `ui-badge` y botones fantasma.
   - Pestañas verticales de 32 px con el acento suave, como la cinta.
3. **Miniaturas.** Tarjetas redondeadas con sombra fina. La página activa lleva un anillo del acento y el número
   de página va en tabular.

## 3. Evidencia

La suite completa y las E2E sin cambios: los `data-testid` y textos que usan las pruebas no cambian, salvo "Clear",
que ninguna prueba usaba.
