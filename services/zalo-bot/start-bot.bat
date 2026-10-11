@echo off
setlocal
title MindUp Zalo Bot (Anti-Ban)

set PATH=C:\Program Files\nodejs;%PATH%

cd /d "%~dp0"

echo =======================================================
echo     MINDUP ZALO BOT - TU DONG NHAC HOC PHI
echo =======================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-bot.ps1"
if errorlevel 1 (
    echo Khong dung duoc bot cu an toan. Khong khoi dong them bot moi.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/2] Dang cai dat thu vien can thiet lan dau...
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo Khong cai dat duoc thu vien. Vui long kiem tra mang va Node.js.
        pause
        exit /b 1
    )
    echo [1/2] Cai dat hoan tat.
    echo.
)

echo [2/2] Dang khoi dong Zalo Bot...
echo Dia chi noi bo: http://localhost:3456
echo.
echo * Co the thu nho cua so nay de bot tiep tuc chay.
echo * Khong tat cua so khi dang gui chien dich hoc phi.
echo.

node "%~dp0server.js"

echo.
echo Zalo Bot da dung hoac gap loi. Xem thong bao phia tren de biet chi tiet.
pause
