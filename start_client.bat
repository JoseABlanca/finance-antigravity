@echo off
title Antigravity Frontend
cd /d "%~dp0client"
echo Iniciando cliente en %cd%...
npm.cmd run dev -- --host
if %errorlevel% neq 0 (
    echo ERROR: El cliente fallo al iniciar.
    pause
)
pause
