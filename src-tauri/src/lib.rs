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

  let write_result = (|| -> Result<(), String> {
    let mut file = File::create(tmp_path_obj)
      .map_err(|e| format!("Error creando archivo temporal: {}", e))?;
    file
      .write_all(json_content.as_bytes())
      .map_err(|e| format!("Error escribiendo archivo temporal: {}", e))?;
    file
      .sync_all()
      .map_err(|e| format!("Error sincronizando archivo temporal: {}", e))?;
    Ok(())
  })();

  if let Err(e) = write_result {
    let _ = fs::remove_file(tmp_path_obj);
    return Err(e);
  }

  // Renombrar atómicamente al destino final
  if let Err(e) = fs::rename(tmp_path_obj, path) {
    let _ = fs::remove_file(tmp_path_obj);
    return Err(format!("Error renombrando archivo atómicamente a {}: {}", file_path, e));
  }

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

#[tauri::command]
fn save_export_file(file_path: String, bytes: Vec<u8>) -> Result<(), String> {
  let path = Path::new(&file_path);

  // 1. Validar que la ruta es absoluta
  if !path.is_absolute() {
    return Err("La ruta debe ser absoluta".to_string());
  }

  // 2. Validar extensión en lista blanca (.csv o .pdf)
  let ext = path
    .extension()
    .and_then(|s| s.to_str())
    .map(|s| s.to_lowercase())
    .unwrap_or_default();

  if ext != "csv" && ext != "pdf" {
    return Err("La extensión del archivo debe ser .csv o .pdf".to_string());
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

  let write_result = (|| -> Result<(), String> {
    let mut file = File::create(tmp_path_obj)
      .map_err(|e| format!("Error creando archivo temporal: {}", e))?;
    file
      .write_all(&bytes)
      .map_err(|e| format!("Error escribiendo archivo temporal: {}", e))?;
    file
      .sync_all()
      .map_err(|e| format!("Error sincronizando archivo temporal: {}", e))?;
    Ok(())
  })();

  if let Err(e) = write_result {
    let _ = fs::remove_file(tmp_path_obj);
    return Err(e);
  }

  // Renombrar atómicamente al destino final
  if let Err(e) = fs::rename(tmp_path_obj, path) {
    let _ = fs::remove_file(tmp_path_obj);
    return Err(format!("Error renombrando archivo atómicamente a {}: {}", file_path, e));
  }

  Ok(())
}

#[tauri::command]
fn save_pdf(file_path: String, bytes: Vec<u8>) -> Result<(), String> {
  let path = Path::new(&file_path);

  // 1. Validar que la ruta es absoluta
  if !path.is_absolute() {
    return Err("La ruta debe ser absoluta".to_string());
  }

  // 2. Validar extensión .pdf estrictamente
  let ext = path
    .extension()
    .and_then(|s| s.to_str())
    .map(|s| s.to_lowercase())
    .unwrap_or_default();

  if ext != "pdf" {
    return Err("El archivo debe terminar en .pdf".to_string());
  }

  // 3. Validar directorio padre
  let parent = path
    .parent()
    .ok_or_else(|| "No se pudo obtener el directorio padre".to_string())?;

  if !parent.exists() {
    return Err(format!("El directorio padre no existe: {}", parent.display()));
  }

  // 4. Crear copia de seguridad <nombre>.pdf.rea-backup la primera vez por sesión si el archivo original existe
  if path.exists() {
    let backup_path = format!("{}.rea-backup", file_path);
    let backup_path_obj = Path::new(&backup_path);
    if !backup_path_obj.exists() {
      if let Err(e) = fs::copy(path, backup_path_obj) {
        return Err(format!("Error creando copia de seguridad {}: {}", backup_path, e));
      }
    }
  }

  // 5. Escritura atómica a .tmp + sync_all + rename
  let tmp_path = format!("{}.tmp", file_path);
  let tmp_path_obj = Path::new(&tmp_path);

  let write_result = (|| -> Result<(), String> {
    let mut file = File::create(tmp_path_obj)
      .map_err(|e| format!("Error creando archivo temporal: {}", e))?;
    file
      .write_all(&bytes)
      .map_err(|e| format!("Error escribiendo archivo temporal: {}", e))?;
    file
      .sync_all()
      .map_err(|e| format!("Error sincronizando archivo temporal: {}", e))?;
    Ok(())
  })();

  if let Err(e) = write_result {
    let _ = fs::remove_file(tmp_path_obj);
    return Err(e);
  }

  if let Err(e) = fs::rename(tmp_path_obj, path) {
    let _ = fs::remove_file(tmp_path_obj);
    return Err(format!("Error renombrando archivo atómicamente a {}: {}", file_path, e));
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::env;

  #[test]
  fn test_write_bbx_rejects_relative_path() {
    let res = write_bbx("archivo.bbx.json".to_string(), "{}".to_string());
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("absoluta"));
  }

  #[test]
  fn test_write_bbx_rejects_non_bbx_extension() {
    let temp_dir = env::temp_dir();
    let abs_path = temp_dir.join("test.txt").to_string_lossy().to_string();
    let res = write_bbx(abs_path, "{}".to_string());
    assert!(res.is_err());
    assert!(res.unwrap_err().contains(".bbx.json"));
  }

  #[test]
  fn test_write_bbx_atomic_success_and_no_tmp_residual() {
    let temp_dir = env::temp_dir();
    let file_path = temp_dir.join("test_atomic_success.bbx.json");
    let file_path_str = file_path.to_string_lossy().to_string();
    let tmp_path = format!("{}.tmp", file_path_str);

    let content = r#"{"version":"1.1.0","markups":[]}"#;
    let res = write_bbx(file_path_str.clone(), content.to_string());
    assert!(res.is_ok());

    // El archivo final existe y tiene el contenido esperado
    assert!(file_path.exists());
    let read_back = fs::read_to_string(&file_path).unwrap();
    assert_eq!(read_back, content);

    // No queda archivo .tmp residual
    assert!(!Path::new(&tmp_path).exists());

    // Limpieza
    let _ = fs::remove_file(&file_path);
  }

  #[test]
  fn test_read_bbx_nonexistent_returns_ok_none() {
    let temp_dir = env::temp_dir();
    let file_path = temp_dir.join("nonexistent_test_file_12345.bbx.json").to_string_lossy().to_string();
    let res = read_bbx(file_path);
    assert_eq!(res, Ok(None));
  }

  #[test]
  fn test_save_export_file_rejects_relative_path() {
    let res = save_export_file("report.csv".to_string(), b"a,b,c".to_vec());
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("absoluta"));
  }

  #[test]
  fn test_save_export_file_rejects_disallowed_extension() {
    let temp_dir = env::temp_dir();
    let abs_path = temp_dir.join("export.exe").to_string_lossy().to_string();
    let res = save_export_file(abs_path, b"test".to_vec());
    assert!(res.is_err());
    assert!(res.unwrap_err().contains(".csv o .pdf"));
  }

  #[test]
  fn test_save_export_file_atomic_success_csv() {
    let temp_dir = env::temp_dir();
    let file_path = temp_dir.join("test_export_atomic.csv");
    let file_path_str = file_path.to_string_lossy().to_string();
    let tmp_path = format!("{}.tmp", file_path_str);

    let bytes = b"\xEF\xBB\xBFCol1,Col2\r\nVal1,Val2\r\n".to_vec();
    let res = save_export_file(file_path_str.clone(), bytes.clone());
    assert!(res.is_ok());

    assert!(file_path.exists());
    let read_back = fs::read(&file_path).unwrap();
    assert_eq!(read_back, bytes);
    assert!(!Path::new(&tmp_path).exists());

    let _ = fs::remove_file(&file_path);
  }

  #[test]
  fn test_save_export_file_atomic_success_pdf() {
    let temp_dir = env::temp_dir();
    let file_path = temp_dir.join("test_export_atomic.pdf");
    let file_path_str = file_path.to_string_lossy().to_string();
    let tmp_path = format!("{}.tmp", file_path_str);

    let bytes = b"%PDF-1.4\n%test\n".to_vec();
    let res = save_export_file(file_path_str.clone(), bytes.clone());
    assert!(res.is_ok());

    assert!(file_path.exists());
    let read_back = fs::read(&file_path).unwrap();
    assert_eq!(read_back, bytes);
    assert!(!Path::new(&tmp_path).exists());

    let _ = fs::remove_file(&file_path);
  }

  #[test]
  fn test_save_pdf_rejects_relative_path() {
    let res = save_pdf("plano.pdf".to_string(), vec![1, 2, 3]);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("absoluta"));
  }

  #[test]
  fn test_save_pdf_rejects_non_pdf_extension() {
    let temp_dir = env::temp_dir();
    let abs_path = temp_dir.join("plano.docx").to_string_lossy().to_string();
    let res = save_pdf(abs_path, vec![1, 2, 3]);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains(".pdf"));
  }

  #[test]
  fn test_save_pdf_atomic_success_and_creates_backup() {
    let temp_dir = env::temp_dir();
    let file_path = temp_dir.join("test_save_pdf_with_backup.pdf");
    let file_path_str = file_path.to_string_lossy().to_string();
    let backup_path_str = format!("{}.rea-backup", file_path_str);
    let tmp_path = format!("{}.tmp", file_path_str);

    // Escribir archivo inicial previo para probar creación de copia de seguridad
    let initial_bytes = b"%PDF-1.4\nInitial content\n".to_vec();
    fs::write(&file_path, &initial_bytes).unwrap();

    let new_bytes = b"%PDF-1.4\nIncremental updated content\n".to_vec();
    let res = save_pdf(file_path_str.clone(), new_bytes.clone());
    assert!(res.is_ok());

    // El archivo de destino debe tener el nuevo contenido
    assert!(file_path.exists());
    let read_back = fs::read(&file_path).unwrap();
    assert_eq!(read_back, new_bytes);

    // El backup debe existir y contener los bytes iniciales
    let backup_path = Path::new(&backup_path_str);
    assert!(backup_path.exists());
    let backup_content = fs::read(backup_path).unwrap();
    assert_eq!(backup_content, initial_bytes);

    // No debe haber archivo residual .tmp
    assert!(!Path::new(&tmp_path).exists());

    let _ = fs::remove_file(&file_path);
    let _ = fs::remove_file(backup_path);
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
    .invoke_handler(tauri::generate_handler![write_bbx, read_bbx, save_export_file, save_pdf])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

