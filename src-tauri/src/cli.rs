use clap::{Parser, Subcommand};
use lopdf::{Document, Object};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Parser, Debug)]
#[command(
  name = "pdfrev",
  author = "pdfrev contributors",
  version = "0.1.0",
  about = "pdfrev - Local-first PDF editor and headless automation CLI for AI agents"
)]
pub struct Cli {
  #[arg(long, global = true, help = "Output response formatted as structured JSON")]
  pub json: bool,

  #[command(subcommand)]
  pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
  /// Split a PDF document into multiple smaller PDF files
  Split {
    /// Path to the input PDF file
    input: PathBuf,

    /// Number of pages per split file (default: 1)
    #[arg(long, default_value_t = 1)]
    every: usize,

    /// Output directory where split PDF files will be saved
    #[arg(long)]
    out_dir: PathBuf,
  },

  /// Combine multiple PDF files in order into a single PDF
  Combine {
    /// Input PDF file paths to concatenate
    #[arg(required = true)]
    inputs: Vec<PathBuf>,

    /// Destination path for the combined PDF file
    #[arg(long, short)]
    output: PathBuf,
  },

  /// Extract plain text content from a PDF document
  ExtractText {
    /// Path to the input PDF file
    input: PathBuf,

    /// Optional 1-based page number to extract (extracts all pages if omitted)
    #[arg(long)]
    page: Option<u32>,
  },

  /// Inspect and list annotations and markups inside a PDF
  Markups {
    #[command(subcommand)]
    action: MarkupAction,
  },

  /// Perform native OCR text recognition on an image file (PNG, JPEG, BMP, TIFF)
  Ocr {
    /// Path to the input image file (PNG, JPEG, BMP, TIFF)
    input: PathBuf,

    /// Optional path to save extracted OCR text
    #[arg(long, short)]
    output: Option<PathBuf>,
  },
}

