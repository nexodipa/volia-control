@echo off
rem Volia Control: guardar la direccion del script de Gmail y su clave como secretos del servidor (no se guardan en ningun archivo).
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Volia Control: configurar alertas por Gmail ===
echo.
echo 1) Pegue la direccion de la aplicacion web del script (termina en /exec) y presione Enter.
call npx.cmd wrangler secret put ALERT_WEBHOOK_URL --name volia-control
echo.
echo 2) Pegue la clave SECRET que definio en el script y presione Enter.
call npx.cmd wrangler secret put ALERT_SECRET --name volia-control
echo.
echo 3) OPCIONAL, recomendado: vigilante externo. Cree una cuenta gratis en healthchecks.io, un chequeo con periodo de 1 dia y margen de 6 horas
echo    (solo lunes a viernes), y pegue aqui su direccion de aviso (https://hc-ping.com/...). Si no la tiene, solo presione Enter.
set "HC="
set /p HC=Direccion de aviso: 
if defined HC (
  echo %HC%| call npx.cmd wrangler secret put HEALTHCHECK_URL --name volia-control
)
echo.
pause
