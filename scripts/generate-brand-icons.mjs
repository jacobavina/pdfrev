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
$bmp.Dispose()

# --- NSIS HEADER 150x57 BMP ---
$hBmp = New-Object System.Drawing.Bitmap 150, 57, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$hg = [System.Drawing.Graphics]::FromImage($hBmp)
$hg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$hRect = New-Object System.Drawing.Rectangle 0, 0, 150, 57
$hGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($hRect, [System.Drawing.Color]::FromArgb(255, 15, 23, 42), [System.Drawing.Color]::FromArgb(255, 24, 38, 68), 0.0)
$hg.FillRectangle($hGrad, $hRect)
$hGrad.Dispose()

$hFont = New-Object System.Drawing.Font ("Segoe UI", 13, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$hBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 249, 255))
$hg.DrawString("pdfrev", $hFont, $hBrush, 12, 12)
$hFont.Dispose()

$hSubFont = New-Object System.Drawing.Font ("Segoe UI", 9, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$hSubBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
$hg.DrawString("PDF Reader & Editor", $hSubFont, $hSubBrush, 12, 30)
$hSubFont.Dispose()
$hSubBrush.Dispose()
$hBrush.Dispose()

# Mini icon on the right
Draw-RoundedRect $hg (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 29, 108, 208))) 108 10 36 36 8
$miniPFont = New-Object System.Drawing.Font ("Segoe UI", 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$miniPBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$hg.DrawString("P", $miniPFont, $miniPBrush, 118, 15)
$miniPFont.Dispose()
$miniPBrush.Dispose()

$hBmp.Save("${nsisHeaderPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Bmp)
$hg.Dispose()
$hBmp.Dispose()

# --- NSIS SIDEBAR 164x314 BMP ---
$sBmp = New-Object System.Drawing.Bitmap 164, 314, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$sg = [System.Drawing.Graphics]::FromImage($sBmp)
$sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$sRect = New-Object System.Drawing.Rectangle 0, 0, 164, 314
$sGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($sRect, [System.Drawing.Color]::FromArgb(255, 12, 19, 36), [System.Drawing.Color]::FromArgb(255, 23, 37, 65), 90.0)
$sg.FillRectangle($sGrad, $sRect)
$sGrad.Dispose()

# Blueprint lines in sidebar
$sGridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(25, 56, 189, 248)), 1.0
for ($y = 20; $y -lt 314; $y += 30) {
    $sg.DrawLine($sGridPen, 0, $y, 164, $y)
}
for ($x = 20; $x -lt 164; $x += 30) {
    $sg.DrawLine($sGridPen, $x, 0, $x, 314)
}
$sGridPen.Dispose()

# Large logo mark on sidebar
Draw-RoundedRect $sg (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 29, 108, 208))) 42 60 80 80 18
Stroke-RoundedRect $sg (New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 56, 189, 248), 2.0)) 42 60 80 80 18
$spFont = New-Object System.Drawing.Font ("Segoe UI", 44, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$spBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$sg.DrawString("P", $spFont, $spBrush, 62, 72)
$spFont.Dispose()
$spBrush.Dispose()

$sTitleFont = New-Object System.Drawing.Font ("Segoe UI", 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sTitleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 241, 245, 249))
$ssf = New-Object System.Drawing.StringFormat
$ssf.Alignment = [System.Drawing.StringAlignment]::Center
$sg.DrawString("pdfrev", $sTitleFont, $sTitleBrush, 82, 160, $ssf)
$sTitleFont.Dispose()
$sTitleBrush.Dispose()

$sDescFont = New-Object System.Drawing.Font ("Segoe UI", 10, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$sDescBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
$sg.DrawString("Local-first PDF editor\`nand drawing takeoff", $sDescFont, $sDescBrush, 82, 195, $ssf)
$sDescFont.Dispose()
$sDescBrush.Dispose()
$ssf.Dispose()

$sBmp.Save("${nsisSidebarPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Bmp)
$sg.Dispose()
$sBmp.Dispose()
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

// 3. Duplicate icon.ico as pdfrev.ico
const iconIcoPath = path.join(iconsDir, 'icon.ico');
const pdfrevIcoPath = path.join(iconsDir, 'pdfrev.ico');
fs.copyFileSync(iconIcoPath, pdfrevIcoPath);
console.log('[ICON] Created pdfrev.ico from icon.ico.');

// 4. Update ATTRIBUTION.md with new SHA256 hashes
const attributionPath = path.join(rootDir, 'ATTRIBUTION.md');
if (fs.existsSync(attributionPath)) {
  let attributionContent = fs.readFileSync(attributionPath, 'utf8');
  const filesToCheck = fs.readdirSync(iconsDir);

  for (const file of filesToCheck) {
    const fullPath = path.join(iconsDir, file);
    if (!fs.statSync(fullPath).isFile()) continue;
    const fileBytes = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex').toUpperCase();

    // Match table line with `src-tauri/icons/<file>`
    const regex = new RegExp(`(\\|\\s*\`src-tauri/icons/${file.replace('.', '\\.')}\`[^\\|]*\\|[^\\|]*\\|[^\\|]*\\|[^\\|]*\\|\\s*\`)([A-F0-9]{64})(\`\\s*\\|)`, 'g');
    attributionContent = attributionContent.replace(regex, `$1${sha256}$3`);
  }

  fs.writeFileSync(attributionPath, attributionContent, 'utf8');
  console.log('[ICON] ATTRIBUTION.md updated with new SHA256 hashes.');
}

console.log('✅ [ICON] Brand visual identity generation completed successfully.');
