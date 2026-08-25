@echo off
chcp 65001 >nul
title INKY Voice Cinema
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto NONODE

if not exist "node_modules\" goto INSTALL
goto RUN

:INSTALL
echo.
echo [설치] 필요한 라이브러리를 내려받습니다. 잠시만 기다려 주세요...
echo.
call npm install
echo.

:RUN
node server.js
echo.
echo (서버가 종료되었습니다. 창을 닫으려면 아무 키나 누르세요.)
pause >nul
exit /b

:NONODE
echo.
echo [오류] Node.js가 설치되어 있지 않습니다.
echo        https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
echo.
pause
exit /b
