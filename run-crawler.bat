@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules" (
    echo [오류] node_modules가 없습니다. 먼저 'npm install'을 실행하세요.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [오류] .env 파일이 없습니다. Supabase URL/KEY를 설정하세요.
    pause
    exit /b 1
)

echo [%date% %time%] 크롤러 실행 중...
node index.js
set EXIT_CODE=%ERRORLEVEL%

echo [%date% %time%] 종료 코드: %EXIT_CODE%
REM 작업 스케줄러에서 실행할 때는 아래 pause를 제거하세요. 더블클릭으로 실행 시 결과 확인을 위해 pause 유지
pause
exit /b %EXIT_CODE%
