# ADR-0119: Sets

- **Estado:** Aceptado
- **Fecha:** 2026-10-22

## 1. Contexto

Último de los cuatro paneles extra de Revu pendientes (Links, Flags, Spaces y Sets). Un proyecto de obra son decenas de
hojas en archivos distintos y REA solo abría de uno en uno desde Recientes.

## 2. Decisión

1. **Un set es una lista con nombre de archivos PDF** (hasta 500 por set y 50 sets). Guarda **rutas**, no archivos: no se
   copia ni se cambia nada. Se guardan en el almacenamiento local (`rea-sets`, con versión) y lo corrupto se descarta
   sin romper el resto.
2. **Panel Sets** (pestaña del riel con el icono de biblioteca y `View ▸ Panels ▸ Sets Panel`):
   - Crear un set vacío (nombre escrito y **+**, o Enter) o con los documentos abiertos que tienen ruta (botón de la
     biblioteca). Los nombres no se repiten ("Obra", "Obra (2)").
   - Desplegar un set para **añadir archivos** (selector con varios PDF) o **añadir los abiertos**, reordenar con las
     flechas, quitar archivos y renombrar el set. Las rutas se comparan sin distinguir mayúsculas ni tipo de barra y no
     se repiten; lo que no es `.pdf` se ignora; el aviso cuenta lo añadido, lo repetido y lo que no cupo.
   - **Abrir un archivo** (clic) o **todo el set** (botón de carpeta) con el abrir por ruta de siempre: cada documento va
     a su pestaña y, si ya estaba abierto, se va a ella. Un punto marca los abiertos. Los que fallan se listan al final.
   - Borrar un set no toca los archivos.
3. **Solo en la aplicación de escritorio:** en el navegador los documentos no tienen ruta, así que el panel lo explica y
   no ofrece nada más.

## 3. Alcance y límites

- No hay búsqueda dentro del set, ni compartirlo entre equipos, ni carpetas anidadas.
- Si un archivo se movió o se borró, no se sabe hasta intentar abrirlo: el aviso lo dice.
- La parte de escritorio (selector de archivos y abrir por ruta) solo la ejercita el usuario en la ventana nativa: las
  pruebas automáticas cubren la lógica, el almacenamiento y el panel con esas dos piezas sustituidas.

## 4. Pruebas

- `src/core/sets/pdfSets.test.ts` (6): rutas, nombres únicos, añadir con repetidos y tope, quitar y mover, y guardado.
- `src/components/panels/SetsPanel.test.tsx` (9): aviso en el navegador, crear, crear con lo abierto, añadir con el selector,
  abrir uno y abrir todo con fallos, editar, guardado y menú.
- E2E `Sets (ADR-0119)`: el aviso del navegador.
