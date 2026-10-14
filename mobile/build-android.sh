#!/bin/bash
# Lensio: build the Android app (Mac). Run from Terminal:  bash build-android.sh
cd "$(dirname "$0")" || exit 1
fail() { echo; echo " ===== Something went wrong. Take a screenshot of this window and send it. ====="; exit 1; }

echo; echo " ===== Lensio: build the Android app ====="; echo
grep -q '"react-native": "0.74.5"' package.json 2>/dev/null || { echo " This is not the Lensio mobile folder. Open Terminal in lensio/mobile."; fail; }
command -v node >/dev/null 2>&1 || { echo " Node.js is not installed. Install the LTS version from nodejs.org, then run this again."; fail; }

echo " [1/4] Installing app packages. This takes 2-5 minutes..."
npm ci --no-audit --no-fund --loglevel=error || fail

echo; echo " [2/4] Getting the Expo build tool..."
EAS="npx --yes eas-cli@16"
$EAS --version || fail

echo; echo " [3/4] Checking your Expo sign-in..."
$EAS whoami >/dev/null 2>&1 || $EAS login || fail

export EAS_NO_VCS=1   # build straight from this folder (no git needed)
echo; echo " [4/4] Starting the build on Expo's servers (10-20 minutes)."
echo "       If asked \"create a project\", answer Y."
echo "       \"Generate a new Android Keystore\": answer Y ONLY on your very first build ever."
echo "       If it asks again later, press Ctrl+C and send a screenshot first."
echo
$EAS init || fail
$EAS build -p android --profile preview || fail

echo; echo " ===== Done. Download the APK from the link above. ====="
echo " Next: publish it (GitHub release or R2), then in admin - Settings - Android app download"
echo " set the APK link, Latest version (same as \"version\" in app.json) and What's new."
