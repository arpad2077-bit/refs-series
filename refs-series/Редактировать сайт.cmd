@echo off
chcp 65001 >nul
title Админка "Отсылки" — не закрывайте это окно
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -OpenAdmin
pause
