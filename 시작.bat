@echo off
rem ============================================================
rem  Double-click this file to start the weekly TODO page.
rem  - Starts a local web server on port 5000 (this PC only)
rem  - Opens the page in your default browser
rem  - To stop: close this black window (or press Ctrl+C)
rem  To change the port, edit the number 5000 in the 3 places below.
rem ============================================================
cd /d "%~dp0"

echo Weekly TODO is starting on port 5000 ...
echo Address: http://localhost:5000
echo To stop, close this window.
echo.

rem Open the browser after 2 seconds (gives the server time to start)
start "" /b powershell -NoProfile -Command "Start-Sleep 2; Start-Process 'http://localhost:5000/%%EC%%A3%%BC%%EA%%B0%%84-todo.html'"

python -m http.server 5000 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo [Notice] The server could not start. Port 5000 may already be in use,
  echo or Python is not installed. If the page opened, it is already running.
  pause
)
