param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$ArtifactsDir = (Join-Path $PSScriptRoot "artifacts")
)

$ErrorActionPreference = 'Stop'

# The three artifacts the Homebrew formula installs (FR-006). Each hash MUST
# match its exact published file (FR-008). A missing artifact throws — the
# workflow must never commit a formula pointing at a failed build (FR-010).
$macArm64File = "Another Markdown Editor-$Version-macos-arm64.zip"
$macX64File = "Another Markdown Editor-$Version-macos-x64.zip"
$linuxX64File = "Another Markdown Editor-$Version-linux-x64.AppImage"

foreach ($f in @($macArm64File, $macX64File, $linuxX64File)) {
    $p = Join-Path $ArtifactsDir $f
    if (-not (Test-Path -LiteralPath $p)) {
        throw "Unable to locate $f at $p"
    }
}

$macArm64Hash = (Get-FileHash -LiteralPath (Join-Path $ArtifactsDir $macArm64File) -Algorithm SHA256).Hash.ToLower()
$macX64Hash = (Get-FileHash -LiteralPath (Join-Path $ArtifactsDir $macX64File) -Algorithm SHA256).Hash.ToLower()
$linuxX64Hash = (Get-FileHash -LiteralPath (Join-Path $ArtifactsDir $linuxX64File) -Algorithm SHA256).Hash.ToLower()

Write-Host "SHA256 ${macArm64File}: $macArm64Hash"
Write-Host "SHA256 ${macX64File}: $macX64Hash"
Write-Host "SHA256 ${linuxX64File}: $linuxX64Hash"

$formulaPath = Join-Path $PSScriptRoot "Formula" "another-markdown-editor.rb"
if (-not (Test-Path -LiteralPath $formulaPath)) {
    throw "Unable to locate Homebrew formula at $formulaPath"
}

$content = Get-Content -LiteralPath $formulaPath -Raw

# Normalize any accidental CRLF so the line-based replacements below are not
# brittle if a Windows editor ever saves the formula as CRLF (release review).
$content = $content -replace "`r", ""

# The release download URL is deterministic: v<version>/<encoded artifact name>
# (spaces are %20 in URLs). Tag and version share the numeric part (FR-003).
$baseUrl = "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v$Version"

$content = $content -replace 'version "[\d\.]+"', "version `"$Version`""

$content = $content -replace 'url "https://github\.com/yetanotherchris/another-markdown-editor/releases/download/v[\d\.]+/Another%20Markdown%20Editor-[\d\.]+-macos-arm64\.zip"', "url `"$baseUrl/Another%20Markdown%20Editor-$Version-macos-arm64.zip`""
$content = $content -replace 'url "https://github\.com/yetanotherchris/another-markdown-editor/releases/download/v[\d\.]+/Another%20Markdown%20Editor-[\d\.]+-macos-x64\.zip"', "url `"$baseUrl/Another%20Markdown%20Editor-$Version-macos-x64.zip`""
$content = $content -replace 'url "https://github\.com/yetanotherchris/another-markdown-editor/releases/download/v[\d\.]+/Another%20Markdown%20Editor-[\d\.]+-linux-x64\.AppImage"', "url `"$baseUrl/Another%20Markdown%20Editor-$Version-linux-x64.AppImage`""

# Update the sha256 that follows each known url line (order matches the formula
# structure in Formula/another-markdown-editor.rb).
$lines = $content -split "`n"
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'macos-arm64\.zip' -and $i + 1 -lt $lines.Length -and $lines[$i + 1] -match 'sha256') {
        $lines[$i + 1] = $lines[$i + 1] -replace 'sha256 "[a-fA-F0-9]+"', "sha256 `"$macArm64Hash`""
    } elseif ($lines[$i] -match 'macos-x64\.zip' -and $i + 1 -lt $lines.Length -and $lines[$i + 1] -match 'sha256') {
        $lines[$i + 1] = $lines[$i + 1] -replace 'sha256 "[a-fA-F0-9]+"', "sha256 `"$macX64Hash`""
    } elseif ($lines[$i] -match 'linux-x64\.AppImage' -and $i + 1 -lt $lines.Length -and $lines[$i + 1] -match 'sha256') {
        $lines[$i + 1] = $lines[$i + 1] -replace 'sha256 "[a-fA-F0-9]+"', "sha256 `"$linuxX64Hash`""
    }
}
$content = $lines -join "`n"

# The Linux bin.install filename embeds the version.
$content = $content -replace 'bin\.install "Another Markdown Editor-[\d\.]+-linux-x64\.AppImage"', "bin.install `"Another Markdown Editor-$Version-linux-x64.AppImage`""

[System.IO.File]::WriteAllText($formulaPath, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Updated $formulaPath to v$Version"
