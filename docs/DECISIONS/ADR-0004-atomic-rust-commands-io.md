# ADR-0004: Comandos Atómicos en Rust (`write_bbx` y `read_bbx`) para Persistencia Segura

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Autores:** Equipo REA

---

## 1. Contexto
En aplicaciones de escritorio técnicas, los fallos de suministro eléctrico, cierres abruptos o errores del sistema de archivos durante la escritura de anotaciones pueden corromper el archivo en disco, ocasionando pérdidas irrecuperables de horas de trabajo de ingeniería. Asimismo, el plugin genérico de sistema de archivos de Tauri expone una superficie de ataque excesiva y no proporciona garantías de persistencia atómica con reemplazo seguro en Windows.

---

## 2. Alternativas Consideradas
1. **API estándar de Tauri `fs` (`writeTextFile`):** Descartado. Escribe directamente sobre el archivo destino sin descarga de buffers a disco (`sync_all`) ni reemplazo atómico; un fallo a mitad de escritura deja un archivo truncado a 0 bytes.
2. **Escritura en localStorage de navegador:** Descartado como mecanismo principal. El almacenamiento web tiene cuota de 5 MB, se borra al limpiar caché y no persiste junto al plano PDF original.
3. **Comandos nativos Rust dedicados con patrón `.tmp` + `sync_all` + `rename`:** El backend de Rust en Tauri realiza la escritura física atómica con validación estricta de rutas absolutas y extensión `.bbx.json`.

---

## 3. Decisión
Implementar los comandos nativos `write_bbx` y `read_bbx` en el backend Rust de Tauri 2, garantizando sincronización en almacenamiento físico (`sync_all()`), limpieza automática del archivo temporal en cualquier ruta de error y devolución segura de `Ok(None)` cuando el archivo aún no existe.

Anclas de implementación verificadas:
- En `src-tauri/src/lib.rs` (líneas 5-6, comando `#[tauri::command] fn write_bbx`).
- En `src-tauri/src/lib.rs` (línea 42, llamada a método `.sync_all()` sobre el archivo temporal).
- En `src-tauri/src/lib.rs` (líneas 48 y 54, llamadas a `fs::remove_file(&tmp_path)` para eliminar el temporal si ocurre cualquier error).
- En `src-tauri/src/lib.rs` (líneas 61-62, comando `#[tauri::command] fn read_bbx`).
- En `src-tauri/src/lib.rs` (línea 78, manejo de `ErrorKind::NotFound => Ok(None)`).
- En `src-tauri/src/lib.rs` (línea 154, registro en macro `invoke_handler`).
- En `src/services/bbxPersistenceService.ts` (línea 49, validador `isAbsolutePath`).
- En `src/services/bbxPersistenceService.ts` (línea 21, función `resetBbxErrorState`).
- En `src/services/bbxPersistenceService.ts` (líneas 117 y 179, invocaciones de `read_bbx` y `write_bbx` vía Tauri IPC).

---

## 4. Consecuencias
- **Positivas:** Cero posibilidad de truncado accidental de marcas; archivos `.bbx.json` escritos con consistencia transaccional en disco; lectura de archivo inexistente tratada como caso limpio normal sin disparar alarmas en la UI.
- **Negativas / Mitigaciones:** Requiere compilar el backend Rust con `cargo test` para verificar las garantías en cada plataforma.

---

## 5. Evidencia
- En `src-tauri/src/lib.rs`, la suite nativa ejecuta y pasa 4 tests de Rust:
  `test tests::test_write_bbx_rejects_non_bbx_extension ... ok`
  `test tests::test_write_bbx_rejects_relative_path ... ok`
  `test tests::test_read_bbx_nonexistent_returns_ok_none ... ok`
  `test tests::test_write_bbx_atomic_success_and_no_tmp_residual ... ok`
- Verificación manual R9 realizada por el usuario escribiendo en disco desde la ventana nativa de Tauri.
