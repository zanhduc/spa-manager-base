@echo off
setlocal
cd /d "%~dp0"

echo [INFO] Removing bridge service...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-bridge.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Uninstall failed with code %EXIT_CODE%.
)

echo.
pause
exit /b %EXIT_CODE%
