use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

#[tauri::command]
fn write_bbx(file_path: String, json_content: String) -> Result<(), String> {
  let path = Path::new(&file_path);

  // 1. Validar que la ruta es absoluta
  if !path.is_absolute() {
    return Err("La ruta debe ser absoluta".to_string());
  }

  // 2. Validar que termina en .bbx.json
  if !file_path.ends_with(".bbx.json") {
    return Err("El archivo debe terminar en .bbx.json".to_string());
  }

  // 3. Validar que el directorio padre existe y es accesible
  let parent = path
    .parent()
    .ok_or_else(|| "No se pudo obtener el directorio padre".to_string())?;

  if !parent.exists() {
    return Err(format!(
      "El directorio padre no existe: {}",
      parent.display()
    ));
  }

  // 4. Escritura atómica: escribir primero a <path>.tmp y luego renombrar
  let tmp_path = format!("{}.tmp", file_path);
  let tmp_path_obj = Path::new(&tmp_path);

  {
    let mut file = File::create(tmp_path_obj)
      .map_err(|e| format!("Error creando archivo temporal: {}", e))?;
    file
      .write_all(json_content.as_bytes())
      .map_err(|e| format!("Error escribiendo archivo temporal: {}", e))?;
    file
      .flush()
      .map_err(|e| format!("Error sincronizando archivo temporal: {}", e))?;
  }

  // Renombrar atómicamente al destino final
  fs::rename(tmp_path_obj, path)
    .map_err(|e| format!("Error renombrando archivo atómicamente a {}: {}", file_path, e))?;

  Ok(())
}

#[tauri::command]
fn read_bbx(file_path: String) -> Result<Option<String>, String> {
  let path = Path::new(&file_path);

  // 1. Validar que la ruta es absoluta
  if !path.is_absolute() {
    return Err("La ruta debe ser absoluta".to_string());
  }

  // 2. Validar que termina en .bbx.json
  if !file_path.ends_with(".bbx.json") {
    return Err("El archivo debe terminar en .bbx.json".to_string());
  }

  // 3. Distinguir NotFound de errores de E/S reales
  match fs::read_to_string(path) {
    Ok(content) => Ok(Some(content)),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(format!(
      "Error de E/S leyendo archivo {}: {}",
      file_path, e
    )),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![write_bbx, read_bbx])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
