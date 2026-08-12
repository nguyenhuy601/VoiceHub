@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "NGINX_PREFIX=%CD%"
cd /d "%~dp0..\..\"
set "VH_ROOT=%CD%"

where nginx >nul 2>&1
if errorlevel 1 (
  echo [ERROR] nginx not in PATH
  pause
  exit /b 1
)

echo.
echo === VoiceHub P3 prod-edge (static SPA) ===
echo Stop dev-https nginx if running on :443 first.
echo.

echo [1/2] Build client/dist ...
call bash "%VH_ROOT%\devops\scripts\build-client-static.sh"
if errorlevel 1 (
  echo [FAIL] build-client-static.sh
  pause
  exit /b 1
)

echo.
echo [2/2] Start nginx prod-edge.conf ...
start "VoiceHub Nginx prod-edge" cmd /k cd /d "%NGINX_PREFIX%" ^&^& nginx -p "%NGINX_PREFIX:\=/%" -c prod-edge.conf

echo.
echo Open: https://voicehub.local
echo Verify: curl -skf https://voicehub.local/api/health
pause
endlocal
