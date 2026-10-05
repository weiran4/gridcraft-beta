@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:4189/"
python -m http.server 4189 --bind 127.0.0.1
pause
