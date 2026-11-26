@echo off
rem Use UTF-8 so Korean messages from the server are not garbled in this window.
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

rem Node.js 18 or newer is required (older versions cannot read the cafe sites).
node -e "process.exit(+process.versions.node.split('.')[0]<18?1:0)"
if errorlevel 1 (
  echo Your Node.js is too old. Please install Node.js 18 or newer from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if "%PORT%"=="" set PORT=5100

echo Starting the cafe menu site...
echo Closing this black window turns the site off.
echo (If it asks "Terminate batch job (Y/N)?", type Y and press Enter.)
echo.

rem Start the server in the background of this window, wait until it answers, then open the browser.
start "" /b powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; for($i=0;$i -lt 30;$i++){try{Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/api/status' -TimeoutSec 1 | Out-Null; break}catch{Start-Sleep -Milliseconds 500}}; Start-Process 'http://127.0.0.1:%PORT%'"

node local-web\server.mjs

echo.
echo The server stopped. If you see an error above, please tell the person who helps you.
pause
