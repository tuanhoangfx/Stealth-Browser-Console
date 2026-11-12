$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$icon = "C:\Users\PC02\Desktop\CWS-E0001-ICON-128.png"
if (-not (Test-Path $icon)) {
  $icon = Join-Path $PSScriptRoot "..\icons\icon128.png"
}
$out = "C:\Users\PC02\Desktop\CWS-E0001-SCREENSHOT-1280x800.png"
$bmp = New-Object System.Drawing.Bitmap 1280, 800
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(15, 23, 42))
$img = [System.Drawing.Image]::FromFile($icon)
$g.DrawImage($img, 530, 290, 220, 220)
$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host $out
