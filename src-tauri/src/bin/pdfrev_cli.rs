fn main() {
  let args: Vec<String> = std::env::args().collect();
  pdfrev_lib::cli::run_cli(&args);
}
