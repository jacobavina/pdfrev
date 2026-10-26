import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = path.resolve('.');
const srcTauriDir = path.join(rootDir, 'src-tauri');
const iconsDir = path.join(srcTauriDir, 'icons');
const masterIconPath = path.join(iconsDir, 'icon.png');

console.log('[ICON] Generating pdfrev visual identity kit (full-size modern icon)...');

// 1. Generate master 512x512 icon using PowerShell System.Drawing
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

# --- MASTER ICON 512x512 (FULL-BLEED MODERN CAD ICON) ---
$bmp = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

# Base Squircle filling full tile with anti-aliasing margin (8, 8, 496, 496, radius 104)
# Vibrant technical cyan / blueprint gradient matching CADCraft & modern Windows apps
$rect = New-Object System.Drawing.Rectangle 8, 8, 496, 496
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, [System.Drawing.Color]::FromArgb(255, 2, 132, 199), [System.Drawing.Color]::FromArgb(255, 14, 165, 233), 45.0)
Draw-RoundedRect $g $gradBrush 8 8 496 496 104
$gradBrush.Dispose()

# Blueprint subtle technical grid lines across the full squircle
$gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45, 255, 255, 255)), 1.5
for ($i = 56; $i -lt 480; $i += 48) {
    $g.DrawLine($gridPen, [float]$i, 16.0, [float]$i, 496.0)
    $g.DrawLine($gridPen, 16.0, [float]$i, 496.0, [float]$i)
}
$gridPen.Dispose()

# Outer squircle highlight stroke (Fluent glass aesthetic)
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(140, 255, 255, 255)), 2.5
Stroke-RoundedRect $g $borderPen 8 8 496 496 104
$borderPen.Dispose()

# Shadow behind the white document sheet
$sheetShadow = New-Object System.Drawing.Drawing2D.GraphicsPath
$sheetShadow.AddLine(76, 72, 334, 72)
$sheetShadow.AddLine(440, 178, 440, 452)
$sheetShadow.AddLine(76, 452, 76, 72)
$sheetShadow.CloseFigure()
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 30, 80))
$g.FillPath($shadowBrush, $sheetShadow)
$shadowBrush.Dispose()
$sheetShadow.Dispose()

# Large prominent technical drawing sheet (white card)
$sheetPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$sheetPath.AddLine(72, 64, 330, 64)
$sheetPath.AddLine(436, 170, 436, 444)
$sheetPath.AddLine(72, 444, 72, 64)
$sheetPath.CloseFigure()

$sheetGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, [System.Drawing.Color]::FromArgb(255, 255, 255, 255), [System.Drawing.Color]::FromArgb(255, 241, 245, 249), 90.0)
$g.FillPath($sheetGrad, $sheetPath)
$sheetBorderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 226, 232, 240)), 2.0
$g.DrawPath($sheetBorderPen, $sheetPath)
$sheetBorderPen.Dispose()
$sheetGrad.Dispose()
$sheetPath.Dispose()

# Corner fold (cyan/slate shaded flap)
$foldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$foldPath.AddLine(330, 64, 330, 170)
$foldPath.AddLine(436, 170, 330, 64)
$foldPath.CloseFigure()
$foldGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, [System.Drawing.Color]::FromArgb(255, 203, 213, 225), [System.Drawing.Color]::FromArgb(255, 241, 245, 249), 45.0)
$g.FillPath($foldGrad, $foldPath)
$foldBorderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 148, 163, 184)), 2.0
$g.DrawPath($foldBorderPen, $foldPath)
$foldBorderPen.Dispose()
$foldGrad.Dispose()
$foldPath.Dispose()

# Central Brand Letter "P" with deep blueprint navy gradient (high contrast, ultra legible)
$font = New-Object System.Drawing.Font ("Segoe UI", 215, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$pGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, [System.Drawing.Color]::FromArgb(255, 15, 23, 42), [System.Drawing.Color]::FromArgb(255, 2, 132, 199), 90.0)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("P", $font, $pGrad, 242, 244, $sf)
$font.Dispose()
$pGrad.Dispose()

# Architectural Takeoff / Measurement caliper line at bottom of sheet
$accentPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 2, 132, 199)), 4.0
$g.DrawLine($accentPen, 120, 396, 388, 396)
$g.DrawLine($accentPen, 120, 384, 120, 408)
$g.DrawLine($accentPen, 388, 384, 388, 408)
$accentPen.Dispose()

# Technical sub-indicator tick mark at center of dimension
$tickBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 14, 165, 233))
$g.FillEllipse($tickBrush, 248, 390, 12, 12)
$tickBrush.Dispose()

$bmp.Save("${masterIconPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
`;

fs.writeFileSync(path.join(rootDir, 'temp-icon-gen.ps1'), psScript, 'utf8');
const psRes = spawnSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', 'temp-icon-gen.ps1'], {
  cwd: rootDir,
  stdio: 'inherit',
});
fs.unlinkSync(path.join(rootDir, 'temp-icon-gen.ps1'));

if (psRes.status !== 0) {
  console.error('[ICON ERROR] Failed to generate master PNG.');
  process.exit(1);
}

console.log('[ICON] Master icon created.');

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
    'docs/assets/logo.png',
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
