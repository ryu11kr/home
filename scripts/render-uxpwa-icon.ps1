# UXPWA — 2안 Progressive 3-bar icon (centered; readable at small sizes).
param(
  [string]$OutDir = (Join-Path $PSScriptRoot "..\icons")
)

Add-Type -AssemblyName System.Drawing

function ConvertFrom-HexColor([string]$Hex) {
  $h = $Hex.TrimStart("#")
  if ($h.Length -eq 6) {
    return [System.Drawing.Color]::FromArgb(255, [Convert]::ToInt32($h.Substring(0, 2), 16), [Convert]::ToInt32($h.Substring(2, 2), 16), [Convert]::ToInt32($h.Substring(4, 2), 16))
  }
  throw "Bad color $Hex"
}

function Add-RoundedRectPath {
  param(
    [System.Drawing.Drawing2D.GraphicsPath]$Path,
    [System.Drawing.Rectangle]$R,
    [int]$Radius
  )
  $rad = [Math]::Min($Radius, [Math]::Min($R.Width, $R.Height) / 2)
  $Path.AddArc($R.X, $R.Y, $rad * 2, $rad * 2, 180, 90)
  $Path.AddArc($R.Right - $rad * 2, $R.Y, $rad * 2, $rad * 2, 270, 90)
  $Path.AddArc($R.Right - $rad * 2, $R.Bottom - $rad * 2, $rad * 2, $rad * 2, 0, 90)
  $Path.AddArc($R.X, $R.Bottom - $rad * 2, $rad * 2, $rad * 2, 90, 90)
  $Path.CloseFigure()
}

function Draw-UxpwaProgressiveIcon {
  param(
    [int]$Size,
    [double]$ContentScale = 1.0,
    [switch]$Maskable
  )

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $bg = ConvertFrom-HexColor "#1c2433"
  $white = ConvertFrom-HexColor "#f8fafc"
  $teal = ConvertFrom-HexColor "#2dd4bf"

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $radius = [int]($Size * 96.0 / 512.0)
  Add-RoundedRectPath -Path $path -R (New-Object System.Drawing.Rectangle 0, 0, $Size, $Size) -Radius $radius
  $g.SetClip($path)
  $g.Clear($bg)
  $g.ResetClip()

  $s = $Size / 512.0 * $ContentScale
  if ($Maskable) { $s *= 0.82 }

  $fontUx = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(6, [single](132 * $s)), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontPwa = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(5, [single](120 * $s)), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

  $sfCenter = New-Object System.Drawing.StringFormat
  $sfCenter.Alignment = [System.Drawing.StringAlignment]::Center
  $sfCenter.LineAlignment = [System.Drawing.StringAlignment]::Near

  $uxSize = $g.MeasureString("UX", $fontUx)
  $pwaSize = $g.MeasureString("pwa", $fontPwa)

  $barW = [int](80 * $s)
  $barH = [Math]::Max(2, [int](14 * $s))
  $barGap = [Math]::Max(2, [int](10 * $s))
  $gapUxBar = [int](22 * $s)
  $gapBarPwa = [int](20 * $s)

  $barsTotalW = $barW * 3 + $barGap * 2
  $blockH = $uxSize.Height + $gapUxBar + $barH + $gapBarPwa + $pwaSize.Height
  $blockTop = ($Size - $blockH) / 2.0

  $centerX = $Size / 2.0

  $uxRect = New-Object System.Drawing.RectangleF ($centerX - $uxSize.Width / 2), $blockTop, $uxSize.Width, $uxSize.Height
  $g.DrawString("UX", $fontUx, (New-Object System.Drawing.SolidBrush $white), $uxRect, $sfCenter)

  $barY = $blockTop + $uxSize.Height + $gapUxBar
  $barStartX = $centerX - $barsTotalW / 2.0

  $opacities = @(115, 191, 255)
  for ($i = 0; $i -lt 3; $i++) {
    $x = [int]($barStartX + $i * ($barW + $barGap))
    $c = [System.Drawing.Color]::FromArgb($opacities[$i], $teal.R, $teal.G, $teal.B)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $c), $x, [int]$barY, $barW, $barH)
  }

  $pwaTop = $barY + $barH + $gapBarPwa
  $pwaRect = New-Object System.Drawing.RectangleF ($centerX - $pwaSize.Width / 2), $pwaTop, $pwaSize.Width, $pwaSize.Height
  $g.DrawString("pwa", $fontPwa, (New-Object System.Drawing.SolidBrush $white), $pwaRect, $sfCenter)

  $g.Dispose()
  return $bmp
}

function Save-Icon([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path $path -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$out = [IO.Path]::GetFullPath($OutDir)

$icon192 = Draw-UxpwaProgressiveIcon -Size 192
Save-Icon $icon192 (Join-Path $out "icon-192.png")
$icon192.Dispose()

$icon512 = Draw-UxpwaProgressiveIcon -Size 512
Save-Icon $icon512 (Join-Path $out "icon-512.png")
$icon512.Dispose()

$mask512 = Draw-UxpwaProgressiveIcon -Size 512 -Maskable
Save-Icon $mask512 (Join-Path $out "icon-maskable-512.png")
$mask512.Dispose()

$fav32 = Draw-UxpwaProgressiveIcon -Size 32
Save-Icon $fav32 (Join-Path $out "favicon-32.png")
$fav32.Dispose()

Write-Output "Icons written to $out"
Write-Output "  icon-192.png, icon-512.png, icon-maskable-512.png, favicon-32.png"