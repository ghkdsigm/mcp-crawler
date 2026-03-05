@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules" (
    echo [오류] node_modules가 없습니다. 먼저 'npm install'을 실행하세요.
    exit /b 1
)

if not exist ".env" (
    echo [오류] .env 파일이 없습니다. Supabase URL/KEY를 설정하세요.
    exit /b 1
)

node index.js
exit /b %ERRORLEVEL%
