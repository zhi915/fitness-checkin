@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"

:menu
cls
echo ============================================
echo   健身打卡 App 版本管理系统
echo ============================================
echo   [1] 查看所有版本
echo   [2] 将当前状态封装为新版本
echo   [3] 回档到指定版本
echo   [4] 强制推送 main（回档后使用）
echo   [5] 推送所有标签到 GitHub
echo   [6] 查看版本详情
echo   [0] 退出
echo ============================================
set /p c=请选择 [0-6]:

if "%c%"=="1" goto list
if "%c%"=="2" goto tag
if "%c%"=="3" goto rollback
if "%c%"=="4" goto force
if "%c%"=="5" goto pushtags
if "%c%"=="6" goto detail
if "%c%"=="0" exit
goto menu

:list
echo.
echo --- 版本标签列表 ---
git tag -l "v*"
echo.
pause
goto menu

:tag
echo.
set /p vn=版本名称（例如 v2）:
set /p vd=版本说明:
git tag -a %vn% -m "%vd%"
git push origin %vn%
if errorlevel 1 (
  echo [X] 推送 %vn% 到 GitHub 失败。标签已存在本地，请检查网络/凭证后重试。
) else (
  echo [OK] 已封装并推送 %vn%。
)
pause
goto menu

:rollback
echo.
set /p rn=回档到版本（例如 v1）:
git tag -a pre-rollback-%date:/=% -m "回档到 %rn% 前的自动备份"
git reset --hard %rn%
if errorlevel 1 (
  echo [X] 回档失败，请确认版本名是否正确（如 v1）。
) else (
  echo [OK] 已回档到 %rn%。已自动创建备份标签 pre-rollback-%date:/=%（防误删）。
  echo 下一步：选择 [4] 强制推送 main，让 GitHub 也回档。
)
pause
goto menu

:force
echo.
git push --force origin main
if errorlevel 1 (
  echo [X] 强制推送失败，请检查网络/凭证后重试 [4]。
) else (
  echo [OK] 强制推送完成，GitHub 的 main 已与回档版本一致。
)
pause
goto menu

:pushtags
echo.
git push origin --tags
if errorlevel 1 (
  echo [X] 推送标签失败，可能是网络或凭证问题。修复后请重试 [5]。
) else (
  echo [OK] 所有标签已推送到 GitHub。
)
pause
goto menu

:detail
echo.
set /p dn=版本名称:
git show %dn%
pause
goto menu
