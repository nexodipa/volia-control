@echo off
rem Volia Control: publicar en Cloudflare. Doble clic para ejecutar.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Volia Control: publicar en Cloudflare ===
echo.
if not exist ".env.cloudflare" (
  echo Falta el archivo .env.cloudflare. Copie .env.cloudflare.example como .env.cloudflare y complete los correos.
  pause
  exit /b 1
)
call npx.cmd wrangler whoami 2>&1 | findstr /i /c:"not authenticated" >nul
if not errorlevel 1 (
  echo Se abrira el navegador para autorizar a Wrangler en su cuenta de Cloudflare.
  call npx.cmd wrangler login
)
node scripts\deploy-cloudflare.mjs %*
echo.
echo El detalle quedo en deploy-log.txt
pause
