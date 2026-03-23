@echo off
title Build completo - StorePulse

echo =================================
echo 🚀 Iniciando Backend
echo =================================
REM Inicia backend en segundo plano (puedes ajustar el puerto si quieres)
start "" cmd /k "node server.js"

REM Espera unos segundos para que el backend inicie
timeout /t 3 /nobreak >nul

echo =================================
echo 🔄 Sincronizando Capacitor
echo =================================
npx cap sync android

echo =================================
echo 📦 Generando APK de Debug
echo =================================
cd android
gradlew.bat assembleDebug
cd ..

echo =================================
echo ✅ BUILD COMPLETO
echo APK generado en: android\app\build\outputs\apk\debug\app-debug.apk
pause