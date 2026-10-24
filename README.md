<p align="center">
  <img src="docs/assets/logo.png" alt="pdfrev Logo" width="128" height="128" />
</p>

<h1 align="center">pdfrev</h1>

<p align="center">
  <strong>Local-first, fearless PDF editing, drawing takeoff, and AI-agent automation.</strong>
</p>

<p align="center">
  <a href="https://github.com/jacobavina/pdfrev/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/jacobavina/pdfrev/ci.yml?branch=master&style=flat-square&label=CI" alt="CI Status" /></a>
  <a href="https://github.com/jacobavina/pdfrev/releases/latest"><img src="https://img.shields.io/github/v/release/jacobavina/pdfrev?style=flat-square&color=blue" alt="Latest Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Windows%20x64-blue?style=flat-square" alt="Platform" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Rust-2024%20edition-orange?style=flat-square" alt="Rust Edition" /></a>
</p>

---

**pdfrev** is an ultra-fast, local-first PDF viewer, editor, and drawing takeoff workstation built for architecture, engineering, and construction professionals—and designed from day one to be driven programmatically by **AI coding and reasoning agents**.

Built with **Tauri 2**, **Rust**, and modern **React**, pdfrev provides a native Windows experience with instant startup, 60 FPS panning on dense E-size blueprint drawings, zero telemetry, and high-fidelity interoperability with ISO 32000-1 workflows.

---

## ⚡ Highlights

- **🔒 Local-First & Zero Telemetry:** Your drawings and documents never leave your workstation. No cloud logins, no mandatory sync, no background tracking.
- **📐 Precision Drawing Takeoff:** Real-world scale calibration, Area with multi-polygon Cutout subtraction, Perimeter, Volume, Dynamic Length, and autonomous shape Count takeoff.
- **🔄 ISO 32000-1 & Tool Set Interoperability:** High-fidelity roundtrip markup editing, `.bbx.json` sidecar storage, standard `/Annots` (`/Square`, `/Circle`, `/Highlight`, `/Ink`, `/Stamp`), status tracking, `.btx` tool set profile import, and threaded comment replies.
- **🤖 Headless AI Agent CLI (`pdfrev-cli`):** First-class command-line interface for LLMs and autonomous agents to split, combine, inspect markups, extract text, and perform OCR with structured JSON output and standardized POSIX exit codes.
- **🔍 Windows Native OCR:** Offline text recognition powered directly by `Windows.Media.Ocr`. Zero external models, zero downloads, completely private.
- **🎨 Cyanotype Blueprint Aesthetic:** Refined interface with both Light and Dark themes engineered around drawing readability.

---

## 📸 Screenshots

### Light Mode (Drawing Hall Blueprint Theme)
![pdfrev Light Mode Screenshot](docs/assets/screenshot-light.png)

### Dark Mode (Night Workstation Theme)
![pdfrev Dark Mode Screenshot](docs/assets/screenshot-dark.png)

---

## 🤖 Headless CLI for AI Agents

`pdfrev` includes a dedicated console binary (`pdfrev-cli.exe` or `pdfrev --headless`) designed specifically for AI workflows, automated takeoff pipelines, and background processing. All commands support `--json` output.

### CLI Commands Matrix

| Command | Description | Example |
|---|---|---|
| `split` | Split a PDF into chunks of N pages | `pdfrev split blueprint.pdf --every 1 --out-dir ./pages --json` |
| `combine` | Merge multiple PDFs in order into one | `pdfrev combine p1.pdf p2.pdf --output full.pdf --json` |
| `extract-text` | Extract plain text from all or specific pages | `pdfrev extract-text doc.pdf --page 1 --json` |
| `markups list` | Extract all markups and annotations | `pdfrev markups list blueprint.pdf --json` |
| `ocr` | Perform Windows native OCR on images or scans | `pdfrev ocr scan.png --output ocr.txt --json` |

### Sample JSON Output

```bash
pdfrev --json markups list plan.pdf
```

