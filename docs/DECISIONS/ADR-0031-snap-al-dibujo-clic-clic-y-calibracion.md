# ADR-0031: Snap al dibujo, clic-clic y calibración por dos puntos

- **Estado:** Aceptado (reporte del usuario, 2026-10-12: "no me funcionan los snaps… tengo que dejar picado el clic
  izquierdo… cuando le doy clic en el botón de calibrar no pasa nada y del menú me abre la antigua ventana")
- **Fecha:** 2026-10-12

## 1. Contexto

Midiendo un plano real (Site Plan, 1" = 100'), tres problemas:

1. El snap (ADR-0025) solo se ajustaba a las marcas de REA, no a las líneas del PDF, así que no se podía tomar
   exactamente la cota de 140' del plano.
2. Length, Radius, Diameter, Dimension, Line y Arrow solo se creaban arrastrando con el botón pulsado.
3. El botón Calibrate del panel activaba la herramienta sin ninguna indicación ("no pasa nada"). El menú abría el
   diálogo antiguo, que pedía una longitud sin haber marcado nada en el plano.

## 2. Decisión

1. **Snap to drawing.**
   - La geometría vectorial de la página se lee de la lista de operadores de PDF.js: líneas, rectángulos y curvas
     (por su cuerda), con `cm`, `save`/`restore` y XObjects de formulario; los trazados de solo recorte se descartan.
   - Pasa a segmentos normalizados con la rotación de la vista y se indexa en una rejilla
     (`ContentSnapIndex`), así que el snap consulta solo lo cercano al cursor. Hay un límite de 400 000 segmentos
     por página.
   - Se extrae una vez por página y rotación, al usar una herramienta con snap. Si falla, se avisa y el snap sigue
     con las marcas.
   - Nuevo modo **Intersection**: cruce de dos líneas, del plano o de marcas.
   - El panel Measure ofrece Intersection y "Snap to drawing", recordados como el resto.
2. **Clic-clic** en las herramientas de dos puntos: clic en el punto 1, el trazo sigue al cursor con snap y clic en
   el punto 2. El arrastre sigue funcionando. Esc, o un segundo clic en el mismo punto, cancela; cambiar de
   herramienta abandona el trazo.
3. **Calibración, un solo flujo.**
   - Calibrate (cinta, panel o Tools ▸ Measure ▸ Calibrate Page Scale…) activa la herramienta y muestra un aviso
     sobre el visor.
   - Dos clics con snap abren el diálogo nuevo: distancia medida en pt, distancia conocida (acepta `140'` o
     `12'-6 1/2"`), unidad (mm, cm, m, in, ft, ft'in), precisión acorde a la unidad y "Apply to all pages".
   - La escala se guarda como relación legible: `1 in = 50'-4 13/16"` en unidades imperiales, `1 cm = …` en
     métricas. Se recuerda la última unidad.
   - Esc sin trazo sale de la herramienta. Se retira la entrada duplicada "Calibrate by Two Points".
   - El indicador de escala de la barra de estado abre el panel Measure en lugar del diálogo antiguo.
4. **Recalcular al calibrar.**
   - Cambiar la escala de una página recalcula sus mediciones. El texto solo se sustituye si era el valor, nunca un
     comentario del usuario.
   - Abrir un documento, que carga sus escalas, no recalcula ni marca cambios.
   - El cálculo vive en `remeasureMarkup`, compartido con el arrastre de vértices.

## 3. Consecuencias

- La primera vez que se usa una herramienta con snap en una página, PDF.js recorre su lista de operadores. En un
  plano muy grande puede tardar un momento hasta que el snap al dibujo esté disponible.
- El recálculo por cambio de escala no entra en el historial, igual que la propia escala.

## 4. Evidencia

`src/core/markup/contentSnap.test.ts`, `src/components/PdfViewerCalibrate.test.tsx` y el E2E "Snap al dibujo,
clic-clic y calibración por dos puntos (ADR-0031)".
