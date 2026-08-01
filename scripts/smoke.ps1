Write-Host "Running electron-vite build smoke check..."
npx electron-vite build
if ($LASTEXITCODE -eq 0) {
    Write-Host "PASS: electron-vite build succeeded"
} else {
    Write-Host "FAIL: electron-vite build failed"
    exit 1
}
