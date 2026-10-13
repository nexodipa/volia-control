@echo off
rem Volia Control: guardar o cambiar la clave de Google Gemini como secreto del servidor (no se guarda en ningun archivo).
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Volia Control: configurar IA (Google Gemini) ===
echo.
echo Pegue su clave de API de Google Gemini cuando se la pidan y presione Enter.
echo La clave queda solo en Cloudflare como secreto del worker volia-control.
echo.
call npx.cmd wrangler secret put GEMINI_API_KEY --name volia-control
echo.
pause
