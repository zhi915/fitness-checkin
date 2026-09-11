@echo off
chcp 65001 >nul
cd /d %~dp0

echo [1/2] Building dist ...
node tools\build_dist.js
if errorlevel 1 goto fail

echo [2/2] Deploying to CloudBase static hosting ...
npx --yes @cloudbase/cli hosting deploy dist / -e sports-d6gxbwqzaaabf04d5
if errorlevel 1 goto fail

echo.
echo Done: https://sports-d6gxbwqzaaabf04d5-1485613066.tcloudbaseapp.com
pause
exit /b 0

:fail
echo.
echo Deploy failed.
pause
exit /b 1
