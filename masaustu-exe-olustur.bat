@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SCAR Stunts - Masaustu (.exe) Kurulum ve Derleme
set CSC_IDENTITY_AUTO_DISCOVERY=false

echo [1/2] Bagimliliklar kuruluyor...
call npm ci
if errorlevel 1 (
  echo HATA: npm ci basarisiz oldu.
  pause
  exit /b 1
)

echo [2/2] Web ve tasinabilir Windows paketleri olusturuluyor...
call npm run dist:exe
if errorlevel 1 (
  echo HATA: EXE paketleme sirasinda hata olustu.
  pause
  exit /b 1
)

echo.
echo TAMAMLANDI!
echo Portable EXE dosyasi "release\SCAR Stunts 1.0.0.exe" olarak olusturuldu.
pause
