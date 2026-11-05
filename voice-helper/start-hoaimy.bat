@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python 3 is required. Install it from https://www.python.org/downloads/ and enable Add Python to PATH.
  pause
  exit /b 1
)
py -3 -m pip install -r requirements.txt
if errorlevel 1 (
  echo Could not install voice dependencies. Check your internet connection and Python installation.
  pause
  exit /b 1
)
py -3 voice_server.py
pause
