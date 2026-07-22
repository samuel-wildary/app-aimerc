@echo off
title AiMerc - Android Emulator (Ultra Leve & Rapido)
set EMULATOR=C:\Users\Samuel Wildary\AppData\Local\Android\Sdk\emulator\emulator.exe
set AVD=Pixel_10_Pro

echo Abrindo Android Emulator %AVD% com aceleracao de GPU...
"%EMULATOR%" -avd %AVD% -gpu host
