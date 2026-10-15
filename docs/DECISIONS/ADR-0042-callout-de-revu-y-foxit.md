# ADR-0042: Callout como el de Revu y Foxit

- **Estado:** Aceptado (capturas del usuario de Foxit y Revu, 2026-10-15: "cuando muevo el cuadro de texto el punto
  inicial en donde quedó la flecha indicando no se mueve, se mueve solo el cuadro de texto, igual quiero este estilo,
  mucho más estético")
- **Fecha:** 2026-10-15
- **Sustituye:** la geometría de directriz de A.3 (codo a mitad de camino, llegada por arriba o por abajo)

## 1. Contexto

En REA el callout se dibujaba como una caja blanca con borde grueso y una flecha cerrada. Al arrastrar la caja se
movía también la punta de la flecha, así que la llamada dejaba de señalar lo que señalaba. El codo quedaba a mitad
de camino y la directriz llegaba por arriba o por abajo de la caja.

En Revu y Foxit:
- La llamada se crea con un clic en la punta, arrastrando y soltando donde va el codo.
- La directriz llega en horizontal al centro del lado de la caja.
- La flecha es abierta y fina.
- Revu deja el texto suelto del color de la línea; Foxit dibuja una caja con borde.
- Al mover la caja, la punta se queda fija.

## 2. Decisión

1. **Geometría común** (`calloutLayout.ts`):
   - La directriz va de la punta al codo y de ahí, en horizontal, al centro del lado de la caja que mira al codo.
   - Una directriz guarda `[punta]` o `[punta, codo]`. Sin codo guardado, el codo queda a 18 pt de la caja.
   - La misma geometría la usan la pantalla, el `/AP`, el aplanado y la selección por clic.
2. **Mover la caja deja la punta fija** (`keepsLeaderTips`): se mueven la caja y el codo. En una Cloud+ que se
   mueve junto con su nube, se mueve todo.
3. **Creación como en Revu y Foxit**: el punto donde se suelta es el codo y la caja queda al lado, centrada con él.
   La vista previa muestra el dibujo final.
4. **Estilo**:
   - Directriz de 1 pt con flecha abierta de 30° a cada lado, como Revu y Foxit (las medidas siguen con la
     flecha estrecha de Acrobat). El tipo de flecha se elige en la barra (Start, con nombre y dibujo) o en
     Properties › Start: abierta, cerrada, círculo, cuadro, rombo, barra o ninguna.
   - Texto del color de la línea, en pt de página, que crece con el zoom.
   - Sin relleno no hay caja (como Revu); con relleno, caja con borde (como Foxit). Las llamadas nuevas y las notas
     de Cloud+ se crean sin caja.
5. **Tiradores de Revu**:
   - Punta y codo: círculos amarillos. Arrastrar el codo alarga o acorta el tramo horizontal.
   - Caja: círculos en las esquinas y cuadros en el centro de cada lado; un cuadro mueve solo su lado.
6. **Interoperabilidad**: el FreeText se escribe como callout estándar, con `/IT /FreeTextCallout`, `/CL` (punta,
   codo y llegada), `/LE` (flecha) y `/RD` (caja de texto dentro de `/Rect`). Así Revu y Acrobat lo reconocen como
   callout.

## 3. Consecuencias

- Las llamadas ya guardadas cambian de dibujo: conservan caja, texto y punta. La que tenía relleno blanco sigue
  mostrando caja.
- Se actualizaron las pruebas que fijaban el codo a mitad de camino, la flecha cerrada y el arrastre conjunto de
  punta y caja.

## 4. Evidencia

`src/components/RevuCallout.test.tsx` y el E2E "Callout de Revu: se suelta donde va el codo y mover la caja deja la
punta fija (ADR-0042)".
