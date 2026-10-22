//! Tool Sets de Revu instalados en el equipo (ADR-0105): lista y lee los `.btx` de la carpeta de datos de Revu
//! (`%APPDATA%\Bluebeam Software\Revu\<versión>`), sin dar acceso a ninguna otra ruta.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct RevuToolSetFile {
  pub path: String,
  pub file_name: String,
  pub size: u64,
}

/// Carpeta de datos de Bluebeam del usuario, si existe.
fn bluebeam_root() -> Option<PathBuf> {
  let appdata = std::env::var_os("APPDATA")?;
  let root = PathBuf::from(appdata).join("Bluebeam Software");
  if root.is_dir() { Some(root) } else { None }
}

fn is_btx(path: &Path) -> bool {
  path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("btx")).unwrap_or(false)
}

/// Los `.btx` de la carpeta `root`: los de `root/Revu/<versión>/` y los de `root/Revu/`, ordenados por nombre.
pub fn find_toolsets(root: &Path) -> Vec<RevuToolSetFile> {
  let mut out = Vec::new();
  let revu = root.join("Revu");
  let mut dirs = vec![revu.clone()];
  if let Ok(entries) = fs::read_dir(&revu) {
    for e in entries.flatten() {
      if e.path().is_dir() {
        dirs.push(e.path());
      }
    }
  }
  for dir in dirs {
    if let Ok(entries) = fs::read_dir(&dir) {
      for e in entries.flatten() {
        let p = e.path();
        if p.is_file() && is_btx(&p) {
          out.push(RevuToolSetFile {
            path: p.to_string_lossy().to_string(),
            file_name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            size: e.metadata().map(|m| m.len()).unwrap_or(0),
          });
        }
      }
    }
  }
  out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
  out
}

/// Lee un `.btx` solo si está dentro de `root` y tiene la extensión `.btx` (sin enlaces ni `..` que se salgan).
pub fn read_toolset_in(root: &Path, file: &Path) -> Result<Vec<u8>, String> {
  if !is_btx(file) {
    return Err("Solo se pueden leer archivos .btx.".to_string());
  }
  let root = root.canonicalize().map_err(|e| format!("No se pudo resolver la carpeta de Revu: {}", e))?;
  let file = file.canonicalize().map_err(|e| format!("No se pudo resolver el archivo: {}", e))?;
  if !file.starts_with(&root) {
    return Err("El archivo no está en la carpeta de datos de Bluebeam.".to_string());
  }
  fs::read(&file).map_err(|e| format!("No se pudo leer {}: {}", file.display(), e))
}

#[tauri::command]
pub fn list_revu_toolsets() -> Vec<RevuToolSetFile> {
  match bluebeam_root() {
    Some(root) => find_toolsets(&root),
    None => Vec::new(),
  }
}

#[tauri::command]
pub fn read_revu_toolset(path: String) -> Result<Vec<u8>, String> {
  let root = bluebeam_root().ok_or_else(|| "No se encontró la carpeta de datos de Bluebeam.".to_string())?;
  read_toolset_in(&root, Path::new(&path))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_root(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("rea_revu_test_{}_{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("Revu").join("21")).unwrap();
    fs::create_dir_all(dir.join("Revu").join("20")).unwrap();
    dir
  }

  #[test]
  fn lists_btx_files_of_every_version_folder_and_ignores_other_files() {
    let root = temp_root("list");
    fs::write(root.join("Revu").join("21").join("Concrete.btx"), b"a").unwrap();
    fs::write(root.join("Revu").join("21").join("notes.txt"), b"x").unwrap();
    fs::write(root.join("Revu").join("20").join("Electrical.BTX"), b"bb").unwrap();
    fs::write(root.join("Revu").join("Loose.btx"), b"c").unwrap();
    let found = find_toolsets(&root);
    let names: Vec<&str> = found.iter().map(|f| f.file_name.as_str()).collect();
    assert_eq!(names.len(), 3);
    assert!(names.contains(&"Concrete.btx") && names.contains(&"Electrical.BTX") && names.contains(&"Loose.btx"));
    assert_eq!(found.iter().find(|f| f.file_name == "Electrical.BTX").unwrap().size, 2);
    let _ = fs::remove_dir_all(&root);
  }

  #[test]
  fn an_empty_or_missing_folder_gives_an_empty_list() {
    let root = std::env::temp_dir().join(format!("rea_revu_missing_{}", std::process::id()));
    assert!(find_toolsets(&root).is_empty());
  }

  #[test]
  fn reads_only_btx_files_inside_the_bluebeam_folder() {
    let root = temp_root("read");
    let inside = root.join("Revu").join("21").join("Tools.btx");
    fs::write(&inside, b"<xml/>").unwrap();
    assert_eq!(read_toolset_in(&root, &inside).unwrap(), b"<xml/>".to_vec());
    // Otra extensión
    let txt = root.join("Revu").join("21").join("a.txt");
    fs::write(&txt, b"x").unwrap();
    assert!(read_toolset_in(&root, &txt).is_err());
    // Un .btx fuera de la carpeta, o salido con ".."
    let outside = std::env::temp_dir().join(format!("rea_outside_{}.btx", std::process::id()));
    fs::write(&outside, b"secret").unwrap();
    assert!(read_toolset_in(&root, &outside).is_err());
    let sneaky = root.join("Revu").join("21").join("..").join("..").join("..").join(outside.file_name().unwrap());
    assert!(read_toolset_in(&root, &sneaky).is_err());
    let _ = fs::remove_file(&outside);
    let _ = fs::remove_dir_all(&root);
  }
}
