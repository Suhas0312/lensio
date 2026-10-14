@echo off
setlocal
cd /d "%~dp0"
title Lensio - build Android app
echo.
echo  ===== Lensio: build the Android app =====
echo.

rem --- Make sure this is the correct, clean app folder ---
findstr /c:"\"react-native\": \"0.74.5\"" package.json >nul 2>nul
if errorlevel 1 (
  echo  This is not the correct Lensio app folder.
  echo  Extract mobile.zip to C:\lensio-app and run build-android.bat from there.
  goto :fail
)
if not exist package-lock.json (
  echo  package-lock.json is missing. Extract mobile.zip again.
  goto :fail
)

rem --- Tools ---
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed. Install the LTS version from nodejs.org, then run this again.
  goto :fail
)

echo  [1/4] Installing app packages. This takes 2-5 minutes...
call npm ci --no-audit --no-fund --loglevel=error
if errorlevel 1 goto :fail

echo.
echo  [2/4] Getting the Expo build tool...
rem Run the tool through npx: a global install is often not found until Windows is restarted.
set EAS=npx --yes eas-cli@16
call %EAS% --version
if errorlevel 1 goto :fail

echo.
echo  [3/4] Checking your Expo sign-in...
call %EAS% whoami >nul 2>nul
if errorlevel 1 call %EAS% login
if errorlevel 1 goto :fail

rem Build straight from this folder (no git needed)
set EAS_NO_VCS=1

echo.
echo  [4/4] Linking the project and starting the build.
echo        If asked "create a project", answer Y.
echo        "Generate a new Android Keystore": answer Y ONLY on your very first build.
echo        Expo keeps that key for every later build, so updates install over the old app.
echo        If it asks again later, press Ctrl+C and send a screenshot first.
echo.
call %EAS% init
call %EAS% build -p android --profile preview
if errorlevel 1 goto :fail

echo.
echo  ===== Done. Download the APK from the link above. =====
echo  Next: upload it to R2, then in admin - Settings - Android app download set the APK link,
echo  Latest version (same as "version" in app.json) and What's new. Customers get the update window.
pause
exit /b 0

:fail
echo.
echo  ===== Something went wrong. Take a screenshot of this window and send it. =====
pause
exit /b 1
