# Capture the taskbar strip (no window focus / no mouse move).
# -Zoom upscales and -CropWidth limits the region so 4-digit badges stay readable.
param(
  [string]$OutDir = (Join-Path $env:TEMP 'stealth-taskbar'),
  [int]$Pad = 8,
  [int]$Zoom = 1,
  [int]$CropX = 0,
  [int]$CropWidth = 0,
  [int]$ScreenIndex = 0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$i = 0
foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
  $i++
  if ($ScreenIndex -gt 0 -and $i -ne $ScreenIndex) { continue }

  $b = $screen.Bounds
  $w = $screen.WorkingArea
  # Taskbar = the part of Bounds not covered by WorkingArea (bottom docked assumed).
  $barHeight = [Math]::Max(1, $b.Bottom - $w.Bottom) + $Pad
  $y = $b.Bottom - $barHeight
  $width = if ($CropWidth -gt 0) { [Math]::Min($CropWidth, $b.Width - $CropX) } else { $b.Width }

  $bmp = New-Object System.Drawing.Bitmap $width, $barHeight
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.CopyFromScreen(($b.Left + $CropX), $y, 0, 0, (New-Object System.Drawing.Size $width, $barHeight))
  $gfx.Dispose()

  $final = $bmp
  if ($Zoom -gt 1) {
    $zoomed = New-Object System.Drawing.Bitmap ($width * $Zoom), ($barHeight * $Zoom)
    $zg = [System.Drawing.Graphics]::FromImage($zoomed)
    $zg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $zg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $zg.DrawImage($bmp, 0, 0, $zoomed.Width, $zoomed.Height)
    $zg.Dispose()
    $bmp.Dispose()
    $final = $zoomed
  }

  $out = Join-Path $OutDir ("screen{0}-taskbar.png" -f $i)
  $final.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $final.Dispose()
  Write-Output $out
}
