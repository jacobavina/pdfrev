# ADR-0034: Interfaz más limpia y guías en los extremos de las distancias

- **Estado:** Aceptado (captura y pedido del usuario, 2026-10-14: "no me aparecen las guías a los extremos cuando
  creo la dimensión, el texto creo que está desproporcionado al tamaño de las flechas… quiero que visualmente sea
  más estética y mejor organizada, los botones grandes de abrir y guardar son horribles")
- **Fecha:** 2026-10-14

## 1. Contexto

- Las guías de una distancia solo aparecían con "Leader lines" (tercer clic), apagado por defecto.
- El valor a 10 pt quedaba grande frente a la flecha de una línea de 1 pt.
- La cinta empezaba con cuatro botones grandes de archivo (Open, Save, Save As, Export) y un grupo History.
  Rompían el ritmo visual del resto de herramientas, y Save se resaltaba en ámbar.
- En ventanas bajas, la lista de marcas (200 px fijos) dejaba al plano una franja.

## 2. Decisión

1. **Guías por defecto.** Toda distancia sin desplazamiento dibuja marcas perpendiculares de 12 pt centradas en sus
   extremos, como la distancia superior de la captura de Acrobat. Aparecen en pantalla, en la vista previa, en el
   `/AP` y en el aplanado. Con "Leader lines" el tercer clic sigue desplazando la línea, y las guías llegan a los
   puntos medidos.
2. **Texto de medición a 8 pt.** La flecha de una línea de 1 pt (9 pt) es ~1.1 veces el texto, la proporción de la
   captura.
3. **Barra de acceso rápido** junto a los menús, como la de Revu: iconos de 26 px para abrir, guardar, guardar como,
   deshacer, rehacer y exportar. Un punto ámbar sobre Guardar indica cambios pendientes. Conserva los `data-testid`
   y títulos anteriores. La cinta pierde los grupos File e History.
4. **Cinta.**
   - Grupos con más aire.
   - Rótulos en versalitas pequeñas y separadores suaves.
   - Botones de herramienta uniformes de 30 × 26 px.
   - La herramienta activa se marca con el acento en suave y un borde fino, en lugar de un bloque azul sólido.
   - Barra de desplazamiento horizontal de 3 px, para que no tape los rótulos en ventanas estrechas.
5. **Paleta.**
   - Oscuro: grafito con un toque azul, con paneles un escalón sobre el fondo y un lienzo más profundo.
   - Claro: más limpio.
   - Acento azul más vivo en ambos temas.
   - Logo con degradado. La barra de menús conserva sus 32 px y la cinta mide 70 px (4 px más que antes), para
     no quitarle altura al plano.
6. **Lista de marcas** limitada al 38 % de la altura de la ventana.

## 3. Consecuencias

- Las distancias existentes muestran guías en los extremos al abrirlas en REA y en el PDF que se guarde.
- Se actualizaron las aserciones que contaban las líneas de una distancia, porque ahora incluyen las dos guías.

## 4. Evidencia

`src/components/shell/QuickAccessToolbar.test.tsx`, `src/core/markup/acrobatStyle.test.ts` y los E2E existentes,
que usan los mismos `data-testid` de guardar y exportar desde la barra nueva.
