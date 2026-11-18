@echo off
rem Volia Control: guardar los buzones de correo (direccion del script y clave de cada uno) como un secreto del servidor.
chcp 65001 >nul
cd /d "%~dp0"
setlocal enabledelayedexpansion
echo.
echo === Volia Control: conectar buzones de correo ===
echo Cada buzon usa su propio script de Gmail (docs\correo.md). Aqui se escribe la lista completa de buzones.
echo.
set "JSON=["
set "N=0"
:otro
set /a N+=1
set "NAME="
set "URL="
set "SEC="
set /p NAME=Nombre del buzon %N% (por ejemplo Josue, sin comillas): 
set /p URL=Direccion del script (termina en /exec): 
set /p SEC=Clave SECRET de ese script: 
if %N% GTR 1 set "JSON=!JSON!,"
set "JSON=!JSON!{\"name\":\"!NAME!\",\"url\":\"!URL!\",\"secret\":\"!SEC!\"}"
set "MAS="
set /p MAS=Agregar otro buzon? (s/n): 
if /i "!MAS!"=="s" goto otro
set "JSON=!JSON!]"
echo.
echo Guardando en el servidor...
echo !JSON!| call npx.cmd wrangler secret put MAIL_SOURCES --name volia-control
echo.
echo Listo. Publique con publicar-cloudflare.cmd y use "Revisar correo ahora" en Correo.
pause
