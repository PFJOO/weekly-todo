@echo off
rem ============================================================
rem  Double-click this file to refresh the cafe new-menu data from this PC.
rem  Use it when Twosome (blocked on GitHub servers) is out of date.
rem   1) pulls the latest files   2) collects new menus from the official sites
rem   3) commits data\menus.json if it changed   4) pushes to GitHub (Vercel redeploys)
rem  Needs: Node.js 18+ and Git (already set up on this PC).
rem ============================================================
cd /d "%~dp0"

echo [1/4] Getting the latest files...
git pull --rebase --autostash origin main || (echo FAILED at step 1 & pause & exit /b 1)

echo.
echo [2/4] Collecting new menus from the official sites...
node scripts\fetch-menus.mjs || (echo FAILED at step 2 & pause & exit /b 1)

echo.
echo [3/4] Saving the changes...
git add data\menus.json
git diff --cached --quiet && (echo No changes - nothing to upload. & pause & exit /b 0)
git commit -m "Update cafe menus (manual, from PC)" || (echo FAILED at step 3 & pause & exit /b 1)

echo.
echo [4/4] Uploading to GitHub (a login window may appear)...
git push origin main || (echo FAILED at step 4 & pause & exit /b 1)

echo.
echo Done! The website updates in about 1-2 minutes.
pause
