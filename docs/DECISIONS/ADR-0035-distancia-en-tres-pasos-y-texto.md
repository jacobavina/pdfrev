# ADR-0035: Distancia en tres pasos como Acrobat, puntas de diseñador y texto editable

- **Estado:** Aceptado (tres capturas del usuario del flujo de Acrobat, 2026-10-14: "no me deja desplazar las guías
  de la medición… no vienen opciones para modificar texto como fuentes, tamaño, color… las flechas son enormes y no
  se ven finas, se ven muy redondeadas, gruesas")
- **Fecha:** 2026-10-14

## 1. Contexto

Las capturas muestran la herramienta Distancia de Acrobat en tres pasos:
1. Clic, clic: una línea fina con guías cortas en los extremos y el valor al lado, sin flechas.
2. Al mover el mouse, la línea se desplaza en paralelo y las guías se estiran desde los puntos medidos (una "U").
3. Tercer clic: flechas cerradas pequeñas y afiladas, y el valor en un hueco de la línea.

En REA el desplazamiento era opcional y venía apagado, no se podía mover después y el texto no tenía opciones.
Las puntas se dibujaban rellenas **y con contorno de unión redondeada**, lo que las engordaba, sobre una línea de
2 pt por defecto.

## 2. Decisión

1. **Tres pasos por defecto** (Measure ▸ Distance Properties ▸ Leader lines, ahora activo y recordado):
   - Las vistas previas imitan a Acrobat: sin flechas, con las guías y el valor junto a la línea.
   - Un tercer clic sobre la propia línea la deja sin desplazar, y la distancia conserva sus guías cortas.
   - **Arrastrar** sigue creando una distancia rápida de dos puntos.
   - Con Leader lines apagado vuelve el flujo de dos clics.
2. **Mover las guías después**: una distancia sin desplazar tiene un tercer tirador en el centro de su línea.
   Arrastrarlo desplaza la línea en paralelo y crea sus guías (la medida no cambia).
3. **Puntas de diseñador**:
   - Las formas rellenas (flecha cerrada e invertida, círculo, cuadrado, rombo) son solo relleno, sin contorno.
   - Las flechas abiertas usan unión en ángulo vivo y extremos rectos.
   - Media apertura de ~16° (punta de ~32°), medida en la captura final.
   - Se aplica igual en pantalla, en el `/AP` y en el aplanado.
   - Grosor por defecto de las marcas nuevas: **1 pt**.
4. **Texto del valor editable** (inspector de propiedades ▸ Text, con la selección de mediciones):
   - Fuente estándar de PDF: Helvetica, Times o Courier.
   - Tamaño (por defecto 8 pt), color, negrita y cursiva.
   - El `/AP` usa la fuente estándar correspondiente (por ejemplo `/TiBI` → Times-BoldItalic, sin incrustar) y el
     aplanado la declara igual.
   - El hueco de la línea se mide con las métricas de la fuente: Courier exacta, Times aproximada.
5. **Presupuesto del bundle**: la lista de marcas se carga bajo demanda. El bundle principal baja de ~799 KiB a
   ~754 KiB, lo que deja margen para el rediseño visual que sigue.

## 3. Consecuencias

- Las pruebas que medían con dos clics fijan `measureLeaders: false`, y las E2E de dos clics añaden el tercer clic
  sobre la misma línea.
- Las aserciones del `/AP` que esperaban "relleno y contorno" (`b`) pasan a "relleno" (`f`).

## 4. Evidencia

`src/components/PdfViewerAcrobatFlow.test.tsx` y las pruebas actualizadas de ADR-0018/0032/0033.
