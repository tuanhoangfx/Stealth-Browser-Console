const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function escapePs(str) {
  return String(str || "").replace(/'/g, "''");
}

/**
 * V2 code-only tile — entire toolbar slot is profile code (squircle, bold digits).
 * Popup keeps group/meta; tooltip is compact `[code] · group`.
 */
function writeProfileCodeTileIconPngs(outDir, code, { force = false } = {}) {
  const profileCode = String(code || "0000").slice(0, 5);
  const stampFile = path.join(outDir, ".chip.txt");
  const stamp = `${profileCode}|v2-code-tile`;
  const icon32 = path.join(outDir, "icon32.png");
  if (!force && fs.existsSync(icon32) && fs.existsSync(stampFile) && fs.readFileSync(stampFile, "utf8") === stamp) {
    return;
  }
  const dir = escapePs(outDir);
  const label = escapePs(profileCode);
  const stampEsc = escapePs(stamp);
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = '${dir}'
$code = '${label}'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
function New-CodeTile($size, $file) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear([System.Drawing.Color]::Transparent)
  $pad = [Math]::Max(1, [int]($size * 0.06))
  $rect = New-Object System.Drawing.Rectangle $pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = [Math]::Max(4, [int]($rect.Width * 0.22))
  $path.AddArc($rect.Left, $rect.Top, $r * 2, $r * 2, 180, 90)
  $path.AddArc($rect.Right - $r * 2, $rect.Top, $r * 2, $r * 2, 270, 90)
  $path.AddArc($rect.Right - $r * 2, $rect.Bottom - $r * 2, $r * 2, $r * 2, 0, 90)
  $path.AddArc($rect.Left, $rect.Bottom - $r * 2, $r * 2, $r * 2, 90, 90)
  $path.CloseFigure()
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255,79,70,229), [System.Drawing.Color]::FromArgb(255,55,48,163), 135)
  $g.FillPath($brush, $path)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255,199,210,254), [Math]::Max(1.25, $size / 12.0))
  $g.DrawPath($pen, $path)
  $len = $code.Length
  $fontSize = if ($len -gt 4) { [Math]::Max(5.5, $size * 0.26) } elseif ($len -gt 3) { [Math]::Max(6.5, $size * 0.32) } else { [Math]::Max(7.5, $size * 0.36) }
  $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString($code, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF $rect.Left, $rect.Top, $rect.Width, $rect.Height), $sf)
  $bmp.Save((Join-Path $dir $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $path.Dispose(); $pen.Dispose()
}
New-CodeTile 16 'icon16.png'
New-CodeTile 32 'icon32.png'
New-CodeTile 48 'icon48.png'
try { Set-Content -LiteralPath (Join-Path $dir '.chip.txt') -Value '${stampEsc}' -Encoding UTF8 -NoNewline } catch {}
Write-Output 'ok'
`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    timeout: 15000,
  });
}

/** @deprecated Use writeProfileCodeTileIconPngs (Design V2). */
function writeProfilePillIconPngs(outDir, code, _chipText = "", opts = {}) {
  writeProfileCodeTileIconPngs(outDir, code, opts);
}

/** @deprecated */
function writeProfileIconPngs(outDir, code) {
  writeProfileCodeTileIconPngs(outDir, code);
}

module.exports = { writeProfileCodeTileIconPngs, writeProfilePillIconPngs, writeProfileIconPngs };
