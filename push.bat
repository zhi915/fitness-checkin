@echo off
cd /d "%~dp0"
git add index.html sw.js manifest.json icon.svg css js .nojekyll
git diff --cached --quiet
if errorlevel 1 git commit -m "fitness app update"
git push -u origin main
echo.
echo Done. If prompt asked for username/password, use zhi915 + your token.
pause
