# ADR-0105: Importar los Tool Sets que Revu ya tiene instalados

- **Estado:** Aceptado
- **Fecha:** 2026-10-22
- **Amplía:** ADR-0101 (Tool Sets `.btx`)

## 1. Contexto

ADR-0101 dejó importar un `.btx` elegido a mano. El usuario esperaba que REA **leyera directamente la carpeta de Revu**,
donde ya están sus Tool Sets (`%APPDATA%\Bluebeam Software\Revu\21`: Architect Review, Concrete, Electrical…), sin buscar
cada archivo.

## 2. Decisión

1. **Dos comandos de Rust** (`src-tauri/src/revu.rs`):
   - `list_revu_toolsets`: los `.btx` de `%APPDATA%\Bluebeam Software\Revu` y de sus carpetas de versión, ordenados;
   - `read_revu_toolset`: lee uno, solo si tiene extensión `.btx` y su ruta canónica está dentro de la carpeta de
     Bluebeam (no sigue `..` ni enlaces que salgan de ella). No da acceso a ningún otro archivo.
2. **Botón "Import tool sets installed with Revu"** en el Tool Chest, junto a los de importar y exportar. Abre un diálogo
   con cada Tool Set (título y número de herramientas, leídos del archivo), "Select all" y un botón Importar que crea una
   paleta por cada uno elegido. Un título repetido recibe número ("Concrete (2)").
3. **Sin Revu** o en el navegador la lista sale vacía y el diálogo explica dónde busca y que se puede importar un `.btx`
   de cualquier sitio con el botón de subir.

## 3. Alcance y límites

- Importa lo mismo que ADR-0101: los sellos con arte propio y las partes hijas de las herramientas compuestas no se
  importan, y el aviso final cuenta cuántas herramientas se quedaron fuera.
- Solo lee: no escribe ni modifica nada en la carpeta de Revu.
- Solo Windows (usa `%APPDATA%`).

## 4. Pruebas

- Rust `revu::tests` (3): lista de todas las carpetas de versión, carpeta ausente, y lectura limitada a `.btx` dentro de
  la carpeta (rechaza otras extensiones, archivos de fuera y rutas con `..`).
- `src/components/toolchest/RevuToolSetsDialog.test.tsx` (3): lista con título y número de herramientas, selección e
  importación de una paleta por Tool Set, y casos de nombre repetido y carpeta vacía.
- Prueba de humo nativa: lista y lee los Tool Sets reales por el IPC de la ventana y comprueba que rechaza
  `C:/Windows/win.ini`.
