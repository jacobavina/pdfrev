# ADR-0125: Procesos por lotes (Batch)

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Oleada 4 de `docs/plan-v2/10-brecha-menus-revu.md`: Revu aplica una operación a decenas de PDF sin abrirlos uno a uno.
Entregar un juego de planos con marcas aplanadas y numeradas exigía abrir, exportar y cerrar cada archivo a mano.

## 2. Decisión

1. **File ▸ Batch…** (no necesita un documento abierto): se añaden PDF (selector de varios archivos; hasta 200, sin repetir
   el mismo), se elige la operación y **Run**.
2. **Operaciones**, todas sobre los bytes del archivo:
   - **Flatten:** dibuja las marcas de REA del archivo en el contenido de las páginas y **quita sus anotaciones** (por su
     `/NM`) para que no salgan dos veces; las anotaciones ajenas se dejan. Un archivo sin marcas falla con un motivo claro.
   - **Number pages:** el texto con campos (`{n}`, `{total}`, `{page}`, `{pages}`) en la esquina o el centro elegido,
     sobre todas las páginas y derecho en las rotadas (el mismo estampado que Number Pages).
   - **Rotate:** suma 90°, 180° o 270° a la rotación de cada página.
3. **Salida:** nunca se cambia el original. Cada resultado se guarda como `<nombre>_flattened.pdf`, `_numbered.pdf` o
   `_rotated90|180|270.pdf` (con número si dos entradas darían el mismo nombre). En la aplicación de escritorio se elige la
   carpeta y se escribe con `save_export_file` (un archivo con ese nombre se reemplaza); en el navegador se descargan.
4. **Fallos:** cada archivo va aparte. Si uno falla (dañado, cifrado, sin marcas para aplanar, error al guardar) se marca
   con su motivo y el lote sigue. Al final: resumen "N of M processed" y **Save report** (CSV: archivo, resultado, salida,
   mensaje). Mientras corre no se puede cerrar ni quitar archivos.

## 3. Alcance y límites

- No incluye OCR por lotes (necesita el motor nativo página a página), cabeceras y pies, ni resumen: son operaciones sobre
  el documento abierto (ADR-0114 y siguientes) y se pueden añadir como nuevas operaciones del lote.
- Los PDF cifrados con contraseña no se procesan (se marcan como fallidos).
- Todo se hace en memoria: lotes de archivos muy grandes tardan y usan memoria; el tope de 200 es una guarda.

## 4. Pruebas

- `src/services/batchOps.test.ts` (9): nombres de salida, rotar, numerar, quitar anotaciones por nombre, **aplanar un PDF
  con marcas guardadas por REA** (dibuja y quita las anotaciones), sin marcas, lote con un fallo y con un fallo al guardar,
  e informe.
- `src/components/modals/BatchDialog.test.tsx` (8): menú sin documento, lista y duplicados, girar con sufijos, numerar con
  texto obligatorio, fallos e informe, aplanar sin marcas, destino cancelado y Escape. Encontró un defecto: el diálogo se
  reiniciaba al terminar la tarea; ya está corregido.
- E2E `Batch (ADR-0125)`: dos PDF reales se giran y se descargan con su sufijo sin tocar el documento abierto.
