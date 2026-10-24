<p align="center">
  <img src="docs/assets/logo.png" width="128" height="128" alt="PdfRev logo: technical blueprint sheet with precision takeoff caliper">
</p>

<h1 align="center">PdfRev</h1>

<p align="center">
  <b>The CAD PDF &amp; takeoff workbench; an open-source, modern PDF reader, markup editor and quantity takeoff studio.</b><br>
  Calibrate, measure, annotate, organize, combine, split and automate technical drawings in a fast, native app.<br>
  Windows x64 &middot; Headless CLI for AI Agents &middot; Local-first &middot; Zero telemetry
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0284c7?style=flat-square"></a>
  <a href="#"><img alt="Written in Rust & React" src="https://img.shields.io/badge/written%20in-Rust%20%26%20React-0f172a?style=flat-square"></a>
  <a href="#"><img alt="Platform: Windows x64" src="https://img.shields.io/badge/platform-Windows%20x64-0284c7?style=flat-square"></a>
  <a href="#"><img alt="No account, no telemetry" src="https://img.shields.io/badge/no%20account-no%20telemetry-0f172a?style=flat-square"></a>
  <a href="https://github.com/jacobavina/pdfrev/actions/workflows/ci.yml"><img alt="CI Status" src="https://img.shields.io/github/actions/workflow/status/jacobavina/pdfrev/ci.yml?branch=master&style=flat-square&label=CI"></a>
  <a href="https://github.com/jacobavina/pdfrev/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/jacobavina/pdfrev?style=flat-square&color=0284c7"></a>
</p>

<p align="center">
  <a href="#highlights">Highlights</a> &middot;
  <a href="#measure-and-takeoff-with-cad-precision">Takeoff &amp; CAD</a> &middot;
  <a href="#markup-review-and-tool-chest">Markup &amp; Review</a> &middot;
  <a href="#organize-combine-and-split">Organize &amp; Split</a> &middot;
  <a href="#built-for-agents-too">Agents CLI</a> &middot;
  <a href="#how-its-built">Architecture</a> &middot;
  <a href="#get-started">Get started</a> &middot;
  <a href="#downloads">Downloads</a> &middot;
  <a href="#license-and-credits">License</a>
</p>

<br>

<p align="center">
  <img src="docs/assets/screenshot-dark.png" alt="PdfRev drawing review and takeoff workstation with calibration, polygon area takeoff and markups list" width="100%">
  <br>
  <sub>PdfRev CAD drawing review and takeoff workstation with real-world calibration, polygon area takeoff and markups list.</sub>
</p>

---

## Highlights

<table>
<tr>
<td width="33%" valign="top">

### Precision Takeoff
Real-world scale calibration across metric and imperial systems. Area takeoff with multi-polygon cutout subtraction, perimeter, volume, dynamic length, and visual count symbols with instant CSV and Excel cost summaries.

</td>
<td width="33%" valign="top">

### Fearless
Incremental and atomic saves append modifications while keeping original bytes intact. Automatic `.rea-backup` snapshots, deep undo/redo history, and active protection against unsaved changes on tab or window close.

</td>
<td width="33%" valign="top">

### Yours &amp; Scriptable
Completely local-first with zero accounts, zero cloud dependencies, and zero telemetry. Includes offline Windows Native OCR (`Windows.Media.Ocr`) and a headless CLI (`pdfrev-cli`) built for AI coding and reasoning agents.

</td>
</tr>
</table>

---

## Measure and takeoff with CAD precision

PdfRev is engineered specifically for architecture, engineering, and construction drawings:

- **Calibrate to any scale:** Set precision calibration ratios from architectural fractions (`1/4" = 1'-0"`), engineering ratios (`1:50`, `1:100`), or pick two reference points on any dimension line.
- **Area with polygon cutouts:** Calculate net floor and surface areas. Subtract columns, elevator shafts, or voids with one-click cutout tools; dimensions and cost totals update in real time.
- **Perimeter &amp; dynamic length:** Trace room boundaries, wall lengths, and run conduits with continuous vertex snapping and customizable line styles.
- **Volume &amp; depth:** Assign slab depths or trench heights to calculate exact cubic yards or cubic meters for concrete and earthwork estimates.
- **Symbol count takeoff:** Drop calibrated count markers across drawing sheets with automatic numbering, unit pricing, and instant takeoff schedules.

