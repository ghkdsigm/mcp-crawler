@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "logs\crawler.log" (
    type "logs\crawler.log"
    echo.
    echo ---- 로그 끝 (logs\crawler.log) ----
) else (
    echo 로그 파일이 없습니다. 아직 크롤러가 실행된 적이 없거나 실행 중입니다.
)
pause
