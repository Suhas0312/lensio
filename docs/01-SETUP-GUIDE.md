# Setup guide, A to Z

This guide takes a new developer from an empty laptop to a running, deployed Lensio. It assumes macOS; Windows and Linux differences are noted where they matter.

---

## A. Tools to install

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 20 LTS or 22 LTS | Runs the backend, the Expo tooling and the web build |
| **Git** | any | Source control (`xcode-select --install` on macOS) |
| **Docker Desktop** | any | Local PostgreSQL (optional; a free Neon database also works) |
| **EAS CLI** | latest | Cloud builds of the Android/iOS apps: `npm i -g eas-cli` |
| **Android phone** or emulator | Android 7+ | Testing the Android app |

If `npm i -g` fails with permission errors on macOS, fix the npm folder once:
```bash
sudo chown -R $(id -u):$(id -g) ~/.npm
```

## B. Accounts

Create these, or take ownership of the existing ones; see [06-TRANSFER-CHECKLIST.md](06-TRANSFER-CHECKLIST.md).

| Account | Needed for | Cost |
|---|---|---|
| GitHub | Source code; public `lensio-app` repo for APK downloads | Free |
| Render | Hosting the API, admin panel and web app | Free; Starter $7/month recommended for launch |
| Neon | PostgreSQL database | Free |
| Cloudflare | R2 storage for photos and prescriptions | Free up to 10 GB |
| Brevo | Sending emails (codes, password resets, order updates) | Free, 300/day |
| Google AI Studio | Gemini API key for the AI assistant | Free tier |
| Expo | Building the Android (and iOS) apps | Free |
| *Optional:* Google Play Console | Play Store listing | $25 one-time |
| *Optional:* Apple Developer | App Store / iOS app | $99/year |
| *Optional:* Razorpay, Shiprocket, Meta WhatsApp Business | Card payments, courier booking, WhatsApp notifications | Per-transaction / per-message |

## C. Get the code

```bash
git clone https://github.com/<owner>/lensio.git
cd lensio
```
Or unzip the handover bundle. The layout is:
```
lensio/
  backend/     API server, admin panel (public/admin), built web app (public/web)
  mobile/      Expo app: Android, iOS and web from one codebase
  docs/        this documentation
```

## D. Run the backend locally

```bash
cd backend
cp .env.example .env            # defaults work for local development
docker compose -f ../docker-compose.yml up -d db   # or put a Neon URL in DATABASE_URL
npm install
npx prisma db push              # creates the tables
npm run seed                    # lens packages, coatings, FIRST10 coupon, sample frames
npm run dev                     # http://localhost:4000
```

Check it's working:
- `http://localhost:4000/health` shows `{"ok":true}`.
- `http://localhost:4000/admin` opens the admin panel. To sign in: put your email in `ADMIN_EMAILS` in `.env`, restart, and choose "Email me a code". Without Brevo configured, the code is **printed in the terminal** in development.

Run the tests:
```bash
npm test              # 59 tests
npx tsc --noEmit      # type check
```

## E. Run the mobile app locally

```bash
cd mobile
npm ci                # exact versions from package-lock.json; do not run `npm audit fix`
```

**Web version** (quickest way to see the app):
```bash
EXPO_PUBLIC_API_URL=http://localhost:4000/v1 npx expo start --web
```

**On an Android phone:** the app uses native modules (camera, speech recognition), so it needs a **development build**, not Expo Go:
```bash
eas login
eas build -p android --profile development   # installs a dev client APK
npx expo start --dev-client
```
In `eas.json`, the `development` profile's `EXPO_PUBLIC_API_URL` must point at a backend the phone can reach, such as your computer's LAN IP or the deployed server.

Type check: `npx tsc --noEmit`. Voice-parser tests: `npx tsx src/lib/voiceQuery.test.ts`.

## F. Deploy the backend (Render + Neon + R2)

**F1. Database (Neon)**
1. Create a project in the region nearest your customers (Singapore for India).
2. Copy the **direct** (non-pooled) connection string, and remove `&channel_binding=require` from its end. This is `DATABASE_URL`.

**F2. Storage (Cloudflare R2)**
1. Create a bucket, e.g. `lensio-media`.
2. Bucket → Settings → **Public Development URL → Enable**, or attach a custom domain. This is `S3_PUBLIC_URL`.
3. R2 → Account Details → API Tokens → **Create Account API token**, with **Object Read & Write** on this bucket only. Note the Access Key ID, Secret Access Key and S3 endpoint.
4. Prescriptions are stored privately and only served through short-lived signed links. Only product photos use the public URL.

**F3. Email (Brevo)**
1. Verify a sender at Senders, Domains & IPs → **Senders**.
2. SMTP & API → **API keys** → generate a key. This is `BREVO_API_KEY`.
3. If sends fail with 401 "unrecognised IP": Security → **Authorised IPs** → deactivate blocking. Render's IPs change.
4. For inbox delivery at scale, authenticate your own domain in Brevo (DKIM/DMARC). Free Gmail senders may land in spam.

**F4. AI (Gemini)**
- aistudio.google.com → **Get API key**. This is `GEMINI_API_KEY`. Free tier; Google may use free-tier prompts to improve its products (see the privacy notes in [02-ARCHITECTURE.md](02-ARCHITECTURE.md)).

