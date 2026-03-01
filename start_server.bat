@echo off
title Antigravity Backend
cd /d "%~dp0server"
echo Iniciando servidor en %cd%...
npm.cmd run dev
if %errorlevel% neq 0 (
    echo ERROR: El servidor fallo al iniciar.
    pause
)
pause
