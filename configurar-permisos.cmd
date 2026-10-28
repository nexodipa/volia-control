@echo off
rem Volia Control: definir quienes son de solo consulta (ven todo, no pueden cambiar nada). Quien no este en la lista puede editar.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Volia Control: cuentas de solo consulta ===
echo.
echo Escriba los correos de solo consulta separados por coma, por ejemplo: ana@gmail.com,pedro@gmail.com
echo (para quitar a todos, pegue un guion -)
set "LISTA="
set /p LISTA=Correos: 
if not defined LISTA (
  echo No escribio nada. No se cambio la configuracion.
  pause
  exit /b 0
)
if "%LISTA%"=="-" (
  call npx.cmd wrangler secret delete VOLIA_VIEWER_EMAILS --name volia-control
) else (
  echo %LISTA%| call npx.cmd wrangler secret put VOLIA_VIEWER_EMAILS --name volia-control
)
echo.
echo Listo. Vuelva a publicar con publicar-cloudflare.cmd para que el cambio se aplique.
pause
