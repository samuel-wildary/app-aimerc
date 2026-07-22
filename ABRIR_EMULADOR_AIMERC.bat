@echo off
title AiMerc - Android Emulator
set EMULATOR=C:\Users\Samuel Wildary\AppData\Local\Android\Sdk\emulator\emulator.exe
set AVD=Pixel_10_Pro

echo Abrindo Android Emulator %AVD%...
"%EMULATOR%" -avd %AVD%
