# ADR-0104: Seleccionar y copiar el texto del plano, y submenús dentro de la ventana

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

El usuario encontró dos problemas:

1. **No se podía seleccionar el texto del plano**, ni el que ya existía en el PDF ni el que añadió el OCR. La capa de
   texto de PDF.js solo recibía el ratón con las herramientas de marcado de texto (resaltar, subrayar…); con Select o
   cualquier otra, el ratón iba a las marcas y no había forma de copiar texto.
2. **El submenú de Profiles se cortaba por abajo.** Es la última entrada del menú View, y en una ventana baja su
   submenú se salía de la pantalla: solo se veía la primera opción.

## 2. Decisión

1. **Herramienta `Select Text`** (`Shift+T`, botón *Copy* en el grupo Select de la cinta, icono Lucide `TextSelect`):
   con ella la capa de texto recibe el ratón y la capa de marcas no, así que arrastrar sobre el texto lo selecciona, con
   doble clic una palabra, y `Ctrl+C` lo copia. Con cualquier otra herramienta el ratón sigue siendo de las marcas.
2. **`Ctrl+C` con texto seleccionado** copia el texto y no las marcas (antes copiaba las marcas seleccionadas aunque
   hubiera texto seleccionado). Sin texto seleccionado copia las marcas como siempre.
3. **Páginas sin texto:** con `Select Text` activo, soltar el ratón sobre una página sin capa de texto avisa de que
   hay que ejecutar `Document ▸ OCR ▸ OCR This Page`.
4. **Submenús:** `SubmenuPopup` mide su caja al abrirse y se desplaza lo justo para quedar a 8 px del borde de la
   ventana, por abajo, por la derecha y por arriba.

## 3. Alcance y límites

- Select Text selecciona el texto del PDF en su capa de texto; no edita el PDF.
- La selección es la del navegador: no se guarda ni pasa por el historial.
- El texto que el OCR añadió se selecciona igual que el original.

## 4. Pruebas

- `src/components/SelectText.test.tsx` (4): la herramienta y su atajo, qué capa recibe el ratón con cada herramienta,
  Shift+T y Ctrl+C con y sin texto seleccionado.
- `src/components/shell/MenuBarSubmenu.test.tsx` (3): el submenú se sube, se mueve a la izquierda o se queda.
- E2E `Select Text (ADR-0104)`: arrastrar sobre el título de un PDF real selecciona su texto.
