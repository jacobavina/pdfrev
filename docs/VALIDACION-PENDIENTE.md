# Lista de validación pendiente del usuario (ADR-0100 a ADR-0131)

> Fecha: 2026-10-23. Todo lo de abajo está implementado, probado en jsdom y en el navegador (E2E ×3) y la aplicación nativa
> arranca y pasa el smoke. Falta lo que solo se puede juzgar con tu ventana nativa, tu impresora, tus archivos o Revu/Acrobat.
> Las filas de cada punto están en `PARITY.md` (busca el ADR). Los ADR-0017 a ADR-0098 también tienen filas pendientes en
> `PARITY.md`; esta lista cubre lo más reciente.

## Ya verificado por ti

Rejilla (ADR-0106), Replace Pages y Split Document (ADR-0114).

## Ventana nativa, sin archivos especiales

| ADR | Qué probar |
|---|---|
| 0127 | View ▸ Full-Screen Crosshair (Shift+F8): la cruz sigue al cursor **solo dentro de la hoja y su fondo**; no pasa por paneles, cinta ni barra de estado; se quita con otra pulsación. |
| 0128 | Edit ▸ Sketch to Scale…: rectángulo 4 × 3, círculo, línea con ángulo y polígono; nace en el centro, seleccionado; se arrastra; Undo la quita. En un plano **con escala** comprueba con Length que mide lo escrito. |
| 0131 | Ctrl+K activa Hyperlink; Shift+H sigue siendo el resaltado de texto. |
| 0107 | Offset (O) y Multiply (Ctrl+M): copias paralelas y cuadrícula de copias; ¿se entiende el ícono nuevo de Offset? |
| 0108 | Menús en ventana baja: ya se alcanzan todas las opciones de View y Edit (cierre de tu captura). |
| 0109 | Paste in Place (Ctrl+Shift+V), Copy/Paste Format (Ctrl+Shift+C, Ctrl+Alt+V), Hide / Show Hidden. Pendiente aparte: que **Revu oculte** las marcas con el bit Hidden. |
| 0110 | Lasso (Shift+O) y Undo History: saltar a un punto del historial. |
| 0111 | Revisión de íconos nuevos (Offset, Multiply, Paste in Place, Redact, Flatten…) y el plan de diseño de `docs/plan-v2/11-plan-de-diseno.md`. |
| 0112, 0113 | Document Properties, Crop Pages y Number Pages: que el recorte y los números se vean bien en una página rotada. |
| 0114 | Headers & Footers: campos `{n}`, `{file}`, `{date}`… en el plano. |
| 0120 | F11 (pantalla completa), Shift+F4 (ocultar paneles) y siempre encima con tu pantalla real. |
| 0116, 0117, 0118 | Paneles Links, Flags (Ctrl+Alt+F) y Spaces con tus datos. |
| 0123 | Document ▸ Insert Pages from File…. |
| 0124 | Document ▸ Page Labels… y que **Revu lea** las etiquetas guardadas. |

## Con archivos reales

| ADR | Qué necesitas | Qué probar |
|---|---|---|
| 0115 | Impresora real | File ▸ Print… (Ctrl+P): páginas, con/sin marcas, ajustar al papel, tamaño real, blanco y negro. |
| 0118 | Plano medido con espacios | Panel Spaces. |
| 0119 | Carpeta de PDF | Panel Sets: selector de archivos y abrir por ruta (solo escritorio). |
| 0116 | PDF con enlaces | Panel Links: enlaces rotos y navegación. |
| 0121 | Formulario real | Panel Forms. |
| 0122 | PDF firmado real | Panel Signatures (motivo y lugar con acentos). |
| 0125, 0126, 0130 | Carpeta de planos | File ▸ Batch…: Flatten, Number, Rotate, **Reduce** y **Headers & Footers** (`_stamped`) con elección de carpeta y informe CSV. |
| 0126 | Plano escaneado real | Document ▸ Reduce File Size…: calidades, ahorro y que se siga leyendo bien. |
| 0129 | Juego de planos y su revisión | Document ▸ Slip Sheet…: emparejamiento por número de lámina (A-101…), cambios manuales y que las marcas queden en su sitio. |
| 0128 | Plano calibrado | Ver Sketch to Scale arriba. |

## Revu / Acrobat

- ADR-0109: Revu oculta las marcas Hidden.
- ADR-0124: Revu lee las etiquetas de página.
- ADR-0100 a ADR-0105 (OCR nativo, redacción, `.btx`): abrir el `.btx` en Revu, redacción por contenido, Tool Sets de tu carpeta de Revu.

## Pendiente de decisión tuya

- **Reuse** (menú Tools de Revu): no tengo claro qué hace en tu instalación; dime qué función es (o una captura del menú) y la hago.
- **Security** (ADR-0099): sigue documentada como pendiente; requiere tu decisión sobre contraseñas y permisos.
- **Colapsar la cinta en ventanas estrechas e indicador de herramienta activa** (plan de diseño): necesitan tu decisión.
