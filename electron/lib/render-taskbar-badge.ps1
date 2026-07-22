# Taskbar overlay — Design V4 digits only. Native-size Chromium + colored last3 + thin halo.
param(
  [Parameter(Mandatory = $true)][string]$Digits,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [Parameter(Mandatory = $true)][string]$Prefix,
  [Parameter(Mandatory = $true)][string]$ChromeExe,
  [Parameter(Mandatory = $true)][int]$DigitR,
  [Parameter(Mandatory = $true)][int]$DigitG,
  [Parameter(Mandatory = $true)][int]$DigitB,
  [Parameter(Mandatory = $true)][string]$SizesCsv,
  [string]$DigitGapsCsv = ""
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Get-ChromeBitmap {
  param([string]$Exe, [int]$Size)
  try {
    $ico = New-Object System.Drawing.Icon($Exe, $Size, $Size)
    return $ico.ToBitmap()
  } catch {
    $fallback = [System.Drawing.Icon]::ExtractAssociatedIcon($Exe)
    if (-not $fallback) { return $null }
    $bmp = $fallback.ToBitmap()
    $fallback.Dispose()
    if ($bmp.Width -eq $Size -and $bmp.Height -eq $Size) { return $bmp }
    $out = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.DrawImage($bmp, 0, 0, $Size, $Size)
    $g.Dispose(); $bmp.Dispose()
    return $out
  }
}

function Measure-DigitWidth {
  param($Gdi, [string]$Ch, $Font)
  $sf = [System.Drawing.StringFormat]::GenericTypographic
  $sf.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
  $m = $Gdi.MeasureString($Ch, $Font, 10000, $sf)
  return [single]$m.Width
}

function Draw-PackedBoldDigits {
  param(
    $Gdi,
    [string]$Text,
    [single]$TextY,
    [single]$TextH,
    [single]$CanvasW,
    [single]$FontSize,
    [single]$MaxKern,
    [single]$DigitGap,
    [System.Drawing.Color]$DigitColor
  )

  $font = New-Object System.Drawing.Font("Segoe UI", $FontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = [System.Drawing.StringFormat]::GenericTypographic
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Near
  $sf.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
  $sf.Trimming = [System.Drawing.StringTrimming]::None

  $Gdi.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $halo = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 0, 0, 0))
  $fill = New-Object System.Drawing.SolidBrush $DigitColor
  $haloOffsets = @(
    @([single]1.0, [single]0.0), @([single]-1.0, [single]0.0),
    @([single]0.0, [single]1.0), @([single]0.0, [single]-1.0)
  )

  $n = [Math]::Min(3, $Text.Length)
  $widths = New-Object System.Collections.Generic.List[single]
  for ($i = 0; $i -lt $n; $i++) {
    [void]$widths.Add((Measure-DigitWidth -Gdi $Gdi -Ch $Text.Substring($i, 1) -Font $font))
  }

  $totalW = 0.0
  foreach ($w in $widths) { $totalW += $w }

  $gapCount = [Math]::Max(0, ($n - 1))
  $extraGap = [single]($gapCount * $DigitGap)
  $needW = $totalW + $extraGap

  $kern = 0.0
  if ($gapCount -gt 0 -and $needW -gt $CanvasW) {
    $kern = [Math]::Min($MaxKern, (($needW - $CanvasW) / $gapCount) + 0.4)
  }

  $packedW = $needW - ($kern * $gapCount)
  $x0 = ($CanvasW - $packedW) / 2.0

  $x = $x0
  for ($i = 0; $i -lt $n; $i++) {
    $w = $widths[$i]
    $ch = $Text.Substring($i, 1)
    foreach ($off in $haloOffsets) {
      $cellRect = New-Object System.Drawing.RectangleF(($x + $off[0]), ($TextY + $off[1]), $w, $TextH)
      $Gdi.DrawString($ch, $font, $halo, $cellRect, $sf)
    }
    $cellRect = New-Object System.Drawing.RectangleF($x, $TextY, $w, $TextH)
    $Gdi.DrawString($ch, $font, $fill, $cellRect, $sf)
    if ($i -lt ($n - 1)) { $x += ($w - $kern + $DigitGap) } else { $x += $w }
  }

  $halo.Dispose(); $fill.Dispose(); $font.Dispose()
}

