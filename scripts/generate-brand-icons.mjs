import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = path.resolve('.');
const srcTauriDir = path.join(rootDir, 'src-tauri');
const iconsDir = path.join(srcTauriDir, 'icons');
const masterIconPath = path.join(iconsDir, 'icon.png');
const nsisHeaderPath = path.join(srcTauriDir, 'nsis-header.bmp');
const nsisSidebarPath = path.join(srcTauriDir, 'nsis-sidebar.bmp');

console.log('[ICON] Generating pdfrev visual identity kit...');

// 1. Generate master 512x512 icon, NSIS header (150x57 BMP), and NSIS sidebar (164x314 BMP) using PowerShell System.Drawing
const psScript = `
Add-Type -AssemblyName System.Drawing

function Draw-RoundedRect([System.Drawing.Graphics]$g, [System.Drawing.Brush]$brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)
    $path.Dispose()
}

function Stroke-RoundedRect([System.Drawing.Graphics]$g, [System.Drawing.Pen]$pen, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.DrawPath($pen, $path)
    $path.Dispose()
}

# --- MASTER ICON 512x512 ---
$bmp = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

# Drop shadow for squircle
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
Draw-RoundedRect $g $shadowBrush 28 34 456 456 100
$shadowBrush.Dispose()

# Base squircle with blueprint navy gradient
$rect = New-Object System.Drawing.Rectangle 24, 24, 464, 464
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, [System.Drawing.Color]::FromArgb(255, 12, 22, 44), [System.Drawing.Color]::FromArgb(255, 23, 42, 77), 45.0)
Draw-RoundedRect $g $gradBrush 24 24 464 464 96
$gradBrush.Dispose()

# Blueprint subtle grid lines
$gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(35, 56, 189, 248)), 1.5
for ($i = 74; $i -lt 470; $i += 45) {
    $g.DrawLine($gridPen, [float]$i, 40.0, [float]$i, 470.0)
    $g.DrawLine($gridPen, 40.0, [float]$i, 470.0, [float]$i)
}
$gridPen.Dispose()

# Outer squircle border
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 56, 189, 248)), 3.0
Stroke-RoundedRect $g $borderPen 24 24 464 464 96
$borderPen.Dispose()

# Document glyph (PDF sheet silhouette with folded corner)
$sheetPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$sheetPath.AddLine(120, 110, 310, 110)
$sheetPath.AddLine(390, 190, 390, 400)
$sheetPath.AddLine(120, 400, 120, 110)
$sheetPath.CloseFigure()
$sheetGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, [System.Drawing.Color]::FromArgb(230, 15, 30, 60), [System.Drawing.Color]::FromArgb(240, 20, 50, 95), 90.0)
$g.FillPath($sheetGrad, $sheetPath)
$sheetBorderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 56, 189, 248)), 2.5
$g.DrawPath($sheetBorderPen, $sheetPath)
$sheetBorderPen.Dispose()
$sheetGrad.Dispose()
$sheetPath.Dispose()

# Corner fold
$foldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$foldPath.AddLine(310, 110, 310, 190)
$foldPath.AddLine(390, 190, 310, 110)
$foldPath.CloseFigure()
$foldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 56, 189, 248))
$g.FillPath($foldBrush, $foldPath)
$foldBrush.Dispose()
$foldPath.Dispose()

# Central Brand Letter "P" with vibrant cyanotype gradient
$font = New-Object System.Drawing.Font ("Segoe UI", 168, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$pGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, [System.Drawing.Color]::FromArgb(255, 240, 249, 255), [System.Drawing.Color]::FromArgb(255, 56, 189, 248), 65.0)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("P", $font, $pGrad, 240, 265, $sf)
$font.Dispose()
$pGrad.Dispose()

# Caliper / Takeoff accent mark at bottom right
$accentPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 29, 108, 208)), 4.0
$g.DrawLine($accentPen, 290, 370, 370, 370)
$g.DrawLine($accentPen, 290, 360, 290, 380)
$g.DrawLine($accentPen, 370, 360, 370, 380)
$accentPen.Dispose()

$bmp.Save("${masterIconPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()

# --- NSIS HEADER (150x57 BMP with 4x supersampling 600x228) ---
$h4xBmp = New-Object System.Drawing.Bitmap 600, 228, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$hg4 = [System.Drawing.Graphics]::FromImage($h4xBmp)
$hg4.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$hg4.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$hg4.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Clean light background matching NSIS MUI2 inner dialogs
$hBgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
$hg4.FillRectangle($hBgBrush, 0, 0, 600, 228)
$hBgBrush.Dispose()

# Subtle bottom border line
$hBorderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 226, 232, 240)), 4.0
$hg4.DrawLine($hBorderPen, 0, 226, 600, 226)
$hBorderPen.Dispose()

# Draw miniature master icon on the right
$hg4.DrawImage($bmp, 420, 34, 160, 160)

# Right-aligned brand typography in header
$hFont = New-Object System.Drawing.Font ("Segoe UI", 68, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$hPdfBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$hRevBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 2, 132, 199))

$sizePdf = $hg4.MeasureString("Pdf", $hFont)
$sizeRev = $hg4.MeasureString("Rev", $hFont)
$hTextX = 405 - ($sizePdf.Width + $sizeRev.Width - 24)
$hg4.DrawString("Pdf", $hFont, $hPdfBrush, $hTextX, 60)
$hg4.DrawString("Rev", $hFont, $hRevBrush, ($hTextX + $sizePdf.Width - 24), 60)

$hSubFont = New-Object System.Drawing.Font ("Segoe UI", 36, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$hSubBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 100, 116, 139))
$hg4.DrawString("CAD Drawing Workstation", $hSubFont, $hSubBrush, ($hTextX + 4), 140)

$hFont.Dispose()
$hSubFont.Dispose()
$hPdfBrush.Dispose()
$hRevBrush.Dispose()
$hSubBrush.Dispose()

# Downsample header to 150x57 24-bit BMP
$hBmp = New-Object System.Drawing.Bitmap 150, 57, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$hg = [System.Drawing.Graphics]::FromImage($hBmp)
$hg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$hg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$hg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$hg.DrawImage($h4xBmp, 0, 0, 150, 57)
$hBmp.Save("${nsisHeaderPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Bmp)
$hg.Dispose()
$hBmp.Dispose()
$hg4.Dispose()
$h4xBmp.Dispose()

# --- NSIS SIDEBAR (164x314 BMP with 4x supersampling 656x1256) ---
$s4xBmp = New-Object System.Drawing.Bitmap 656, 1256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$sg4 = [System.Drawing.Graphics]::FromImage($s4xBmp)
$sg4.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$sg4.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$sg4.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Deep blueprint gradient background
$sRect4 = New-Object System.Drawing.Rectangle 0, 0, 656, 1256
$sGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($sRect4, [System.Drawing.Color]::FromArgb(255, 7, 11, 20), [System.Drawing.Color]::FromArgb(255, 23, 37, 84), 90.0)
$sg4.FillRectangle($sGrad, $sRect4)
$sGrad.Dispose()

# Blueprint technical grid lines
$sGridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(35, 56, 189, 248)), 2.0
for ($y = 80; $y -lt 1256; $y += 120) {
    $sg4.DrawLine($sGridPen, 0, $y, 656, $y)
}
for ($x = 80; $x -lt 656; $x += 120) {
    $sg4.DrawLine($sGridPen, $x, 0, $x, 1256)
}
$sGridPen.Dispose()

# Corner CAD registration marks (+)
$cadPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 56, 189, 248)), 3.0
$sg4.DrawLine($cadPen, 32, 24, 32, 48)
$sg4.DrawLine($cadPen, 20, 36, 44, 36)
$sg4.DrawLine($cadPen, 624, 24, 624, 48)
$sg4.DrawLine($cadPen, 612, 36, 636, 36)
$sg4.DrawLine($cadPen, 32, 1208, 32, 1232)
$sg4.DrawLine($cadPen, 20, 1220, 44, 1220)
$sg4.DrawLine($cadPen, 624, 1208, 624, 1232)
$sg4.DrawLine($cadPen, 612, 1220, 636, 1220)
$cadPen.Dispose()

# Draw high-res master icon on sidebar (centered: X = (656-320)/2 = 168, Y = 192)
$sg4.DrawImage($bmp, 168, 192, 320, 320)

# Two-tone title: "Pdf" (white) + "Rev" (cyan)
$sTitleFont = New-Object System.Drawing.Font ("Segoe UI", 92, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sPdfBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
$sRevBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 56, 189, 248))

$sSizePdf = $sg4.MeasureString("Pdf", $sTitleFont)
$sSizeRev = $sg4.MeasureString("Rev", $sTitleFont)
$sTotalW = $sSizePdf.Width + $sSizeRev.Width - 32
$sStartX = (656 - $sTotalW) / 2
$sg4.DrawString("Pdf", $sTitleFont, $sPdfBrush, $sStartX, 560)
$sg4.DrawString("Rev", $sTitleFont, $sRevBrush, ($sStartX + $sSizePdf.Width - 32), 560)
$sTitleFont.Dispose()
$sPdfBrush.Dispose()
$sRevBrush.Dispose()

# Cyan technical accent line
$sDivPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 56, 189, 248)), 6.0
$sg4.DrawLine($sDivPen, 248, 680, 408, 680)
$sDivPen.Dispose()

# Subtitle
$sDescFont = New-Object System.Drawing.Font ("Segoe UI", 44, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$sDescBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
$ssf = New-Object System.Drawing.StringFormat
$ssf.Alignment = [System.Drawing.StringAlignment]::Center
$sg4.DrawString("CAD PDF & Takeoff\`nWorkstation", $sDescFont, $sDescBrush, 328, 715, $ssf)
$sDescFont.Dispose()
$sDescBrush.Dispose()

# Bottom pill badge: "Windows x64 · Local-First"
$pillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 11, 19, 43))
Draw-RoundedRect $sg4 $pillBrush 116 1130 424 72 36
$pillBrush.Dispose()

$pillPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 56, 189, 248)), 3.0
Stroke-RoundedRect $sg4 $pillPen 116 1130 424 72 36
$pillPen.Dispose()

$pillFont = New-Object System.Drawing.Font ("Segoe UI", 34, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$pillTextBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 224, 242, 254))
$sg4.DrawString("Windows x64 · Local-First", $pillFont, $pillTextBrush, 328, 1146, $ssf)
$pillFont.Dispose()
$pillTextBrush.Dispose()
$ssf.Dispose()

# Downsample sidebar to 164x314 24-bit BMP
$sBmp = New-Object System.Drawing.Bitmap 164, 314, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$sg = [System.Drawing.Graphics]::FromImage($sBmp)
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$sg.DrawImage($s4xBmp, 0, 0, 164, 314)
$sBmp.Save("${nsisSidebarPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Bmp)
$sg.Dispose()
$sBmp.Dispose()
$sg4.Dispose()
$s4xBmp.Dispose()
$bmp.Dispose()
`;

