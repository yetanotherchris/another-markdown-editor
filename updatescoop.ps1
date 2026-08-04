param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$ArtifactsDir = (Join-Path $PSScriptRoot "artifacts")
)

$ErrorActionPreference = 'Stop'

# The Windows portable zip published by the release workflow (electron-builder
# win/zip target). Scoop installs this archive via bin; the manifest's hash MUST
# match this exact file (FR-008). Asset names use the short `ameditor` prefix
# (spec 009).
$fileName = "ameditor-$Version-windows-x64.zip"
$zipPath = Join-Path $ArtifactsDir $fileName

if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Unable to locate $fileName at $zipPath"
}

$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLower()
Write-Host "SHA256 of ${fileName}: $hash"

# The release download URL is deterministic: v<version>/<artifact name>. The
# tag is the exact release tag (FR-003/FR-008). The `ameditor` prefix has no
# spaces, so no URL encoding is needed (spec 009).
$url = "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v$Version/ameditor-$Version-windows-x64.zip"
$manifestPath = Join-Path $PSScriptRoot "another-markdown-editor.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Unable to locate Scoop manifest at $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifest.version = $Version
$manifest.architecture."64bit".url = $url
$manifest.architecture."64bit".hash = $hash

$json = $manifest | ConvertTo-Json -Depth 10
# ConvertTo-Json emits no trailing newline; keep the committed file LF-terminated
# so a release commit never produces a cosmetic last-line diff (release review).
$content = $json + "`n"
[System.IO.File]::WriteAllText($manifestPath, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Updated $manifestPath to v$Version"