---

## Markup, review and tool chest

<table>
<tr>
<td width="50%"><img src="docs/assets/screenshot-dark.png" alt="PdfRev dark workstation theme"></td>
<td width="50%"><img src="docs/assets/screenshot-light.png" alt="PdfRev light drawing hall theme"></td>
</tr>
<tr>
<td align="center"><sub>Night Workstation theme with high-contrast CAD geometry</sub></td>
<td align="center"><sub>Drawing Hall light theme for daytime print review</sub></td>
</tr>
</table>

- **Standard PDF Annotations (ISO 32000-1):** High-fidelity roundtrip editing for `/Square`, `/Circle`, `/Polygon`, `/PolyLine`, `/Highlight`, `/FreeText` (Callouts &amp; Typewriter), and `/Stamp`.
- **Sidecar persistence (`.bbx.json`):** Retains extended takeoff metadata, custom formula columns, unit costs, and review statuses alongside the PDF without altering original CAD sign-off signatures.
- **Threaded review comments:** Track markup author, timestamp, status transitions (`Pending`, `Accepted`, `Rejected`, `Completed`, `Cancelled`), and nested replies.
- **AutoCAD SHX Text Hygiene:** Automatically recognizes and isolates AutoCAD SHX font search artifacts, keeping drawing review tables clean and uncluttered.

---

## Organize, combine and split

- **New blank drawings (`Ctrl+N`):** Generate clean blank drawing canvases matching industry standards: ISO (A4, A3, A2, A1, A0), ANSI (Letter, Tabloid, C, D, E), and ARCH (D, E) with configurable CAD grid, lined, or dotted styles.
- **Combine files:** Merge multiple PDF sheets into a consolidated drawing package while preserving layers, scale calibration, and annotations.
- **Split documents:** Divide large plan sets into individual page files or chunked multi-page submittals.
- **Protection on exit:** Closing tabs or quitting the app (`Alt+F4`, `X`) checks for unsaved changes across all open documents with clear *Save*, *Don't Save*, and *Cancel* controls.

---

## Built for agents, too

PdfRev includes a dedicated headless binary (`pdfrev-cli.exe` or `pdfrev --headless`) designed from the ground up for LLMs, autonomous coding agents, and CI pipelines. Every command supports `--json` output and standardized POSIX exit codes.

### CLI Command Matrix

| Command | Description | Example |
|---|---|---|
| `split` | Split a drawing package into chunks of N pages | `pdfrev split plan.pdf --every 1 --out-dir ./sheets --json` |
| `combine` | Merge multiple PDFs in order into one package | `pdfrev combine s1.pdf s2.pdf --output full_set.pdf --json` |
| `extract-text` | Extract plain text from all or specific pages | `pdfrev extract-text specs.pdf --page 1 --json` |
| `markups list` | Extract all markups, takeoffs, and comments as structured JSON | `pdfrev markups list plan.pdf --json` |
| `ocr` | Offline text recognition powered by Windows Media OCR | `pdfrev ocr scan.png --output ocr.txt --json` |

### Sample JSON Output

```bash
pdfrev --json markups list foundation_plan.pdf
```

```json
{
  "input": "foundation_plan.pdf",
  "total_markups": 2,
  "markups": [
    {
      "page": 1,
      "subtype": "Polygon",
      "author": "Structural Engineer",
      "contents": "Rebar reinforcement zone B-4",
      "rect": [240.0, 410.0, 520.0, 680.0],
      "modified": "D:20261024140000Z"
    },
    {
      "page": 1,
      "subtype": "FreeText",
      "author": "Field Inspector",
      "contents": "Verify grade beam depth >= 36in",
      "rect": [310.0, 500.0, 480.0, 560.0],
      "modified": "D:20261024141500Z"
    }
  ]
}
```

