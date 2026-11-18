@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM 使用 JDK 21（Gradle 8.10 不兼容更新的 JDK）
REM 优先用 D:\jdk-21.0.11（由 D:\jdk21.zip 解压而来）
if exist "D:\jdk-21.0.11" (
    set "JAVA_HOME=D:\jdk-21.0.11"
) else if exist "C:\Program Files\Android\Android Studio\jbr" (
    set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
)

echo.
echo ========================================
echo   Day-Day APK 构建
echo ========================================
echo.

echo [1/3] 同步网页资源到 Android...
call npx cap copy
if %ERRORLEVEL% neq 0 (
    echo ❌ cap copy 失败
    pause & exit /b 1
)
call npx cap sync
if %ERRORLEVEL% neq 0 (
    echo ❌ cap sync 失败
    pause & exit /b 1
)

echo [2/3] 编译 APK...
cd android
call .\gradlew assembleDebug
if %ERRORLEVEL% neq 0 (
    echo ❌ 编译失败
    pause & exit /b 1
)
cd ..

echo [3/3] 完成
echo.
set APK=android\app\build\outputs\apk\debug\Day-Day.apk
for %%A in ("%APK%") do set SIZE=%%~zA
set /a SIZE_MB=%SIZE%/1048576
echo   APK: %cd%\%APK%
echo   大小: %SIZE_MB% MB
echo.
echo ========================================
echo   构建成功！将 APK 传到手机安装即可
echo ========================================

pause
