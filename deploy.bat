@echo off
cd /d "%~dp0"

echo ============================================
echo   Deploy to GitHub Pages (push main)
echo ============================================

set "MSG=%~1"
if "%MSG%"=="" set "MSG=fitness app update"

echo [1/3] Stage all changes...
git add -A

echo [2/3] Commit changes...
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
  echo [OK] committed.
) else (
  echo [SKIP] nothing to commit.
)

echo [3/3] Push main (updates GitHub Pages)...
git push -u origin main
if errorlevel 1 (
  echo [X] push failed. Check network/credential (user zhi915, use Token as password).
  pause
  exit /b 1
)
echo [OK] main pushed. GitHub Pages updates in ~1 minute.

echo.
echo Done. On phone: hard refresh (Ctrl+Shift+R) to clear old Service Worker.
echo Version tagging: run vm.bat option 2 to package / push a release tag.
pause
