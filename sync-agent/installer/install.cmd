@echo off
net session >nul 2>&1
if not %errorlevel%==0 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
  exit /b %errorlevel%
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure.ps1" -Install -SourceDirectory "%~dp0"
