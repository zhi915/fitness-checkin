@echo off
echo ============================================
echo  Deploy fitness-checkin to GitHub Pages
echo ============================================
echo When asked, enter:
echo   Username: zhi915
echo   Password: your Personal Access Token (NOT login password)
echo   Get token: github.com/settings/tokens  (check "repo")
echo ============================================
cd /d C:\fitnessapp
if errorlevel 1 cd /d "E:\work buddy\健身app"
git add -A
git diff --cached --quiet
if errorlevel 1 git commit -m "fitness app update"
git remote set-url origin https://github.com/zhi915/fitness-checkin.git
git push -u origin main
echo.
echo If push succeeded, enable Pages:
echo   repo Settings - Pages - Source: main / (root)
echo   Site URL: https://zhi915.github.io/fitness-checkin/
pause
