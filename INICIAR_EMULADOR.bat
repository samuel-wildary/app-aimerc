@echo off
title AiMerc - Android Emulator (Ultra Leve & Rapido)
set EMULATOR=C:\Users\Samuel Wildary\AppData\Local\Android\Sdk\emulator\emulator.exe
set AVD=Pixel_10_Pro

echo ===================================================
echo Iniciando Android Emulator (%AVD%) com Aceleracao de GPU Placa de Video...
echo ===================================================
"%EMULATOR%" -avd %AVD% -gpu host
