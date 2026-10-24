// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  let args: Vec<String> = std::env::args().collect();
  if args.len() > 1 && !args[1].starts_with("-psn") {
    // If CLI arguments were provided, execute in CLI mode
    pdfrev_lib::cli::run_cli(&args);
  } else {
    // Otherwise launch desktop GUI
    pdfrev_lib::run();
  }
}
