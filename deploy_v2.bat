@echo off
cd /d "%~dp0"

echo ============================================
echo   One-click package and push v2
echo ============================================

REM Optional custom description: deploy_v2.bat "your note"
set "DESC=%~1"
if "%DESC%"=="" set "DESC=v2.9.1 calorie calc + home add-exercise + calendar view-only"

echo [1/5] Stage all changes...
git add -A

echo [2/5] Commit changes...
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v2.9.1: %DESC%"
  echo [OK] committed.
) else (
  echo [SKIP] nothing to commit.
)

echo [3/5] Push main (updates GitHub Pages)...
git push -u origin main
if errorlevel 1 (
  echo [X] push main failed. Check network/credential (user zhi915, use Token as password).
  pause
  exit /b 1
)
echo [OK] main pushed.

echo [4/5] Create tag v2...
git tag | findstr /b /e "v2" >nul
if errorlevel 1 (
  git tag -a v2 -m "v2.9.1: %DESC%"
  echo [OK] tag v2 created.
) else (
  echo [SKIP] tag v2 already exists.
)

echo [5/5] Push tag v2 to GitHub...
git push origin v2
if errorlevel 1 (
  echo [X] push tag failed.
  pause
  exit /b 1
)
echo [OK] tag v2 pushed.

echo.
echo ============================================
echo   DONE. v2 packaged and pushed to GitHub.
echo   On phone: hard refresh (Ctrl+Shift+R) to clear old Service Worker.
echo ============================================
pause
