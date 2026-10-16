@echo off
rem Volia Control: actualizar Mercado SERCOP con el archivo mensual de Contrataciones Abiertas.
rem 1) Descargue el archivo .jsonl.gz del año en curso desde https://data.open-contracting.org/es/publication/110
rem    (queda en Descargas). 2) Doble clic aqui. 3) Al terminar, se publica la app con los datos nuevos.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Volia Control: actualizar Mercado SERCOP ===
echo.
set "ARCHIVO=%~1"
if "%ARCHIVO%"=="" (
  for /f "delims=" %%F in ('dir /b /o-d "%USERPROFILE%\Downloads\*.jsonl.gz" 2^>nul') do if not defined ARCHIVO set "ARCHIVO=%USERPROFILE%\Downloads\%%F"
)
if "%ARCHIVO%"=="" (
  echo No encontre ningun archivo .jsonl.gz en Descargas.
  echo Descarguelo desde https://data.open-contracting.org/es/publication/110 y vuelva a intentar.
  pause
  exit /b 1
)
echo Archivo: %ARCHIVO%
echo Procesando (tarda uno o dos minutos)...
node --experimental-strip-types --no-warnings scripts\build-market.mjs "%ARCHIVO%" > actualizar-mercado-log.txt 2>&1
type actualizar-mercado-log.txt
findstr /c:"Listo:" actualizar-mercado-log.txt >nul
if errorlevel 1 (
  echo.
  echo No se pudo procesar el archivo. El detalle quedo en actualizar-mercado-log.txt
  pause
  exit /b 1
)
echo.
echo Publicando la app con los datos nuevos...
call publicar-cloudflare.cmd
