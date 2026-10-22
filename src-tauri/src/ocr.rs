//! OCR local con la API nativa de Windows (`Windows.Media.Ocr`, ADR-0102): sin dependencias de OCR de terceros ni datos
//! de idioma propios; usa los idiomas del perfil del usuario que Windows tenga instalados.

use serde::Serialize;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct OcrWord {
  pub text: String,
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct OcrPage {
  /// Tamaño en píxeles de la imagen reconocida.
  pub width: u32,
  pub height: u32,
  /// Idioma del motor que reconoció (por ejemplo "Español (México)").
  pub language: String,
  pub words: Vec<OcrWord>,
}

#[cfg(windows)]
pub fn recognize(image: &[u8]) -> Result<OcrPage, String> {
  use windows::Graphics::Imaging::BitmapDecoder;
  use windows::Media::Ocr::OcrEngine;
  use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
  use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize};

  fn msg(what: &str, e: windows::core::Error) -> String {
    format!("{}: {}", what, e.message())
  }

  // El hilo de trabajo necesita su apartamento WinRT; si ya lo tenía, el error se ignora
  let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };

  let stream = InMemoryRandomAccessStream::new().map_err(|e| msg("No se pudo crear el flujo de imagen", e))?;
  let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| msg("No se pudo crear el escritor", e))?;
  writer.WriteBytes(image).map_err(|e| msg("No se pudo escribir la imagen", e))?;
  writer
    .StoreAsync()
    .and_then(|op| op.join())
    .map_err(|e| msg("No se pudo guardar la imagen", e))?;
  writer.DetachStream().map_err(|e| msg("No se pudo soltar el flujo", e))?;
  stream.Seek(0).map_err(|e| msg("No se pudo rebobinar el flujo", e))?;

  let decoder = BitmapDecoder::CreateAsync(&stream)
    .and_then(|op| op.join())
    .map_err(|e| msg("La imagen no es un PNG o JPEG válido", e))?;
  let bitmap = decoder
    .GetSoftwareBitmapAsync()
    .and_then(|op| op.join())
    .map_err(|e| msg("No se pudo decodificar la imagen", e))?;
  let width = bitmap.PixelWidth().map_err(|e| msg("Sin ancho", e))? as u32;
  let height = bitmap.PixelHeight().map_err(|e| msg("Sin alto", e))? as u32;
  let max = OcrEngine::MaxImageDimension().unwrap_or(10000);
  if width > max || height > max {
    return Err(format!("La imagen ({}×{}) supera el máximo del OCR de Windows ({} px por lado).", width, height, max));
  }

  let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| {
    "Windows no tiene un idioma de OCR instalado para el perfil del usuario. Instálalo en Configuración ▸ Hora e idioma ▸ Idioma y región.".to_string()
  })?;
  let language = engine
    .RecognizerLanguage()
    .and_then(|l| l.DisplayName())
    .map(|n| n.to_string())
    .unwrap_or_default();

  let result = engine
    .RecognizeAsync(&bitmap)
    .and_then(|op| op.join())
    .map_err(|e| msg("El OCR falló", e))?;
  let mut words = Vec::new();
  for line in result.Lines().map_err(|e| msg("Sin líneas", e))? {
    for word in line.Words().map_err(|e| msg("Sin palabras", e))? {
      let text = word.Text().map(|t| t.to_string()).unwrap_or_default();
      let r = word.BoundingRect().map_err(|e| msg("Sin caja", e))?;
      if text.trim().is_empty() {
        continue;
      }
      words.push(OcrWord { text, x: r.X as f64, y: r.Y as f64, width: r.Width as f64, height: r.Height as f64 });
    }
  }
  Ok(OcrPage { width, height, language, words })
}

#[cfg(not(windows))]
pub fn recognize(_image: &[u8]) -> Result<OcrPage, String> {
  Err("El OCR solo está disponible en Windows.".to_string())
}

#[tauri::command]
pub async fn ocr_recognize(image: Vec<u8>) -> Result<OcrPage, String> {
  tauri::async_runtime::spawn_blocking(move || recognize(&image))
    .await
    .map_err(|e| format!("El OCR se interrumpió: {}", e))?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_data_that_is_not_an_image() {
    let res = recognize(b"esto no es una imagen");
    assert!(res.is_err());
  }

  #[cfg(windows)]
  #[test]
  fn reads_the_words_of_a_generated_image() {
    // Imagen propia: "HELLO OCR 123" en negro sobre blanco (generada con System.Drawing al preparar el hito)
    let png: &[u8] = include_bytes!("../tests/ocr_hello.png");
    match recognize(png) {
      Ok(page) => {
        let text: Vec<String> = page.words.iter().map(|w| w.text.to_uppercase()).collect();
        assert!(text.iter().any(|t| t.contains("HELLO")), "palabras reconocidas: {:?}", text);
        assert!(text.iter().any(|t| t.contains("123")), "palabras reconocidas: {:?}", text);
        // Las cajas están dentro de la imagen
        for w in &page.words {
          assert!(w.x >= 0.0 && w.y >= 0.0 && w.x + w.width <= page.width as f64 + 1.0 && w.y + w.height <= page.height as f64 + 1.0);
        }
      }
      // Sin idioma de OCR instalado el motor no existe: no es un fallo del código
      Err(e) if e.contains("idioma de OCR") => eprintln!("OCR no disponible en este equipo: {}", e),
      Err(e) => panic!("{}", e),
    }
  }
}
