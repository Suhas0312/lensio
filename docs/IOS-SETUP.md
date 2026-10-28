# Lensio iPhone app: one-time setup

The iPhone build is ready in the project. It only needs an Apple account to run.
Until then, iPhone customers use the website: Safari → Share → Add to Home Screen.

## What you need

- **Apple Developer Program** membership: ₹8,700 per year (US$99). Individual is fine.
  Easiest from India: install the **Apple Developer** app on an iPhone → Account → Enroll.
- Your Mac (for step 3, only once).
- The Expo account you already use for Android (suhasm2k03).

## Steps

1. **Enroll.** Apple Developer app → Enroll as an individual. Approval usually takes 1-2 days.
2. **Create the app in App Store Connect** (appstoreconnect.apple.com → Apps → + → New App):
   - Platform: iOS · Name: Lensio · Language: English (India)
   - Bundle ID: choose **in.lensio.app** (register it under Certificates, Identifiers & Profiles → Identifiers first if it isn't in the list)
   - SKU: lensio
   - After creating it, open **App Information** and copy the **Apple ID** number (10 digits). This is the `ascAppId`.
3. **First build from your Mac (only once, it makes Apple's certificates):**

       cd ~/Downloads/lensio/mobile
       npm install
       npx eas-cli@16 build -p ios --profile production

   - Log in with your Expo account, then with your Apple ID when asked.
   - Answer **Y** to "Generate a new Apple Distribution Certificate?" and "Generate a new Provisioning Profile?".
   - When it asks about push notifications, choose **Y**.
4. **Let Expo upload to Apple:**

       npx eas-cli@16 credentials -p ios

   Choose *production* → *App Store Connect: Manage your API Key* → *Set up a new API Key*. Expo makes and stores it.
5. **Fill in two values** in `mobile/eas.json` under `submit → production → ios`:
   - `appleId`: the email of your Apple ID
   - `ascAppId`: the 10-digit number from step 2
   Upload the changed `eas.json` to GitHub.

## Every new iPhone version after that: automatic

Every upload that changes the app (the `mobile` folder) now builds the iPhone app on Expo and sends it to
App Store Connect → **TestFlight** by itself (30-60 minutes), at the same time as the Android app.
TestFlight testers get it automatically. For the public App Store, open App Store Connect, pick the new build and click
**Add for Review** (Apple's review usually takes 1-3 days). After approval, iPhones update by themselves.

For the App Store listing Apple also asks for: screenshots (6.7" and 6.5" iPhone), a privacy policy link,
a support link, and a demo login for the reviewer (a test customer account).
