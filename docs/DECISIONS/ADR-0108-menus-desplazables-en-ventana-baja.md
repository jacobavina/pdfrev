# ADR-0108: Menús desplazables en ventana baja

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

El usuario no veía todas las opciones de los menús (View, Document…): con la ventana baja el menú se salía por debajo
de la pantalla y las últimas entradas eran inalcanzables. ADR-0104 solo arregló los submenús.

## 2. Decisión

1. El menú desplegable de cada pestaña limita su altura a la de la ventana (`max-h-[calc(100vh-3.5rem)]`) y se
   desplaza por dentro (`overflow-y-auto`): todas las entradas se alcanzan con la rueda.
2. Como un contenedor con desplazamiento recortaría a los submenús absolutos, `SubmenuPopup` pasa a posición fija: se
   coloca a la derecha de su entrada, a la izquierda o pegado al borde derecho si no cabe, a 8 px del borde inferior y
   superior, y su altura se limita a la de la ventana con desplazamiento propio.

## 3. Alcance y límites

- El menú no se reposiciona mientras está abierto: si se redimensiona la ventana, se cierra y se vuelve a abrir.
- El menú contextual del lienzo conserva su ajuste propio (ADR-0092).

## 4. Pruebas

- `src/components/shell/MenuBarSubmenu.test.tsx` (4, reescritos: antes medían una transformación, ahora la posición
  fija): submenú que se sale por abajo, por la derecha, que cabe, y menú de arriba desplazable.
- E2E `Menús en ventana baja (ADR-0108)`: ventana de 900×480, View se desplaza por dentro y Profiles queda entero.