---

## How it's built

PdfRev is designed with strict separation between the desktop presentation layer and the native core:

| Component | Technology | Role |
|---|---|---|
| **Frontend Shell** | React 18 &middot; TypeScript &middot; Tailwind CSS | Drawing viewport, tool chest, dock panels, and takeoff tables |
| **Desktop Bridge** | Tauri 2 &middot; WebView2 | Hardware-accelerated rendering, secure native IPC, window state |
| **PDF Core Engine** | Rust &middot; `lopdf` &middot; `flate2` | ISO 32000-1 parsing, xref streams, incremental updates |
| **Automation CLI** | Rust &middot; `clap` &middot; `serde_json` | Headless execution, JSON reporting for AI agents |
| **Windows OCR** | `Windows.Media.Ocr` | Native Windows 10/11 OCR engine; zero model downloads |

### Quality Gates

Every release is verified by automated quality gates:
- **1,475+ Unit Tests:** Comprehensive test coverage across geometry, takeoff math, stamp rendering, and tool pipelines.
- **390 Scenarios in `PARITY.md`:** Rigorous behavioral parity with CAD drawing standards and ISO 32000-1 specifications.
- **34 Native Rust Tests (`cargo test`):** Verifying atomic disk I/O, backup rollbacks, PDF stream parsing, and Windows OCR.
- **Bundle Size Cap:** Main JavaScript chunk strictly enforced under 800 kB ($720\text{ kB}$ measured).

---

## Get started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20.x or v22.x LTS)
- [Rust](https://www.rust-lang.org/) (v1.85+ with `cargo`)
- Windows 10 or 11 with C++ Build Tools installed

```powershell
# 1. Clone the repository
git clone https://github.com/jacobavina/pdfrev.git
cd pdfrev

# 2. Install dependencies
npm install

# 3. Run full automated quality verification suite
node scripts/verify.mjs

# 4. Compile the Windows production installer
npx tauri build --bundles nsis
```

The compiled installer `PdfRev_<version>_x64-setup.exe` will be located in `src-tauri/target/release/bundle/nsis/`.

---

## Downloads

Official release packages are published on the [GitHub Releases](https://github.com/jacobavina/pdfrev/releases/latest) page:

| Package | Format | Description |
|---|---|---|
| **Official Windows Installer** | `PdfRev_<version>_x64-setup.exe` | NSIS setup wizard with Start Menu &amp; Desktop shortcuts |
| **Portable Package** | `pdfrev_<version>_windows_x64_portable.zip` | Standalone zip containing `pdfrev.exe` and `pdfrev-cli.exe` |
| **Cryptographic Hashes** | `SHA256SUMS.txt` | SHA-256 checksums for all official distribution artifacts |

> [!NOTE]
> **Windows SmartScreen &amp; Integrity Verification:**
> As an independent open-source project without a costly commercial EV code-signing certificate, Windows SmartScreen may show an *"Unknown publisher"* notification on initial launch. You can safely proceed by clicking **"More info" &rarr; "Run anyway"**.
> 
> You can verify the integrity of your download against our official checksums using PowerShell:
> ```powershell
> (Get-FileHash -Algorithm SHA256 .\PdfRev_0.1.0_x64-setup.exe).Hash
> ```

---

## License and credits

PdfRev is licensed under the [MIT License](LICENSE).
Third-party font and icon attributions are documented in [ATTRIBUTION.md](ATTRIBUTION.md).

### Trademarks &amp; Non-Affiliation Disclaimer
PdfRev is an independent open-source project and is not affiliated with, endorsed by, sponsored by, or supported by Bluebeam, Inc., the Nemetschek Group, Adobe Inc., or Foxit Software Inc.

"Bluebeam", "Revu", "Adobe Acrobat", and "Foxit" are registered trademarks of their respective owners. Any references to third-party brand names or file formats (such as `.btx`) are strictly for describing technical file-format interoperability.
