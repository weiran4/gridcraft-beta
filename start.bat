@echo off
setlocal
chcp 65001 >nul
set "PYTHONUTF8=1"
cd /d "%~dp0"
title Gridcraft Beta Launcher
echo Gridcraft Beta - one-click launcher
echo.

py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3,9) else 1)" >nul 2>nul
if not errorlevel 1 (
  set "GRIDCRAFT_PY=py -3"
  goto run
)
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,9) else 1)" >nul 2>nul
if not errorlevel 1 (
  set "GRIDCRAFT_PY=python"
  goto run
)
echo ERROR: Python 3.9 or newer was not found.
echo Install Python from https://www.python.org/downloads/windows/
echo Enable "Add Python to PATH", then double-click start.bat again.
echo No Node.js or third-party Python packages are required.
pause
exit /b 1

:run
if not exist "%~dp0scripts\launch.py" (
  echo ERROR: Extract the entire project ZIP before running start.bat.
  pause
  exit /b 1
)
%GRIDCRAFT_PY% "%~dp0scripts\launch.py" %*
set "GRIDCRAFT_EXIT=%ERRORLEVEL%"
if not "%GRIDCRAFT_EXIT%"=="0" (
  echo.
  echo Startup failed. See the error above.
  pause
)
exit /b %GRIDCRAFT_EXIT%
