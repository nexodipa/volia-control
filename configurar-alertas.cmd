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
pause
