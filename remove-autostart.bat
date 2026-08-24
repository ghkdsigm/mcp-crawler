@echo off
chcp 65001 >nul

set SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\mcp-crawler.vbs

if not exist "%SHORTCUT%" (
    echo 자동 시작이 등록되어 있지 않습니다.
    pause
    exit /b 0
)

del "%SHORTCUT%"
if %ERRORLEVEL% neq 0 (
    echo [실패] 삭제에 실패했습니다.
    pause
    exit /b 1
)

echo [완료] 자동 시작이 해제되었습니다.
pause