```json
{
  "input": "plan.pdf",
  "total_markups": 2,
  "markups": [
    {
      "page": 1,
      "subtype": "Square",
      "author": "Architect",
      "contents": "Verify HVAC shaft clearance",
      "rect": [140.5, 320.0, 290.0, 480.5],
      "modified": "D:20261015143000Z"
    },
    {
      "page": 1,
      "subtype": "Highlight",
      "author": "Structural Eng",
      "contents": "Reinforced beam W24x68",
      "rect": [420.0, 610.0, 580.0, 630.0],
      "modified": "D:20261015150000Z"
    }
  ]
}
```

---

## 🏗️ Architecture

```mermaid
graph TD
    UI["Frontend (React 18 + TypeScript + Tailwind)"] -->|IPC / Tauri Bridge| Core["Desktop Core (Tauri 2 + WebView2)"]
    CLI["Headless CLI Binary (pdfrev-cli.exe)"] -->|Rust Commands| Engine["Rust PDF Engine (lopdf + flate2)"]
    Core --> Engine
    Engine --> OCR["Native Windows OCR (Windows.Media.Ocr)"]
    Engine --> IO["Atomic File I/O (.bbx.json, .pdf, .xlsx, .csv)"]
```

- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, PDF.js rendering pipeline.
- **Desktop Bridge:** Tauri 2 with strict boundary validation and atomic backups.
- **Rust Core:** `lopdf` PDF dictionary and xref stream manipulation, native memory safety.
- **Headless Engine:** `clap` CLI subcommands returning structured JSON for AI consumption.

---

## 📥 Download & Installation (Windows x64)

### Option 1: Official NSIS Installer (Recommended)
Download the latest `pdfrev_<version>_x64-setup.exe` from the [Releases](https://github.com/jacobavina/pdfrev/releases/latest) page and run the installer.

### Option 2: Portable Package
Download `pdfrev_<version>_windows_x64_portable.zip`, extract to any directory, and launch `pdfrev.exe` (GUI) or `pdfrev-cli.exe` (CLI).

> [!NOTE]
> **Windows SmartScreen & Integrity Verification:**
> As an independent open-source project without a costly commercial EV/OV code-signing certificate, Windows SmartScreen may present a *"Windows protected your PC"* notification on initial launch. You can safely click **"More info" → "Run anyway"**.
> 
> You can verify the cryptographic integrity of any downloaded binary against our official release hashes using PowerShell:
> ```powershell
> (Get-FileHash -Algorithm SHA256 .\pdfrev_0.1.0_x64-setup.exe).Hash
> ```
> and compare it with the published `SHA256SUMS.txt` on the release page.

---

## 🛠️ Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v20.x or v22.x LTS)
- [Rust](https://www.rust-lang.org/) (v1.85+ with `cargo`)
- Windows 10 or 11 with C++ Build Tools installed

```powershell
# 1. Clone repo
git clone https://github.com/jacobavina/pdfrev.git
cd pdfrev

# 2. Install dependencies
npm install

# 3. Build and verify all automated test suites
node scripts/verify.mjs

# 4. Compile the production installer
npx tauri build --bundles nsis
```

The compiled binaries and NSIS setup executable will be located in `src-tauri/target/release/bundle/nsis/`.

---

## 🧪 Quality Gates & Test Coverage

`pdfrev` enforces a strict automated quality gate before any release:
- **1,400+ Unit Tests** (Vitest) covering geometry, takeoff mathematics, stamp rendering, and tool pipelines.
- **Native Rust Tests** (`cargo test`) verifying atomic disk I/O, backup rollbacks, PDF stream parsing, and Windows OCR.
- **Bundle Size Enforcement:** Main chunk strictly capped under 800 kB.
- **PARITY Verification:** Automated cross-suite verification ensuring high-fidelity alignment with CAD drawing standards and ISO 32000-1 specifications.

```powershell
node scripts/verify.mjs
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
Icons and typography attributions are documented in detail in [ATTRIBUTION.md](ATTRIBUTION.md).

---

## ⚖️ Trademarks & Non-Affiliation Disclaimer

`pdfrev` is an independent open-source project and is not affiliated with, endorsed by, sponsored by, or supported by Bluebeam, Inc., the Nemetschek Group, Adobe Inc., or Foxit Software Inc.

"Bluebeam", "Revu", "Adobe Acrobat", and "Foxit" are registered trademarks of their respective owners. Any references to third-party brand names, tool names, or file formats (such as `.btx`) in this repository or application interface are strictly for describing technical file-format interoperability.