**F5. Render web service**
1. New → **Web Service** → connect the GitHub repo.
2. Settings:
   - **Language:** Docker
   - **Root Directory:** `backend`
   - **Region:** Singapore
   - **Health Check Path:** `/health`
   - **Plan:** Free to start, **Starter** for launch, so it doesn't sleep
3. **Environment:** use *Add from .env* with at least:
   ```
   NODE_ENV=production
   DATABASE_URL=...
   JWT_SECRET=<40+ random characters>
   PUBLIC_BASE_URL=https://<your-service>.onrender.com
   ADMIN_EMAILS=owner@example.com
   SUPPORT_WHATSAPP_NUMBER=91XXXXXXXXXX
   SEED_ON_START=true
   STORAGE_DRIVER=s3
   S3_BUCKET=lensio-media
   S3_REGION=auto
   S3_ENDPOINT=...
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_PUBLIC_URL=...
   BREVO_API_KEY=...
   MAIL_FROM=...
   MAIL_FROM_NAME=Lensio
   GEMINI_API_KEY=...
   ```
   Every variable is explained in `backend/.env.example`.
4. Deploy. On start, `start.sh` applies the database schema (`prisma migrate deploy` if `prisma/migrations/` exists, otherwise `prisma db push`), and then the server seeds the defaults.
5. Check `/health`, `/admin`, `/` (web app) and `/download`.

Alternatively, use `render.yaml` as a Blueprint: New → Blueprint → pick the repo.

## G. First-time store setup (admin panel)

See [04-ADMIN-GUIDE.md](04-ADMIN-GUIDE.md) for details. The minimum:
1. Sign in at `/admin` with an email listed in `ADMIN_EMAILS`, using "Email me a code". Set a password when prompted.
2. **Settings:**
   - UPI ID and payee name, and scan the ₹1 test QR,
   - Cash on Delivery on or off,
   - **AI assistant shop information** (returns policy, address, hours).
3. **Frames:** add real frames with photos, and hide the six sample frames.
4. **Lens prices:** adjust the lens package and coating prices.

## H. Build and distribute the Android app

The app talks to the URL set in `mobile/eas.json` (`EXPO_PUBLIC_API_URL`, per profile). Update it if the backend address changes.

```bash
cd mobile
npm ci
export EAS_NO_VCS=1                               # build from the folder without git
eas build -p android --profile preview            # APK for direct download
```
- The first build asks to generate a keystore: answer **Y**. Expo stores it; keep it safe, because every future update must be signed with the same key.
- If asked "Install and run on an emulator?", answer **n** unless Android Studio is installed.

**Distribution without the Play Store:**
1. Download the APK from the build page and rename it to `lensio.apk`.
2. In the **public** repo `lensio-app` → Releases → **New release**, with tag `vX.Y.Z` and the APK attached.
3. Your permanent link is `https://github.com/<owner>/lensio-app/releases/latest/download/lensio.apk`.
4. In admin → **Settings** → Android app download, paste that link and set **Latest version** to the value of `mobile/app.json → expo.version`. Installed apps on an older version show "Update available".

**For the Play Store:** build an AAB with `eas build -p android --profile production`. Before submitting, upgrade the Expo SDK, since SDK 51 targets an Android API level below Google Play's current requirement; see [07-ROADMAP.md](07-ROADMAP.md).

## I. Build the web app

The web app is built from `mobile/` and served by the backend from `backend/public/web`.
```bash
cd mobile
npm run build:web       # expo export (clean cache) + manifest/icons → backend/public/web
```
Commit and deploy the backend. The web app calls the API **on the same address it's opened from** (`/v1`), so it works on any domain without rebuilding.

## J. Custom domain

1. Buy a domain, e.g. `lensio.in`.
2. Render → Settings → **Custom Domains** → add `lensio.in` and `www.lensio.in`.
3. Create the DNS records Render shows: an A record for the apex domain, and a CNAME for `www`.
4. After the certificate is issued, set `PUBLIC_BASE_URL=https://lensio.in`.
5. Optionally, point future app builds at it by updating `EXPO_PUBLIC_API_URL` in `eas.json` and `extra.apiUrl` in `app.json`. Existing app installs keep working on the old onrender.com address.

## K. iPhone

- **Now, free:** the web app works in Safari. Customers tap Share → **Add to Home Screen**, and it then opens like an app.
- **Native iOS app:** needs an Apple Developer account ($99/year). Build with `eas build -p ios --profile production` and submit with `eas submit -p ios`. Apple review needs a demo login; set `REVIEW_EMAIL` and `REVIEW_OTP`.

## L. Optional integrations

| Integration | Turn on by setting | Then |
|---|---|---|
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Webhook: `POST /v1/payments/razorpay/webhook` (events `payment.captured`, `payment.failed`, `order.paid`). Card, net banking and UPI-via-gateway appear at checkout. |
| Shiprocket | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_WEBHOOK_TOKEN` | "Dispatched" books the courier and gets an AWB. Webhook: `POST /v1/shipping/shiprocket/webhook` with header `x-api-key`. Courier scans appear in live tracking. |
| WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Approve the templates `order_update` (4 params) and `prescription_needed` (2 params) in Meta Business Manager. |
| SMS sign-in (MSG91) | `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | Needs Indian DLT registration. The app currently uses email sign-in instead. |
