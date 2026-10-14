# Operations

## Releasing changes

### Backend, admin panel or web app
1. Make the change.
2. If you changed anything in `mobile/`, rebuild the web app: `cd mobile && npm run build:web`. This updates `backend/public/web`.
3. Run the checks: `cd backend && npx tsc --noEmit && npm test`, and `cd mobile && npx tsc --noEmit`.
4. Push to the `main` branch. Render redeploys automatically in about 3–5 minutes. Watch **Render → Events** for **Deploy live**.
5. Check `/health`, and that the version shown in `/v1/config` and the admin header has changed. If you bump the version, the strings are in `app.ts` (`version`) and `public/admin/admin.js` (`v1.x`).

> The project was first maintained by uploading folders through GitHub's web interface. Use **git** from now on (`git add -A && git commit && git push`). It avoids the 100-files-per-upload limit and folder-naming mistakes such as `backend 2`.

### Android app
1. Bump `mobile/app.json → expo.version`, e.g. `1.0.2 → 1.0.3`. `versionCode` increments automatically on EAS.
2. Build it:
   ```bash
   cd mobile
   npm ci
   export EAS_NO_VCS=1
   eas build -p android --profile preview
   ```
3. Download the APK and rename it to `lensio.apk`.
4. In the public repo `lensio-app`, create a new **Release** with tag `v1.0.3` and attach the APK.
5. In admin → **Settings** → **Latest version**, enter `1.0.3`. Customers on older versions then see "Update available".

**Native changes** (new native modules, permissions, app.json plugins) need a new APK. **JavaScript-only changes** also need a new APK today. For instant updates without reinstalling, add **EAS Update** (see the roadmap).

## Environment variables
All of them are listed and explained in `backend/.env.example`. In production they live in **Render → lensio-api → Environment**. Saving changes there restarts the service.

## Logs and monitoring
- **Render → Logs.** Useful searches:
  - `Brevo`: email failures,
  - `Assistant AI failed`: Gemini errors or quota,
  - `Unhandled error`: server bugs,
  - `[SETUP]`: sign-in codes when email isn't configured.
- **Health check:** Render polls `/health`. Add a free uptime monitor, such as UptimeRobot, on `/health` for alerts.
- **Brevo → Transactional → Logs** shows delivery status for every email.

## Backups
- **Neon's free plan keeps a short history window**, a few hours of point-in-time restore. On a paid plan the window is longer.
- **Take regular dumps** as well, e.g. weekly and before any schema change:
  ```bash
  pg_dump "$DATABASE_URL" --no-owner --format=custom -f lensio-$(date +%F).dump
  # restore: pg_restore --no-owner -d "$TARGET_DATABASE_URL" lensio-YYYY-MM-DD.dump
  ```
- **R2 files** (photos, prescriptions) aren't versioned by default. Turn on R2 lifecycle or object versioning if needed, or copy the bucket periodically with `rclone`.

## Rotating secrets
Rotate any key that has been shared in chat, email or screenshots, and whenever someone with access leaves.

| Secret | Where to rotate | Then update in Render |
|---|---|---|
| Database password | Neon → Branches → production → Roles → `neondb_owner` → Reset password | `DATABASE_URL` (remove `&channel_binding=require`) |
| R2 keys | Cloudflare → R2 → Manage API tokens → delete, then create a new one | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| Brevo | Brevo → SMTP & API → API keys | `BREVO_API_KEY` |
| Gemini | aistudio.google.com → API keys | `GEMINI_API_KEY` |
| JWT secret | Generate 48+ random characters | `JWT_SECRET` (signs everyone out) |

> **At handover, rotate the Neon database password, the R2 keys and the Brevo and Gemini keys.** Some of these were shared in chat and screenshots during setup. See [06-TRANSFER-CHECKLIST.md](06-TRANSFER-CHECKLIST.md).

## Scaling notes
- **Render Free sleeps after 15 minutes idle,** so the first request takes about 50 seconds. Use **Starter** or higher for real customers.
- Background jobs run inside the web process. With more than one instance, set `RUN_JOBS=false` on the API instances and run `node dist/jobs/worker.js` as a single worker.
- Settings are cached for 30 seconds per instance.
- The AI assistant loads up to 60 frames into each prompt. For large catalogs, switch to search-based retrieval (see the roadmap).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The web address shows an old page after a deploy | The deploy failed, or the files weren't uploaded | Check **Render → Events**. Confirm `backend/public/web` exists in the repo |
| "Could not send the email" | Brevo is rejecting the request | Render logs → search `Brevo`. A 401 "unrecognised IP" means Brevo → Security → **Authorised IPs** → deactivate blocking. Check `MAIL_FROM` is a verified sender |
| Emails land in Spam | Sending from a free Gmail address | Authenticate your own domain in Brevo (DKIM/DMARC) and use it as `MAIL_FROM` |
| The assistant gives short, generic answers | No `GEMINI_API_KEY`, or quota reached | Add or check the key. Logs show `Assistant AI failed` with the reason |
| Admin sign-in says "not an admin" | The email isn't in `ADMIN_EMAILS` | Add it (comma-separated, no spaces), save, and sign in again |
| Photos don't show in the app | `S3_PUBLIC_URL` is wrong, or the bucket isn't public | Use the bucket's public development URL or custom domain |
| `npm ci` fails with EACCES on macOS | npm cache owned by root, from `sudo npm i -g` | `sudo chown -R $(id -u):$(id -g) ~/.npm`, then `rm -rf node_modules && npm ci` |
| `npm install` fails with ERESOLVE (react-native 0.8x) | `package.json` was upgraded by a tool | Restore `package.json` and `package-lock.json` from git, and use `npm ci`. Don't run `npm audit fix` or `expo install --fix` without planning an SDK upgrade |
| EAS: "Failed to resolve plugin … node modules installed?" | `npm ci` didn't finish | Fix the npm error first, then rebuild |
| EAS asks about an emulator and then errors | Android Studio isn't installed | Answer **n**; the build itself succeeded |
| Windows blocks `.bat` files (Smart App Control) | Unsigned script | Run the same commands manually in Command Prompt |
| APK won't install ("App not installed") | Signed with a different key than the installed app | Uninstall the old app, or build from the same Expo project, so the same keystore is used |
| GitHub web upload: "larger than 25 MiB" | The APK is too big for the repo uploader | Attach it to a GitHub **Release** (up to 2 GB) instead |
