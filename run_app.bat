@echo off
title Launcher Antigravity
echo Limpiando procesos de Node previos...
taskkill /F /IM node.exe /T 2>nul

echo Esperando liberacion de recursos...
timeout /t 3

echo Iniciando Servidor Backend...
start "Antigravity Backend" "%~dp0start_server.bat"

echo Iniciando Cliente Frontend...
start "Antigravity Frontend" "%~dp0start_client.bat"

echo Esperando a que cargue la aplicacion...
echo La primera vez puede tardar un poco.
timeout /t 10

echo Abriendo el navegador...
start http://localhost:5173

echo ¡Listo! La aplicacion se esta ejecutando en las ventanas abiertas.
echo Si ves errores, revisa las otras ventanas negras.
pause