fs.writeFileSync(path.join(rootDir, 'temp-icon-gen.ps1'), psScript, 'utf8');
const psRes = spawnSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', 'temp-icon-gen.ps1'], {
  cwd: rootDir,
  stdio: 'inherit',
});
fs.unlinkSync(path.join(rootDir, 'temp-icon-gen.ps1'));

if (psRes.status !== 0) {
  console.error('[ICON ERROR] Failed to generate master PNG and NSIS bitmaps.');
  process.exit(1);
}

console.log('[ICON] Master icon and NSIS bitmaps created.');

// 2. Invoke tauri icon
console.log('[ICON] Generating multi-platform icon assets via npx tauri icon...');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const tauriIconRes = spawnSync(npxCmd, ['tauri', 'icon', masterIconPath, '-o', iconsDir], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

if (tauriIconRes.status !== 0) {
  console.error('[ICON ERROR] tauri icon failed.');
  process.exit(1);
}

// Clean up non-Windows mobile icon folders generated by tauri icon
try {
  fs.rmSync(path.join(iconsDir, 'android'), { recursive: true, force: true });
  fs.rmSync(path.join(iconsDir, 'ios'), { recursive: true, force: true });
} catch {}

// 3. Duplicate icon.ico as pdfrev.ico
const iconIcoPath = path.join(iconsDir, 'icon.ico');
const pdfrevIcoPath = path.join(iconsDir, 'pdfrev.ico');
fs.copyFileSync(iconIcoPath, pdfrevIcoPath);
console.log('[ICON] Created pdfrev.ico from icon.ico.');

// Copy master icon to docs/assets/logo.png
const docsAssetsDir = path.join(rootDir, 'docs', 'assets');
fs.mkdirSync(docsAssetsDir, { recursive: true });
fs.copyFileSync(masterIconPath, path.join(docsAssetsDir, 'logo.png'));
console.log('[ICON] Synced docs/assets/logo.png.');

// 4. Update ATTRIBUTION.md with new SHA256 hashes
const attributionPath = path.join(rootDir, 'ATTRIBUTION.md');
if (fs.existsSync(attributionPath)) {
  let attributionContent = fs.readFileSync(attributionPath, 'utf8');

  // List of all generated files to update in ATTRIBUTION.md
  const trackedFiles = [
    ...fs.readdirSync(iconsDir).filter(f => fs.statSync(path.join(iconsDir, f)).isFile()).map(f => `src-tauri/icons/${f}`),
    'src-tauri/nsis-header.bmp',
    'src-tauri/nsis-sidebar.bmp',
    'docs/assets/logo.png',
    'docs/assets/screenshot-dark.png',
    'docs/assets/screenshot-light.png',
  ];

  for (const relPath of trackedFiles) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
    const fileBytes = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex').toUpperCase();

    const regex = new RegExp(`(\\|\\s*\`${relPath.replace('.', '\\.')}\`[^\\|]*\\|[^\\|]*\\|[^\\|]*\\|[^\\|]*\\|\\s*\`)([A-F0-9]{64})(\`\\s*\\|)`, 'g');
    attributionContent = attributionContent.replace(regex, `$1${sha256}$3`);
  }

  fs.writeFileSync(attributionPath, attributionContent, 'utf8');
  console.log('[ICON] ATTRIBUTION.md updated with new SHA256 hashes.');
}

console.log('✅ [ICON] Brand visual identity generation completed successfully.');
