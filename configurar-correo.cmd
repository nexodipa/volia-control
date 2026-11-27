@echo off
rem Volia Control: guardar los buzones de correo (direccion del script y clave de cada uno) como un secreto del servidor.
rem El JSON lo arma PowerShell (ConvertTo-Json) para que las comillas y las barras no se dañen en cmd.
chcp 65001 >nul
cd /d "%~dp0"
setlocal enabledelayedexpansion
echo.
echo === Volia Control: conectar buzones de correo ===
echo Cada buzon usa su propio script de Gmail (docs\correo.md). Aqui se escribe la lista completa de buzones.
echo.
set "N=0"
:otro
set /a N+=1
set "NAME="
set "URL="
set "SEC="
set /p NAME=Nombre del buzon !N! (por ejemplo Josue, sin comillas): 
set /p URL=Direccion del script (termina en /exec): 
set /p SEC=Clave SECRET de ese script: 
set "MAIL_NAME_!N!=!NAME!"
set "MAIL_URL_!N!=!URL!"
set "MAIL_SEC_!N!=!SEC!"
set "MAS="
set /p MAS=Agregar otro buzon? (s/n): 
if /i "!MAS!"=="s" goto otro
set "MAIL_COUNT=!N!"
echo.
echo Guardando en el servidor...
powershell -NoProfile -Command "$n=[int]$env:MAIL_COUNT; $l=@(); foreach($i in 1..$n){ $l += [ordered]@{name=(Get-Item env:MAIL_NAME_$i).Value.Trim(); url=(Get-Item env:MAIL_URL_$i).Value.Trim(); secret=(Get-Item env:MAIL_SEC_$i).Value.Trim()} }; $j=ConvertTo-Json -InputObject $l -Compress; if($n -eq 1){ $j='['+$j+']' }; Write-Host ('JSON valido, '+$n+' buzon(es), largo '+$j.Length); $j | npx.cmd wrangler secret put MAIL_SOURCES --name volia-control"
set "MAIL_SEC_1="
echo.
echo --- Secretos que hay ahora en el servidor (debe aparecer MAIL_SOURCES) ---
call npx.cmd wrangler secret list --name volia-control
echo.
echo Listo. Publique con publicar-cloudflare.cmd y use "Revisar correo ahora" en Correo.
pause
