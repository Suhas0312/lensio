# Known limitations and roadmap

Ordered by priority for a public launch.

## Must do before launching widely
1. **Upgrade the Expo SDK (currently 51).** Google Play requires apps to target a recent Android API level, and SDK 51 targets one that new Play Store submissions no longer accept. Upgrade one major version at a time (51 → 52 → …) with `npx expo install expo@^NN && npx expo install --fix`. Then retest:
   - camera try-on (`expo-camera`),
   - speech recognition (`expo-speech-recognition`: use the version matching the new SDK),
   - gesture handling and animations (Reanimated),
   - the web build.
2. **Rotate all secrets** and complete [06-TRANSFER-CHECKLIST.md](06-TRANSFER-CHECKLIST.md).
3. **Move Render to the Starter plan or higher**, so the server doesn't sleep.
4. **Publish a privacy policy and terms,** covering prescriptions (health data) and AI processing. Link them in the app (Account tab) and on `/download`. Add a `/privacy` page to `modules/site`.
5. **Switch the database to migrations:** create a baseline (`prisma migrate dev --name baseline`) and commit `prisma/migrations/`.
6. **Use your own domain,** and authenticate it in Brevo so emails reach inboxes.

## High value
- **EAS Update:** push JavaScript fixes to installed apps without a new APK.
- **Push notifications** (`expo-notifications`) for order updates, alongside email and WhatsApp.
- **Returns and exchanges** workflow: return request, pickup and refund status.
- **GST invoices** (PDF) emailed on dispatch.
- **Razorpay go-live** (cards, net banking and automatic UPI confirmation), once KYC is approved. The code is already in place.
- **Shiprocket go-live:** automatic courier booking and live scans. The code is already in place.
- **WhatsApp Cloud API templates** for order updates. The code is already in place.
- **Reviews and ratings:** the database has `rating` and `ratingCount`, but no review screens yet.

## Product improvements
- **Face-tracked AR try-on:** today customers position the frame by hand. For automatic tracking, integrate DeepAR or Banuba, or MediaPipe for web; the web preview prototype used face-api.js landmarks.
- **Better assistant retrieval for big catalogs:** it currently sends up to 60 frames per question. For hundreds of frames, pre-filter with the existing voice-query parser or a text search, and add response streaming.
- **Multiple WhatsApp numbers** (e.g. sales versus order support), and moving the number into admin Settings.
- **Staff roles:** `OPTICIAN` already exists. Give it a trimmed admin view limited to prescriptions and order stages.
- **Stock alerts** by email when a variant falls below a threshold.
- **Analytics:** conversion funnel, popular frames, and abandoned carts.
- **Native iOS app** (Apple Developer account, $99/year). The same code builds with `eas build -p ios`.

## Technical debt and notes
- The admin panel is plain JavaScript (`backend/public/admin/admin.js`, about 530 lines). If it grows, move it to React or TypeScript, reusing the mobile UI tokens.
- End-to-end tests: there are unit tests for pricing-critical and safety-critical logic, but no automated UI tests. Consider Playwright for the web app and admin panel, and Maestro for Android.
- `expo-speech-recognition` on Android relies on Google's speech service being on the device. The app shows a friendly message if it isn't available.
- Manual UPI confirmation depends on staff checking UTRs. At higher volume, use Razorpay, or a UPI provider with payment webhooks.
- `db push` in `start.sh` never applies destructive changes, and fails safely instead. Migrations remove that guesswork.
