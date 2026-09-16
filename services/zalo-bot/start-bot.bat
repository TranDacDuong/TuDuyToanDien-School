@echo off
chcp 65001 > nul
title Dịch vụ Zalo Bot MindUp (Anti-Ban)

set PATH=C:\Program Files\nodejs;%PATH%

cd /d "%~dp0"

echo =======================================================
echo     HỆ THỐNG ZALO BOT TỰ ĐỘNG NHẮC HỌC PHÍ MINDUP
echo =======================================================
echo.

if not exist "node_modules" (
    echo [1/2] Đang cài đặt thư viện cần thiết lần đầu...
    call npm install --no-fund --no-audit
    echo [1/2] Cài đặt hoàn tất!
    echo.
)

echo [2/2] Đang khởi động dịch vụ Zalo Bot...
echo Địa chỉ nội bộ: http://localhost:3456
echo.
echo * Bạn có thể thu nhỏ cửa sổ này xuống để bot chạy ngầm.
echo * Không tắt cửa sổ này khi đang chạy chiến dịch nhắc học phí.
echo.

node server.js

pause
