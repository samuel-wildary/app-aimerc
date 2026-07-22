@echo off
title AiMerc - Android Emulator
set EMULATOR=C:\Users\Samuel Wildary\AppData\Local\Android\Sdk\emulator\emulator.exe
set AVD=Pixel_10_Pro

echo ===================================================
echo Iniciando Android Emulator (%AVD%)...
echo ===================================================
"%EMULATOR%" -avd %AVD%
