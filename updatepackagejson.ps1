param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'

# The release version is owned by the tag (FR-003); package.json's `version`
# field is kept in sync so the committed tree always names the released version
# (release review finding: a drift previously failed the build legs).
$packageJsonPath = Join-Path $PSScriptRoot "package.json"
if (-not (Test-Path -LiteralPath $packageJsonPath)) {
    throw "Unable to locate package.json at $packageJsonPath"
}

$pkg = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$pkg.version = $Version

$json = $pkg | ConvertTo-Json -Depth 32
# ConvertTo-Json emits no trailing newline; keep the committed file LF-terminated
# so a release commit never produces a cosmetic last-line diff (release review).
$content = $json + "`n"
[System.IO.File]::WriteAllText($packageJsonPath, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Updated $packageJsonPath to v$Version"
