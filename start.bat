@echo off
cd /d "%~dp0"
title Derivative Lab
where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py 5180
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    py serve.py 5180
  ) else (
    echo Python was not found. Install it from https://www.python.org/downloads/
    echo and check "Add python.exe to PATH" during setup, then run this again.
    pause
  )
)