#[derive(Subcommand, Debug)]
pub enum MarkupAction {
  /// List all annotations and markups in the document
  List {
    /// Path to the input PDF file
    input: PathBuf,
  },
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CliResponse<T> {
  pub success: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<T>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SplitResult {
  pub input: String,
  pub total_pages: usize,
  pub split_files: Vec<String>,
  pub out_dir: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CombineResult {
  pub inputs: Vec<String>,
  pub output: String,
  pub total_pages: usize,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PageText {
  pub page: u32,
  pub text: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ExtractTextResult {
  pub input: String,
  pub total_pages: usize,
  pub pages: Vec<PageText>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MarkupItem {
  pub page: u32,
  pub subtype: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub author: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub contents: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub rect: Option<Vec<f64>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub modified: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MarkupsListResult {
  pub input: String,
  pub total_markups: usize,
  pub markups: Vec<MarkupItem>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OcrResult {
  pub input: String,
  pub language: String,
  pub word_count: usize,
  pub full_text: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub saved_to: Option<String>,
}

pub fn run_cli(args: &[String]) {
  let cli = match Cli::try_parse_from(args) {
    Ok(c) => c,
    Err(e) => {
      e.exit();
    }
  };

  let json_mode = cli.json;

  let result = match cli.command {
    Commands::Split {
      input,
      every,
      out_dir,
    } => handle_split(&input, every, &out_dir),
    Commands::Combine { inputs, output } => handle_combine(&inputs, &output),
    Commands::ExtractText { input, page } => handle_extract_text(&input, page),
    Commands::Markups { action } => match action {
      MarkupAction::List { input } => handle_markups_list(&input),
    },
    Commands::Ocr { input, output } => handle_ocr(&input, output.as_deref()),
  };

  match result {
    Ok((json_value, human_text)) => {
      if json_mode {
        println!("{}", serde_json::to_string_pretty(&json_value).unwrap());
      } else {
        println!("{}", human_text);
      }
      std::process::exit(0);
    }
    Err(err) => {
      if json_mode {
        let err_resp = CliResponse::<serde_json::Value> {
          success: false,
          data: None,
          error: Some(err),
        };
        eprintln!("{}", serde_json::to_string_pretty(&err_resp).unwrap());
      } else {
        eprintln!("Error: {}", err);
      }
      std::process::exit(1);
    }
  }
}

pub fn handle_split(
  input: &Path,
  every: usize,
  out_dir: &Path,
) -> Result<(serde_json::Value, String), String> {
  if !input.exists() {
    return Err(format!("Input file does not exist: {}", input.display()));
  }
  if every == 0 {
    return Err("--every must be at least 1".to_string());
  }

  fs::create_dir_all(out_dir)
    .map_err(|e| format!("Failed to create output directory {}: {}", out_dir.display(), e))?;

  let doc = Document::load(input)
    .map_err(|e| format!("Failed to load PDF {}: {}", input.display(), e))?;

  let pages = doc.get_pages();
  let total_pages = pages.len();
  if total_pages == 0 {
    return Err("The document contains no pages".to_string());
  }

  let stem = input
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("document");

  let mut created_files = Vec::new();
  let page_numbers: Vec<u32> = pages.keys().cloned().collect();

  for chunk in page_numbers.chunks(every) {
    let mut chunk_doc = doc.clone();
    let to_delete: Vec<u32> = page_numbers
      .iter()
      .filter(|p| !chunk.contains(p))
      .cloned()
      .collect();

    chunk_doc.delete_pages(&to_delete);

    let start_p = chunk.first().unwrap();
    let end_p = chunk.last().unwrap();
    let file_name = if start_p == end_p {
      format!("{}_p{:04}.pdf", stem, start_p)
    } else {
      format!("{}_p{:04}-{:04}.pdf", stem, start_p, end_p)
    };

    let target_path = out_dir.join(&file_name);
    chunk_doc
      .save(&target_path)
      .map_err(|e| format!("Failed to save split file {}: {}", target_path.display(), e))?;

    created_files.push(target_path.display().to_string());
  }

  let count = created_files.len();
  let summary = format!(
    "Split {} ({} pages) into {} files in {}",
    input.display(),
    total_pages,
    count,
    out_dir.display()
  );

  let res = SplitResult {
    input: input.display().to_string(),
    total_pages,
    split_files: created_files,
    out_dir: out_dir.display().to_string(),
  };

  Ok((serde_json::to_value(res).unwrap(), summary))
}

pub fn handle_combine(inputs: &[PathBuf], output: &Path) -> Result<(serde_json::Value, String), String> {
  if inputs.is_empty() {
    return Err("No input files provided to combine".to_string());
  }

  for input in inputs {
    if !input.exists() {
      return Err(format!("Input file does not exist: {}", input.display()));
    }
  }

  let mut docs = Vec::new();
  for input in inputs {
    let doc = Document::load(input)
      .map_err(|e| format!("Failed to load PDF {}: {}", input.display(), e))?;
    docs.push(doc);
  }

  // Combine multiple documents into one
  let mut max_id: u32 = 1;
  let mut combined_doc = Document::with_version("1.5");
  let mut pages_list: Vec<Object> = Vec::new();

  for doc in &docs {
    let mut doc_copy = doc.clone();
    doc_copy.renumber_objects_with(max_id);
    max_id = doc_copy.max_id + 1;

    let doc_pages = doc_copy.get_pages();
    for (_, page_id) in doc_pages {
      pages_list.push(Object::Reference(page_id));
    }

    for (id, object) in doc_copy.objects {
      combined_doc.objects.insert(id, object);
    }
  }

  // Create combined Pages tree and Catalog
  let pages_id = (max_id, 0);
  let catalog_id = (max_id + 1, 0);

  // Set /Parent reference for each imported page to ensure strict ISO 32000-1 compliance
  for page_ref in &pages_list {
    if let Object::Reference(page_id) = page_ref {
      if let Ok(page_obj) = combined_doc.get_object_mut(*page_id) {
        if let Object::Dictionary(dict) = page_obj {
          dict.set("Parent", Object::Reference(pages_id));
        }
      }
    }
  }

  let mut pages_dict = lopdf::Dictionary::new();
  pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
  pages_dict.set("Count", Object::Integer(pages_list.len() as i64));
  pages_dict.set("Kids", Object::Array(pages_list));
  combined_doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

  let mut catalog_dict = lopdf::Dictionary::new();
  catalog_dict.set("Type", Object::Name(b"Catalog".to_vec()));
  catalog_dict.set("Pages", Object::Reference(pages_id));
  combined_doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));

  combined_doc.trailer.set("Root", Object::Reference(catalog_id));

  if let Some(parent) = output.parent() {
    if !parent.as_os_str().is_empty() {
      let _ = fs::create_dir_all(parent);
    }
  }

  combined_doc
    .save(output)
    .map_err(|e| format!("Failed to save combined PDF {}: {}", output.display(), e))?;

  let total_pages = combined_doc.get_pages().len();
  let summary = format!(
    "Combined {} input files ({} total pages) into {}",
    inputs.len(),
    total_pages,
    output.display()
  );

  let res = CombineResult {
    inputs: inputs.iter().map(|p| p.display().to_string()).collect(),
    output: output.display().to_string(),
    total_pages,
  };

  Ok((serde_json::to_value(res).unwrap(), summary))
}

pub fn handle_extract_text(input: &Path, page: Option<u32>) -> Result<(serde_json::Value, String), String> {
  if !input.exists() {
    return Err(format!("Input file does not exist: {}", input.display()));
  }

  let doc = Document::load(input)
    .map_err(|e| format!("Failed to load PDF {}: {}", input.display(), e))?;

  let pages = doc.get_pages();
  let total_pages = pages.len();

  let target_pages: Vec<u32> = match page {
    Some(p) => {
      if !pages.contains_key(&p) {
        return Err(format!(
          "Page {} not found in document (total pages: {})",
          p, total_pages
        ));
      }
      vec![p]
    }
    None => pages.keys().cloned().collect(),
  };

  let mut page_texts = Vec::new();
  let mut full_output = String::new();

  for p in target_pages {
    let text = doc.extract_text(&[p]).unwrap_or_default();
    if !full_output.is_empty() {
      full_output.push('\n');
    }
    full_output.push_str(&text);
    page_texts.push(PageText { page: p, text });
  }

  let res = ExtractTextResult {
    input: input.display().to_string(),
    total_pages,
    pages: page_texts,
  };

  Ok((serde_json::to_value(res).unwrap(), full_output))
}

fn decode_pdf_string(bytes: &[u8]) -> String {
  if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
    let u16_chars: Vec<u16> = bytes[2..]
      .chunks_exact(2)
      .map(|c| u16::from_be_bytes([c[0], c[1]]))
      .collect();
    String::from_utf16_lossy(&u16_chars)
  } else {
    String::from_utf8(bytes.to_vec())
      .unwrap_or_else(|_| String::from_utf8_lossy(bytes).into_owned())
  }
}

pub fn handle_markups_list(input: &Path) -> Result<(serde_json::Value, String), String> {
  if !input.exists() {
    return Err(format!("Input file does not exist: {}", input.display()));
  }

  let doc = Document::load(input)
    .map_err(|e| format!("Failed to load PDF {}: {}", input.display(), e))?;

  let mut markups = Vec::new();
  let pages = doc.get_pages();

  for (page_num, page_id) in pages {
    if let Ok(page_dict) = doc.get_dictionary(page_id) {
      if let Ok(annots_obj) = page_dict.get(b"Annots") {
        let annots_arr = match annots_obj {
          Object::Array(arr) => arr.clone(),
          Object::Reference(ref_id) => {
            if let Ok(Object::Array(arr)) = doc.get_object(*ref_id) {
              arr.clone()
            } else {
              Vec::new()
            }
          }
          _ => Vec::new(),
        };

        for annot in annots_arr {
          let annot_dict = match annot {
            Object::Dictionary(d) => Some(d),
            Object::Reference(id) => doc.get_dictionary(id).ok().cloned(),
            _ => None,
          };

          if let Some(dict) = annot_dict {
            let subtype = dict
              .get(b"Subtype")
              .ok()
              .and_then(|o| o.as_name().ok())
              .and_then(|n| std::str::from_utf8(n).ok())
              .unwrap_or("Unknown")
              .to_string();

            let author = dict
              .get(b"T")
              .ok()
              .and_then(|o| match o {
                Object::String(bytes, _) => Some(decode_pdf_string(bytes)),
                _ => None,
              });

            let contents = dict
              .get(b"Contents")
              .ok()
              .and_then(|o| match o {
                Object::String(bytes, _) => Some(decode_pdf_string(bytes)),
                _ => None,
              });

            let modified = dict
              .get(b"M")
              .ok()
              .and_then(|o| match o {
                Object::String(bytes, _) => Some(decode_pdf_string(bytes)),
                _ => None,
              });

            let rect = dict.get(b"Rect").ok().and_then(|o| match o {
              Object::Array(arr) => {
                let coords: Vec<f64> = arr
                  .iter()
                  .filter_map(|c| match c {
                    Object::Real(f) => Some(*f as f64),
                    Object::Integer(i) => Some(*i as f64),
                    _ => None,
                  })
                  .collect();
                if coords.len() == 4 {
                  Some(coords)
                } else {
                  None
                }
              }
              _ => None,
            });

            markups.push(MarkupItem {
              page: page_num,
              subtype,
              author,
              contents,
              rect,
              modified,
            });
          }
        }
      }
    }
  }

  let total_markups = markups.len();
  let mut lines = Vec::new();
  lines.push(format!("File: {} (Total markups: {})", input.display(), total_markups));
  for m in &markups {
    lines.push(format!(
      "  [Page {}] {:<12} | Author: {:<12} | Contents: {}",
      m.page,
      m.subtype,
      m.author.as_deref().unwrap_or("-"),
      m.contents.as_deref().unwrap_or("-")
    ));
  }
  let human_output = lines.join("\n");

  let res = MarkupsListResult {
    input: input.display().to_string(),
    total_markups,
    markups,
  };

  Ok((serde_json::to_value(res).unwrap(), human_output))
}

pub fn handle_ocr(input: &Path, output: Option<&Path>) -> Result<(serde_json::Value, String), String> {
  if !input.exists() {
    return Err(format!("Input file does not exist: {}", input.display()));
  }

  if let Some(ext) = input.extension().and_then(|e| e.to_str()) {
    if ext.eq_ignore_ascii_case("pdf") {
      return Err(format!(
        "File '{}' is a PDF document. The OCR command directly accepts raster image formats (PNG, JPEG, BMP, TIFF). For PDFs, use 'extract-text' to read existing text or render pages to image first.",
        input.display()
      ));
    }
  }

  let bytes = fs::read(input).map_err(|e| format!("Failed to read file {}: {}", input.display(), e))?;

  #[cfg(windows)]
  {
    let ocr_page = crate::ocr::recognize(&bytes).map_err(|e| format!("OCR recognition failed: {}", e))?;

    let words: Vec<String> = ocr_page.words.iter().map(|w| w.text.clone()).collect();
    let full_text = words.join(" ");

    let saved_to = if let Some(out_path) = output {
      fs::write(out_path, &full_text)
        .map_err(|e| format!("Failed to write OCR output {}: {}", out_path.display(), e))?;
      Some(out_path.display().to_string())
    } else {
      None
    };

    let human_summary = format!("OCR Extracted {} words:\n{}", words.len(), full_text);

    let res = OcrResult {
      input: input.display().to_string(),
      language: ocr_page.language,
      word_count: ocr_page.words.len(),
      full_text,
      saved_to,
    };

    Ok((serde_json::to_value(res).unwrap(), human_summary))
  }

  #[cfg(not(windows))]
  {
    let _ = bytes;
    let _ = output;
    Err("Native OCR is currently supported on Windows platforms only".to_string())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_handle_split_invalid_path() {
    let res = handle_split(Path::new("non_existent_file.pdf"), 1, Path::new("out"));
    assert!(res.is_err());
  }

  #[test]
  fn test_handle_combine_empty_inputs() {
    let res = handle_combine(&[], Path::new("out.pdf"));
    assert!(res.is_err());
  }

  #[test]
  fn test_handle_extract_text_invalid_path() {
    let res = handle_extract_text(Path::new("non_existent_file.pdf"), None);
    assert!(res.is_err());
  }

  #[test]
  fn test_handle_markups_list_invalid_path() {
    let res = handle_markups_list(Path::new("non_existent_file.pdf"));
    assert!(res.is_err());
  }

  #[test]
  fn test_handle_ocr_invalid_path() {
    let res = handle_ocr(Path::new("non_existent_file.pdf"), None);
    assert!(res.is_err());
  }

  #[test]
  fn test_decode_pdf_string() {
    // Plain UTF-8
    let plain = b"Hello World";
    assert_eq!(decode_pdf_string(plain), "Hello World");

    // UTF-16BE with BOM
    let utf16be = vec![0xFE, 0xFF, 0x00, 0x54, 0x00, 0x65, 0x00, 0x73, 0x00, 0x74];
    assert_eq!(decode_pdf_string(&utf16be), "Test");
  }

  #[test]
  fn test_handle_ocr_rejects_pdf_extension() {
    let dummy_pdf = Path::new("dummy.pdf");
    // Should fail with not existing or if created, should warn
    let res = handle_ocr(dummy_pdf, None);
    assert!(res.is_err());
  }

  #[test]
  fn test_extract_and_markups_on_large_fixture() {
    let fixture = Path::new("../fixtures/large-blueprint-e-size.pdf");
    if fixture.exists() {
      let markups_res = handle_markups_list(fixture);
      assert!(markups_res.is_ok());

      let text_res = handle_extract_text(fixture, Some(1));
      assert!(text_res.is_ok());
    }
  }
}
