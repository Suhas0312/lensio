# Lensio: deploy everything (Mac)

Server 2.0.6 · Android app 2.0.0. Do the steps in order.

## 1. Server + website (GitHub → Render)

GitHub's website accepts at most 100 files per upload, so upload in 3 parts.
On github.com open your repo → **Add file → Upload files**, then **Commit changes** after each part.

1. In GitHub, open the **backend** folder. Drag in everything from `lensio/backend` **except** the `public` folder.
2. Still inside **backend** in GitHub, drag in the **public** folder.
3. Go to the repo's top level. Drag in `mobile`, `docs`, `.gitignore`, `CHANGELOG.md`, `DEPLOY.md`,
   `README.md`, `START-HERE-MAC.md`, `docker-compose.yml`, `render.yaml`.
   (Finder hides `.gitignore`: press **Cmd + Shift + .** to show hidden files.)

Render deploys by itself. Wait for **Live**, then open
`https://lensio-api.onrender.com/v1/config` → it should show `"version":"2.0.6"`.

## 2. Android app 2.0.0

One time: install Node.js **LTS** from nodejs.org.

Terminal (Cmd + Space → Terminal):

    cd ~/Downloads/lensio/mobile
    bash build-android.sh

- Log in with the same Expo account as before.
- "Create a project?" → **Y**.
- "Generate a new Android Keystore?" → only on the very first build ever. Otherwise press **Ctrl + C** and ask for help.

When it says Done, open the link, download the APK, rename it `lensio-2.0.0.apk`.

## 3. Release the app

1. GitHub → **Releases → Draft a new release** → tag `v2.0.0`, title `Lensio 2.0.0`,
   drag **only** the APK into Assets → tick **Set as the latest release** → **Publish release**.
2. Right-click the APK under Assets → **Copy link address**. Test it in a private browser window
   (a private repo gives 404: then host the APK on Cloudflare R2 instead).
3. Admin panel → **Settings → Android app download**: paste the link, Latest version `2.0.0`,
   What's new, **Save**. Customers get the update window and install over the old app.
4. Share this permanent link everywhere (it always gives the newest version):
   `https://lensio-api.onrender.com/download`

## 4. Keep the app fast (free)

uptimerobot.com → Add New Monitor → HTTP(s) → URL `https://lensio-api.onrender.com/health`
→ every 5 minutes. This stops the free server from sleeping.

## 5. WhatsApp (when the client's Meta Business account is ready)

See `docs/WHATSAPP-SETUP.md`. In Render → Environment add `WHATSAPP_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `OWNER_WHATSAPP_NUMBERS`, `SUPPORT_WHATSAPP_NUMBER`, then Save.

## Every later app version (automatic)

After the one-time setup in `docs/AUTO-RELEASE.md`, just upload your changes to `mobile/`:
GitHub builds and publishes the app, and customers are asked to update. Nothing else to do.

## Every later app version (by hand, if automation is off)

Change `"version"` in `mobile/app.json` (e.g. `2.0.1`) → `bash build-android.sh` → new GitHub
release → update Latest version in admin.
