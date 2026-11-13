$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$version = $manifest.version

& node (Join-Path $root 'scripts\validate.mjs')
if ($LASTEXITCODE -ne 0) {
  throw 'Validation failed. Package was not created.'
}

$runtimeFiles = @(
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'privacy.html',
  'icon16.png',
  'icon32.png',
  'icon48.png',
  'icon128.png'
)

foreach ($file in $runtimeFiles) {
  $fullPath = Join-Path $root $file
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Missing package file: $file"
  }
}

$distDir = Join-Path $root 'dist'
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
$outputPath = Join-Path $distDir "ai-toolbox-extension-v$version.zip"

if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}

Push-Location $root
try {
  Compress-Archive -LiteralPath $runtimeFiles -DestinationPath $outputPath -CompressionLevel Optimal
} finally {
  Pop-Location
}

Write-Host "Created: $outputPath"
