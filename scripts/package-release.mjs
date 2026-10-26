import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = 'C:/dev/rea';
const DIST_RELEASE = path.join(ROOT, 'dist-release');
const TARGET_RELEASE = path.join(ROOT, 'src-tauri/target/release');

const tauriConf = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'));
const VERSION = tauriConf.version || '0.1.2';

const NSIS_EXE = path.join(TARGET_RELEASE, `bundle/nsis/PdfRev_${VERSION}_x64-setup.exe`);
const PDFREV_EXE = path.join(TARGET_RELEASE, 'pdfrev.exe');
const CLI_EXE = path.join(TARGET_RELEASE, 'pdfrev-cli.exe');

// 1. Ensure dist-release exists
fs.mkdirSync(DIST_RELEASE, { recursive: true });

// 2. Copy NSIS installer if it exists
const destInstaller = path.join(DIST_RELEASE, `PdfRev_${VERSION}_x64-setup.exe`);
if (fs.existsSync(NSIS_EXE)) {
  fs.copyFileSync(NSIS_EXE, destInstaller);
  console.log('Copied NSIS installer to:', destInstaller);
} else {
  console.warn('NSIS installer not found at:', NSIS_EXE);
}

// 3. Prepare portable staging folder
const portableStaging = path.join(DIST_RELEASE, 'portable_staging');
fs.rmSync(portableStaging, { recursive: true, force: true });
fs.mkdirSync(portableStaging, { recursive: true });

if (fs.existsSync(PDFREV_EXE)) {
  fs.copyFileSync(PDFREV_EXE, path.join(portableStaging, 'pdfrev.exe'));
}
if (fs.existsSync(CLI_EXE)) {
  fs.copyFileSync(CLI_EXE, path.join(portableStaging, 'pdfrev-cli.exe'));
}
fs.copyFileSync(path.join(ROOT, 'README.md'), path.join(portableStaging, 'README.md'));
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(portableStaging, 'LICENSE'));

const destZip = path.join(DIST_RELEASE, `pdfrev_v${VERSION}_windows_x64_portable.zip`);
if (fs.existsSync(destZip)) fs.unlinkSync(destZip);

execSync(`tar -a -c -f "${destZip}" -C "${portableStaging}" pdfrev.exe pdfrev-cli.exe README.md LICENSE`, { stdio: 'inherit' });
fs.rmSync(portableStaging, { recursive: true, force: true });
console.log('Created portable zip:', destZip);

// 4. Calculate SHA256
function sha256File(file) {
  if (!fs.existsSync(file)) return 'N/A';
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const installerHash = sha256File(destInstaller);
const zipHash = sha256File(destZip);

const installerSizeMB = fs.existsSync(destInstaller) ? (fs.statSync(destInstaller).size / (1024 * 1024)).toFixed(1) : '0';
const zipSizeMB = fs.existsSync(destZip) ? (fs.statSync(destZip).size / (1024 * 1024)).toFixed(1) : '0';

const sumsContent = `${installerHash}  PdfRev_${VERSION}_x64-setup.exe\n${zipHash}  pdfrev_v${VERSION}_windows_x64_portable.zip\n`;
fs.writeFileSync(path.join(DIST_RELEASE, 'SHA256SUMS.txt'), sumsContent, 'utf8');
console.log('Wrote SHA256SUMS.txt:\n' + sumsContent);

// 5. Generate release notes
const releaseNotes = `# PdfRev v${VERSION} — Production Release

**PdfRev** is an open-source, local-first PDF viewer, takeoff workstation, and headless automation runtime built for Architecture, Engineering, and Construction (AEC) professionals — designed from the ground up to be driven both interactively by humans and programmatically by **AI coding and reasoning agents**.

---

### Key Capabilities

| Capability | Description |
|:---|:---|
| **Local-First & Zero Telemetry** | Drawings and markups remain strictly on your local device. No accounts, no cloud dependencies, complete privacy. |
| **Clean Workspace & Blank PDF Engine** | Opens to an uncluttered workspace. Create standard blank PDFs (\`Ctrl+N\` / File → New PDF...) with ISO/ANSI/ARCH templates, customizable dimensions, units, orientation, grid styles, and default persistence. |
| **Unsaved Changes Guard** | Reliable protection against accidental data loss when closing tabs or exiting the application (\`Alt+F4\`, window close), with options to Save, Discard, or Cancel. |
| **AutoCAD SHX Compatibility** | Clean rendering and annotation import for CAD-exported drawings without unwanted bounding boxes or text border artifacts. |
| **Precision AEC Takeoff** | Calibrated measurements for Area with multi-polygon Cutout subtraction, Perimeter, Volume, Dynamic Length, and autonomous shape Count takeoff. |
| **ISO 32000-1 & Tool Set Interoperability** | Standard \`/Annots\` (\`/Square\`, \`/Circle\`, \`/Highlight\`, \`/Ink\`, \`/Stamp\`), \`.bbx.json\` sidecar persistence, status tracking, and \`.btx\` tool set profile import. |
| **Headless AI Agent CLI (\`pdfrev-cli.exe\`)** | First-class command-line interface for LLMs and autonomous agents to split, combine, inspect markup lists, extract text, and run OCR with structured JSON output and standardized exit codes. |
| **Windows Native OCR** | Fast, offline text recognition powered directly by Windows Media OCR APIs (\`Windows.Media.Ocr\`). Zero model downloads, zero GPU prerequisites. |
| **Clean Native Unbranded Installer** | Streamlined native Windows installer setup without custom branding bitmaps. |

---

### Downloads & Verification

| Asset | Size | SHA-256 Checksum |
|:---|:---|:---|
| [\`PdfRev_${VERSION}_x64-setup.exe\`](https://github.com/jacobavina/pdfrev/releases/download/v${VERSION}/PdfRev_${VERSION}_x64-setup.exe) | ~${installerSizeMB} MB | \`${installerHash}\` |
| [\`pdfrev_v${VERSION}_windows_x64_portable.zip\`](https://github.com/jacobavina/pdfrev/releases/download/v${VERSION}/pdfrev_v${VERSION}_windows_x64_portable.zip) | ~${zipSizeMB} MB | \`${zipHash}\` |
| [\`SHA256SUMS.txt\`](https://github.com/jacobavina/pdfrev/releases/download/v${VERSION}/SHA256SUMS.txt) | Verification file | — |

> **Note on Windows SmartScreen:** As an independent open-source release without an enterprise EV certificate, Windows SmartScreen may display a standard protection notice on first launch. You can safely proceed by clicking **More info → Run anyway** and verify the download against \`SHA256SUMS.txt\`.

---

**Full Changelog**: https://github.com/jacobavina/pdfrev/commits/v${VERSION}
`;

fs.writeFileSync(path.join(DIST_RELEASE, `release-notes-v${VERSION}.md`), releaseNotes, 'utf8');
console.log('Wrote release notes successfully without BOM.');
