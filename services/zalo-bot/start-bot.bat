@echo off
setlocal
title MindUp Zalo Bot (Anti-Ban)

set PATH=C:\Program Files\nodejs;%PATH%

cd /d "%~dp0"

echo =======================================================
echo     MINDUP ZALO BOT - TU DONG NHAC HOC PHI
echo =======================================================
echo.

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
echo * Bot se chay nen va ghi log vao thu muc session.
echo * Sau khi khoi dong thanh cong, co the dong cua so nay.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-bot.ps1"
if errorlevel 1 (
    echo Khoi dong that bai. Vui long xem log trong thu muc session.
    pause
    exit /b 1
)

echo.
echo Zalo Bot dang chay nen.
pause
