@echo off
taskkill /F /IM node.exe /T 2>nul
timeout /t 3

:: Run backend and frontend in the same hidden window context (using start /B)
start /B "" cmd /c "%~dp0start_server.bat"
start /B "" cmd /c "%~dp0start_client.bat"

:: Wait for them to load
timeout /t 10

:: Open browser
start http://localhost:5173
