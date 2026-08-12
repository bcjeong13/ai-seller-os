@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   AI Seller OS - 시작합니다
echo ============================================
echo.
if not exist "node_modules" (
  echo [1/2] 최초 1회 설치 중... 잠시 기다려 주세요.
  call npm install
) else (
  echo [1/2] 설치 확인 완료.
)
echo.
echo [2/2] 앱을 실행합니다. 브라우저가 자동으로 열립니다.
echo 종료하려면 이 창에서 Ctrl+C 를 누르세요.
echo.
call npm run dev
pause
