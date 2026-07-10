@echo off
set EMULATOR=C:\Users\Samuel Wildary\AppData\Local\Android\Sdk\emulator\emulator.exe
set AVD=Pixel_10_Pro
set SCALE=0.55

echo Abrindo Android Emulator %AVD% em escala %SCALE%...
"%EMULATOR%" -avd %AVD% -scale %SCALE%
