@echo off
REM ================================
REM Script para generar APK React Native + Capacitor
REM ================================

echo ==== Forzando uso de Java 17 ====
set JAVA_HOME=C:\Program Files\Amazon Corretto\jdk17.0.18_9
set PATH=%JAVA_HOME%\bin;%PATH%

echo ==== Limpiando proyecto Android ====
cd android
gradlew clean

echo ==== Generando APK release ====
gradlew assembleRelease

IF EXIST app\build\outputs\apk\release\app-release.apk (
    echo ==== APK generado correctamente ====
    cd ..
    IF NOT EXIST dist mkdir dist
    copy android\app\build\outputs\apk\release\app-release.apk dist\
    echo ==== APK copiada a dist\app-release.apk ====
) ELSE (
    echo ==== ERROR: APK no se generó. Revisa los errores de compilación ====
)

pause