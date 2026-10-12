# ADR-0021: Puntos de control, nube estilo Revu, zoom con doble clic y tema del sistema

- **Estado:** Aceptado (pedidos del usuario, 2026-10-11, con capturas de Revu)
- **Fecha:** 2026-10-11

## 1. Contexto

En Revu la nube cambia de forma arrastrando sus vértices, tiene "Nube" como tipo de línea con Tamaño e Invertir,
y el doble clic en el plano muestra un control de zoom. Las nubes de REA tenían lóbulos planos y pequeños. El
usuario pidió además que el tema siga al del sistema y, si no hay preferencia, oscuro.

## 2. Decisión

1. **Puntos de control** (`core/markup/controlPoints.ts`): con una sola marca seleccionada aparecen tiradores
   amarillos. Rectángulo/elipse: esquinas con la opuesta fija. Nube/área de 2 puntos: al arrastrar un vértice pasa a
   polígono de 4. Líneas, polilíneas, polígonos y cotas: cada vértice (el tercero de la cota mueve su desfase). La
   medida (y el texto de una cota no personalizada) se recalcula en vivo; un solo paso deshacible (`reshapeMarkup`).
   Esc cancela.
2. **Festón estilo Revu** (`core/markup/revisionCloud.ts`): lóbulos de arco circular de 200° (3 cúbicas), cuerda =
   Tamaño × 10 pt, Invertir los vuelve hacia dentro. Mismo trazado en pantalla (escalado con el zoom real), /AP y
   aplanado. **Propiedades**: "Nube" como tipo de línea (rectángulo/polígono ↔ nube, deshacible), Tamaño de arco e
   Invertir.
3. **Control de zoom**: doble clic en zona vacía con Seleccionar/Mano → + y − acercan/alejan manteniendo ese punto,
   el centro centra la vista; Esc o clic fuera lo cierran.
4. **Atajos de medición de Revu**: Shift+Alt+L longitud, Shift+Alt+Q polilongitud, Shift+Alt+A área, Shift+Alt+C conteo.
5. **Tema**: sin elección del usuario sigue `prefers-color-scheme` (también si cambia con la app abierta); sin
   preferencia del sistema, oscuro. Ver → "Usar el tema del sistema" vuelve a seguirlo.

## 3. Consecuencias

- Cloud+ de Revu es nube + directriz con hombro y texto sin caja; REA conserva su llamada con caja (pendiente).
- Faltan las mediciones Perímetro, Ángulo, Radio, Diámetro, Volumen y Recorte (siguiente lote).

## 4. Evidencia

`src/components/PdfViewerDimension.test.tsx`, `src/core/markup/dimensionCloud.test.ts` y el E2E de ADR-0019/0020/0021.