$sizes = @($SizesCsv.Split(',') | ForEach-Object { [int]$_.Trim() } | Where-Object { $_ -gt 0 })
if ($sizes.Count -lt 1) { Write-Output 'FAIL:nosizes'; exit 0 }
if (-not (Test-Path -LiteralPath $ChromeExe)) { Write-Output 'FAIL:noexe'; exit 0 }

$ok = 0
$digitColor = [System.Drawing.Color]::FromArgb(255, $DigitR, $DigitG, $DigitB)
$gapBySize = @{}
if ($DigitGapsCsv) {
  foreach ($pair in ($DigitGapsCsv -split ',')) {
    $kv = $pair.Trim().Split(':')
    if ($kv.Length -ge 2) { $gapBySize[[int]$kv[0]] = [single]$kv[1] }
  }
}

# Extract Chromium icon once at max size, then scale — avoids N× ExtractAssociatedIcon (~slow).
$maxSize = ($sizes | Measure-Object -Maximum).Maximum
$baseBmp = Get-ChromeBitmap -Exe $ChromeExe -Size $maxSize
if (-not $baseBmp) { Write-Output 'FAIL:noicon'; exit 0 }

foreach ($size in $sizes) {
  $png = Join-Path $OutDir ($Prefix + '-' + $size + '.png')
  $srcBmp = $null
  if ($size -eq $baseBmp.Width -and $size -eq $baseBmp.Height) {
    $srcBmp = $baseBmp.Clone()
  } else {
    $srcBmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $sg = [System.Drawing.Graphics]::FromImage($srcBmp)
    $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $sg.DrawImage($baseBmp, 0, 0, $size, $size)
    $sg.Dispose()
  }

  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gdi = [System.Drawing.Graphics]::FromImage($bmp)
  $gdi.CompositingMode = 'SourceCopy'
  $gdi.Clear([System.Drawing.Color]::Transparent)
  $gdi.CompositingMode = 'SourceOver'
  $gdi.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $gdi.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $gdi.DrawImage($srcBmp, 0, 0, $size, $size)
  $srcBmp.Dispose()

  if ($size -le 16) {
    $zoneFrac = 0.42; $fontSize = [single]10.0; $maxKern = [single]4.0; $digitGap = [single]2.52; $bottomPad = [single]0.25
  } elseif ($size -le 20) {
    $zoneFrac = 0.40; $fontSize = [single]12.0; $maxKern = [single]3.5; $digitGap = [single]2.99; $bottomPad = [single]0.35
  } elseif ($size -le 24) {
    $zoneFrac = 0.38; $fontSize = [single]14.0; $maxKern = [single]2.5; $digitGap = [single]3.46; $bottomPad = [single]0.5
  } elseif ($size -le 32) {
    $zoneFrac = 0.36; $fontSize = [single]17.0; $maxKern = [single]1.5; $digitGap = [single]4.39; $bottomPad = [single]0.75
  } elseif ($size -le 48) {
    $zoneFrac = 0.34; $fontSize = [single]22.0; $maxKern = [single]0.0; $digitGap = [single]5.33; $bottomPad = [single]1.0
  } else {
    $zoneFrac = 0.32; $fontSize = [single]([Math]::Round($size * 0.42, 1)); $maxKern = [single]0.0; $digitGap = [single]([Math]::Round($size * 0.112, 1)); $bottomPad = [single]1.25
  }
  if ($gapBySize.ContainsKey($size)) { $digitGap = $gapBySize[$size] }

  $zoneH = [Math]::Max([int]($fontSize + 2), [int]([Math]::Round($size * $zoneFrac)))
  $textY = [single]($size - $bottomPad - $zoneH)
  if ($textY -lt 0) { $textY = 0 }

  $gdi.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  Draw-PackedBoldDigits -Gdi $gdi -Text $Digits -TextY $textY -TextH ([single]$zoneH) -CanvasW ([single]$size) -FontSize $fontSize -MaxKern $maxKern -DigitGap $digitGap -DigitColor $digitColor

  $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
  $gdi.Dispose(); $bmp.Dispose()
  if ((Test-Path -LiteralPath $png) -and ((Get-Item -LiteralPath $png).Length -gt 80)) { $ok++ }
}

$baseBmp.Dispose()
if ($ok -eq $sizes.Count) { Write-Output 'OK:bitmap3' } else { Write-Output ("FAIL:{0}/{1}" -f $ok, $sizes.Count) }
