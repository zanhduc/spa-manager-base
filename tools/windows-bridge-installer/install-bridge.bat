@echo off
setlocal
cd /d "%~dp0"

echo [INFO] Running bridge installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-bridge.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Installer failed with code %EXIT_CODE%.
)

echo.
pause
exit /b %EXIT_CODE%
