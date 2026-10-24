// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  let args: Vec<String> = std::env::args().collect();
  if pdfrev_lib::cli::should_run_cli(&args) {
    #[cfg(windows)]
    unsafe {
      use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
      let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
    pdfrev_lib::cli::run_cli(&args);
  } else {
    pdfrev_lib::run();
  }
}
