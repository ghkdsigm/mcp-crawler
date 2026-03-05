@echo off
chcp 65001 >nul
cd /d "%~dp0"

set BAT_PATH=%~dp0run-crawler-scheduled.bat
set TASK_NAME=MCP-Crawler-Daily

echo 작업 스케줄러에 등록합니다.
echo - 작업 이름: %TASK_NAME%
echo - 실행 파일: %BAT_PATH%
echo - 실행 시간: 매일 오전 9시
echo.

schtasks /create /tn "%TASK_NAME%" /tr "\"%BAT_PATH%\"" /sc daily /st 09:00 /f /rl highest
if %ERRORLEVEL% neq 0 (
    echo 등록 실패. 관리자 권한으로 실행해 보세요.
    pause
    exit /b 1
)

echo.
echo 등록 완료. 작업 스케줄러에서 "%TASK_NAME%" 항목을 확인하세요.
echo 실행 시간 변경: 작업 스케줄러 → 해당 작업 더블클릭 → 트리거에서 시간 수정
pause
