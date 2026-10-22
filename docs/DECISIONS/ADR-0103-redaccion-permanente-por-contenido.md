# ADR-0103: Redacción permanente por contenido

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase F, Hito F.2

## 1. Contexto

Para enviar un plano a obra o a un tercero hay que tapar datos sensibles (nombres, importes, firmas) de forma que no se
puedan recuperar. Una caja negra dibujada encima no basta: el texto sigue en el archivo y se puede copiar o extraer. El
usuario eligió la **redacción por contenido**: quitar el contenido del flujo de la página, no rasterizar todo.

## 2. Decisión

1. **Marca de redacción:** herramienta `Redact` (grupo Text & Review). Dibuja un rectángulo rojo discontinuo y
   translúcido (`customFields.redact = 1`, asunto "Redaction"); se selecciona, mueve y redimensiona como cualquier
   rectángulo. En el PDF es una anotación `/Square` con el marcador propio de REA.
2. **Motor (`contentStream.ts`, `contentRedaction.ts`):** lee el flujo de contenido de la página, sigue el estado
   gráfico (matriz, texto, fuentes) y lo reescribe:
   - **Texto:** se quita cada glifo cuya caja cae al menos en un 30 % dentro de una redacción, con la caja calculada
     con la fuente real de la página (anchos de `/Widths` o `/W`, Helvetica, Courier). El resto de la línea no se mueve:
     el avance del glifo quitado pasa a un ajuste de `TJ`. Funciona con `Tj`, `TJ`, `'`, `"`, `Tc`, `Tw`, `Tz`, `Ts`,
     fuentes simples y de 2 bytes. El texto quitado deja de estar en el archivo.
   - **Trazados:** se quitan los que caen enteros dentro de la caja.
   - **Texto alternativo:** `/ActualText`, `/Alt` y `/E` del contenido marcado se vacían en las páginas redactadas.
   - Después se dibuja la caja negra opaca.
3. **Alternativa segura:** si bajo la redacción hay una imagen, un formulario XObject, una imagen en línea o un
   sombreado, no se pueden editar con precisión: la página se sustituye por su imagen a 200 ppp con las cajas en
   negro. La imagen es lo único que queda en ella, y el aviso lo dice.
4. **`Document ▸ Redaction ▸ Apply Redactions…`:** pide confirmación (no se deshace), aplica todas las marcas del
   documento, las quita y recarga el PDF conservando la página y el zoom. Cuenta caracteres y trazados quitados.
5. **Search & Redact:** `Document ▸ Redaction ▸ Mark Search Results for Redaction` convierte cada línea de cada
   resultado de la búsqueda actual en una marca, para revisarlas antes de aplicar.

## 3. Alcance y límites

- Los trazados que solo **cruzan** la caja (una línea larga que pasa por ella) se tapan pero no se cortan: siguen en
  el archivo. Lo sensible suele ser texto, y eso sí se quita.
- El texto dentro de **formularios XObject** no se edita: esa página usa la alternativa de imagen.
- Fuentes sin anchos propios (Times y similares): las cajas de sus glifos son aproximadas; el aviso las nombra.
- **No se redactan** las anotaciones, los metadatos del documento ni los marcadores: lo que pueda repetir el dato
  sensible ahí hay que revisarlo aparte.
- La aplicación cambia el documento abierto y no pasa por el historial: se guarda con Save y no se deshace con Ctrl+Z.
  El diálogo avisa de guardar antes una copia.
- Revu no reconoce estas marcas como anotaciones `/Redact` propias; la redacción se aplica en REA antes de compartir.

## 4. Pruebas

- `src/core/pdf/contentRedaction.test.ts` (6): el **test de oro** (el texto no está en el contenido ni lo extrae
  PDF.js), el texto siguiente en su sitio, trazados, imágenes, `TJ` con interletrado y `Tz`, y el lector de contenido.
- `src/services/redactionService.test.ts` (7): marcas, giro, aplicación, alternativa de imagen, flujo completo y
  Search & Redact.
- E2E `Redacción permanente (ADR-0103)`: una caja sobre el título lo quita de la capa de texto de un PDF real.
