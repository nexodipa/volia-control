@echo off
rem Volia: publicar el Atlas de osteosintesis (enlace aparte). Doble clic para ejecutar.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Atlas de osteosintesis: publicar en Cloudflare ===
echo.
call npx.cmd wrangler whoami 2>&1 | findstr /i /c:"not authenticated" >nul
if not errorlevel 1 (
  echo Se abrira el navegador para autorizar a Wrangler en su cuenta de Cloudflare.
  call npx.cmd wrangler login
)
echo Preparando dependencias...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 (
  echo No se pudieron instalar las dependencias. Revise la conexion a internet y vuelva a intentarlo.
  pause
  exit /b 1
)
node scripts\build-atlas.mjs
if errorlevel 1 (
  echo La compilacion fallo. Revise el mensaje de arriba.
  pause
  exit /b 1
)
call npx.cmd wrangler deploy -c wrangler.atlas.jsonc
echo.
echo Si todo salio bien, arriba aparece el enlace del Atlas (termina en workers.dev).
pause
