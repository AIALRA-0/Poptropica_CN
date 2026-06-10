@echo off
setlocal
cd /d "%~dp0"

if not exist package.json (
  echo package.json not found.
  pause
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_EXE=%cd%\node_modules\electron\dist\electron.exe"
set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"

if defined NODE_EXE (
  "%NODE_EXE%" tools\cleanup-startup.js >nul 2>nul
)

if not defined NODE_EXE (
  echo Node.js is required.
  pause
  exit /b 1
)

if not defined POPTROPICA_WINDOW_FILL_RATIO set "POPTROPICA_WINDOW_FILL_RATIO=1"

if /I "%~1"=="launcher" (
  if exist "%ELECTRON_EXE%" (
    start "" "%ELECTRON_EXE%" "%cd%\launcher\main.js"
    exit /b 0
  )
  start "" "%NODE_EXE%" tools\launch.js
  exit /b 0
)

if "%~1"=="" (
  start "" "%NODE_EXE%" tools\launch.js --island super-power
  exit /b 0
)

start "" "%NODE_EXE%" tools\launch.js %*

exit /b 0
