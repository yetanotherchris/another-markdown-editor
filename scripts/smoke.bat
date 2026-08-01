echo "Running electron-vite build smoke check..."
npx electron-vite build
if %ERRORLEVEL% equ 0 (
    echo "PASS: electron-vite build succeeded"
) else (
    echo "FAIL: electron-vite build failed"
    exit /b 1
)
