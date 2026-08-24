@echo off
chcp 65001 >nul
cd /d "%~dp0"

set VBS_SRC=%~dp0start-crawler.vbs
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT=%STARTUP_DIR%\mcp-crawler.vbs

echo ========================================
echo  MCP Crawler - 자동 시작 등록
echo ========================================
echo.
echo 등록 위치: %SHORTCUT%
echo.

copy /Y "%VBS_SRC%" "%SHORTCUT%"
if %ERRORLEVEL% neq 0 (
    echo [실패] 파일 복사에 실패했습니다.
    pause
    exit /b 1
)

echo [완료] 이제 컴퓨터를 켤 때마다 크롤러가 자동으로 실행됩니다.
echo.
echo - 실행 로그 확인: view-logs.bat 더블클릭
echo - 자동 시작 해제: remove-autostart.bat 더블클릭
echo.
pause
