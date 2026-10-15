# Changelog

Server versions are shown in `/v1/config` and the admin header. App versions are in `mobile/app.json`.

## Server 2.0.11
- **Automatic app releases:** Lensio reads the newest GitHub release (tag like v2.0.2, .apk attached, not a pre-release) of the repo in the APK link (or Admin → Settings → GitHub repo). Within 5 minutes the download page, `/download/lensio.apk` and the customers' update window switch to it, with the release notes as “What's new”. No admin step. Admin settings show “Automatic ✓ v2.0.1” or what to fix; manual fields remain as fallback. Optional `GITHUB_TOKEN` env raises GitHub's rate limit.

## Server 3.0.1 · Ask Lensio
- **Fixed “Check the highlighted fields”:** after a long answer, every next question was rejected (the app sends the whole chat back and long replies were over the limit). Long history is now trimmed instead. Tested through the real route.
- **Built-in knowledge base** (works without an AI key): short, specific answers for cost, lenses for a given power (e.g. −3.5 → Thin 1.60), progressive/bifocal/zero power/blue cut/photochromic/coatings, SPH/CYL/PD, frame size and AI face scan, face shapes, try-on, delivery, UPI payment (COD not available), orders, cancel, returns (WhatsApp), offers, rewards, eye test, eye-care basics, cleaning, contact lenses, sign-in, app download/update, wishlist/compare, stores. Frame finder: “black round frames under 2000 for women”.
- AI mode (Gemini) instructed to answer every Lensio and eyewear question briefly, no long lists; COD removed from its payment info.

## 3.0.0 · Server + Android app + website
- **AI face scan & style advisor (try-on):** one voice-guided 3D scan gives face shape (from 478 face points), face width, PD and frame size, the best and “go easy on” frame shapes with reasons, and recommended frames that suit and fit (tap to try on).
- **New look:** glass-style cards everywhere, animated AI-face-scan banner and feature tiles on Home, sliding screen transitions, press feedback on frame cards.
- **Checked every screen** on phone and desktop browsers; fixed: checkout, lens choice and order pages now show a clear message when signed out or the link is wrong (were blank or erroring).
- Includes everything from 2.0.12–2.0.15: wishlist, compare 3 frames, instant/offline browsing, comparison photos, gallery upload, exact size from glasses, COD removed, website shows the newest version, releases read without the GitHub API limit.

## Server 2.0.15 · Phase 1: wishlist, compare, instant + offline
- **♥ Wishlist** on every frame card and product page, and **My wishlist** in Account (saved on the account, works on app and website).
- **Compare up to 3 frames** side by side (⇄ on cards and product page, floating Compare bar): price, savings, rating, size, frame width, lens-bridge-arm, shape, material, weight, type, colours. Differences in bold, best value marked ✓.
- **Instant loading + offline browsing:** shop, home lists, product pages and wishlist show the copy saved on the device straight away, then refresh. Without internet, saved frames stay browsable with a “You're offline” banner.
- Frame cards: big-discount badge and rating. Wishlist API now includes colours.

## Server 2.0.14 · App 2.0.4 (automatic)
- **AI face alignment with voice guidance:** while measuring, a 3D face scan (468 points, head pose from depth) guides the customer on screen (oval, arrows, scan line, progress ring) and aloud: come closer / move back / turn left or right / raise or lower chin / keep level / into the circle / hold still / “Done, your size is …”. Measures only when straight, level and close. Voice can be switched off.
- **Compare 4 frames:** after Capture, one image of the photo wearing the current frame and the next three, labelled with name and price; save or share it.
- **Upload photo (gallery / files):** the Android app opens its own picker (Gallery or Files); browsers offer Photos/Files/Camera; computers can drag a photo onto the picture.
- **Cash on Delivery removed:** UPI / online payment only; switched off on the server for every app version; admin shows payments note. Past COD orders can still be completed.
- **Website version label** shows the newest released version (same as /download); the Android app shows its installed version.

## Server 2.0.14
- **Website shows the newest version** (same as /download) instead of the version baked in when the website was built.
- **Cash on Delivery removed** everywhere customers see it; UPI / online only. Old COD orders can still be completed in admin.
- **Capture shows several frames:** the photo opens as a 2×2 comparison of the frames you tried (one tap for a single frame).
- Upload button: “Upload photo (gallery / files)”.

## Server 2.0.13
- **Download page and in-app updates now always follow the newest release.** The server asked GitHub's API, which allows only 60 requests an hour per address; Render's shared addresses used that up, so the page fell back to the admin version (2.0.2 while 2.0.3 was out). Releases are now read from GitHub's public pages (no limit), checked every 3 minutes. Verified live: v2.0.3.

## Server 2.0.12 · App 2.0.3 (automatic)
- **Try-on capture:** after Capture: Save to gallery (Android app saves straight into Gallery/Photos, Lensio album), Share, and “Use this photo for size & frames” (fits frames to the photo and measures it).
- **Photo from gallery:** the upload button no longer forces the camera, so phones offer Gallery/Photos.
- **More accurate size:** iris measured horizontally only (eyelids made sizes too big), 40 readings with outliers removed, stricter head-straight checks, retry when the reading wobbles; shown as ±2 mm. **Exact option:** enter the numbers from your current glasses (e.g. 52□18) and optional PD.
- **Account name:** the name now appears right after sign-in (the page read it before sign-in finished, so it looked empty and asked again); clear Save button.
- **Releases need no admin step:** the server reads the release robot's repo (Suhas0312/lensio) by default.

## Automatic Android releases
- `.github/workflows/android-release.yml`: every upload that changes `mobile/` picks the next version, builds the APK on Expo and publishes a GitHub release. The server already reads the newest release, so /download and the in-app update window follow automatically. One-time setup: docs/AUTO-RELEASE.md.

## Server 2.0.11 · App 2.0.2
- **“That code is incorrect” fixed:** when two codes were sent (resend or double tap), only the newest worked, so customers typing the first email's code were rejected. Any unused code from the last 10 minutes now works; guessing is still limited to 5 tries. Applies to email and WhatsApp/SMS codes. Tested.
- **New people are sent to Create account:** signing in (password or email code) with an email that has no account now says so and switches to Create account with the email filled in, so every account has a name and mobile number. Accounts are no longer created silently without a name.

## Server 2.0.10
- **Web app now opens in Safari (iPhone, iPad, Mac):** the voice-search library crashed on load because Safari lacks `webkitSpeechGrammarList`; the startup script now provides it. Reproduced and verified.

## Server 2.0.9 · App 2.0.1
- **Payment safety:** an order waiting for payment can no longer be started by any button, staff account or old app until the payment is confirmed (UPI checked by the shop, or online payment captured). Tested.
- **Cash on delivery** needs a verified mobile number once WhatsApp/SMS codes are switched on, so fake COD orders with made-up numbers are blocked; checkout offers “Verify now” or UPI.
- **Web app on every device:** compatibility for older iPhones (before iOS 15.4) and older browsers; if the web app still can't start on a device, it shows a helpful message with error details instead of a blank page. Tested as Windows, Mac, iPhone and Android.

## Server 2.0.8 · App 2.0.0
- **Permanent download link:** `/download/lensio.apk` always downloads the newest APK set in admin (also `/download/latest`). The download page shows the version, What's new, and that installing updates the existing app. Admin settings show both links to share.
- **Web app → Account:** “Get the Lensio Android app” (direct download on Android browsers; download page with QR code on computers; hidden on iPhone).
- **Android app → Account:** “Check for updates” with the installed version; opens the update window when a newer version exists.

## Server 2.0.7
- **Live size measurement in try-on:** “📏 Measure my size” measures face width and PD in millimetres from the live camera (scale from the iris, ~11.7 mm in adults; MediaPipe Face Mesh, self-hosted, runs on the phone, nothing uploaded). Recommends Small / Medium / Wide, filters frames to that size, notes how each frame fits, and opens the product page with that size selected. Customers can change the size with chips. Result is remembered on the device.
- Glasses in try-on are now true-to-size using the measured PD.
- Try-on: glasses no longer appear large in the middle of the screen before the face is found; status text fixed.
- The try-on page alone allows WebAssembly eval (needed by MediaPipe); all other pages keep the strict policy.

## Server 2.0.6 · App 2.0.0
- **Customer mobile number is mandatory:** asked at sign-up and shown in Account; verified with a WhatsApp code (SMS backup) when WhatsApp/SMS is set up. Older accounts without a number get it from their delivery address at checkout.
- **Addresses (like Lenskart / Specsmakers):** required fields marked *, PIN code fills city and state, optional alternate mobile number, landmark, edit and delete, default address. Deleting an address used by an order now works (it was silently ignored); past orders keep their delivery details.
- **Delivery agent hand-off (admin order page):** one-tap Call and WhatsApp for the mobile and alternate numbers, “✓ verified” badge, cash to collect for COD, **Send to delivery agent** (name, numbers, address, Google Maps link, cash to collect) and Copy details. Optionally messages the customer “Out for delivery” on WhatsApp.
- Courier bookings (Shiprocket) now include the landmark and alternate number. Admin order list shows the customer's mobile number.
- Checkout: clear “Add delivery address to continue” when no address is saved; Edit link on each address; errors loading the total are shown instead of failing silently.
- **WhatsApp without the Business API:** until Meta WhatsApp is connected, the admin order page offers one-tap updates sent from the shop's own WhatsApp: “Send update to customer” (prefilled with the current step), a prompt after each step change, and the out-for-delivery message.
- Web app rebuilt with all of the above.

## Server 2.0.5 · App 1.0.6
- **In-app updates (Android):** when a newer APK is published, the app shows an update window on launch with “What's new”, downloads the APK inside the app and opens Android's installer, which updates the existing app in place. Customers stay signed in and keep orders and cart; no uninstall. “Later” hides it for a day (the Home banner stays).
- **Admin → Settings → Android app download:** new “What's new” and optional “Minimum version” (apps older than this can't skip the update).
- Builds now get a new Android version code automatically (`autoIncrement` in the preview profile), and the build script warns before creating a new signing key, which would block in-place updates.
- App 1.0.6 adds the install-updates permission. This is the last APK customers install from the download page; later versions arrive through the update window.

## Server 2.0.4
- **Shop pictures:** frames whose photo is a text placeholder now show a drawn picture of the frame (shape, material and first colour) in the shop, product page, cart, orders, wishlist and admin. Real photos are untouched. Drawn by the server (`/v1/catalog/products/:id/frame.png`), so the Android app needs no rebuild.
- **Try-on no longer keeps changing:** face shape is decided once from ~2 s of video, then the frame list stays in place; glasses stay put through short detection misses instead of jumping to the middle; jitter is smoothed.
- Try-on thumbnails never show posters or hand-held photos; such frames use the drawn picture.

## Server 2.0.3
- **Try-on fixed (Lenskart-style):** frames without a real front-view photo no longer show their name as text on the face. The try-on now draws realistic glasses from each frame's shape, material, measurements and colour, with colour swatches to switch between the frame's colours. Real try-on PNGs and clean front-view photos are still used when available.
- Try-on loads every active frame (not just the first 50), and the frame strip shows proper glasses thumbnails.

## Server 2.0.2
- **Faster loading:** the server now gzip-compresses responses. The web app download drops from 2.2 MB to about 0.57 MB.

## Server 2.0.1
- **Admin:** Cash on Delivery orders now show a "Cash received from courier" button once delivered, so COD payments no longer stay "pending" forever.
- Server version in `/v1/config` and the admin header now matches this changelog (it still said 1.9).

## Server 2.0 · App 1.0.5
- **Full-screen web app:** no width cap. Big monitors show up to 8 frames per row, with roomier margins.
- **Instagram import (official Instagram API):**
  - admin → Frames → 📸 **Import from Instagram** lists your posts,
  - the caption is read into name, price, MRP, shape, sunglasses and men/women/kids,
  - you tick posts to create frames, and their photos are copied to your own storage,
  - already-imported posts are marked, and the token renews itself weekly.
  - **Quick add** can also fill a row from a pasted caption.
- **Frames link to their Instagram post** ("View on Instagram" on the product page).
- **Review requests:** an automatic email 2 days after delivery ("How are your new glasses? Rate them"), sent once per order and skipped if already reviewed. Plus a "Rate your purchase" banner on Home, and a thank-you screen after reviewing.
- **Follow us on Instagram** prompts on Home, Account, order pages and the review thank-you screen, and in every order email footer.

## Server 1.9 · App 1.0.4
- **Reviews:** customers review frames after delivery (stars, text, up to 4 photos, verified-buyer badge). Product pages show the average, a 5→1 breakdown and reviews. Admin → **Reviews** approves or hides them; publishing straight away is optional.
- **Lensio Rewards (loyalty points):** points are earned on delivery (default 5 per ₹100) and redeemed at checkout (1 point = ₹1, up to 20% of an order). They're reversed on cancellation, with full history in the app, and rates are set in Settings. Admin can add or remove points.
- **Gift cards:** admin issues `LENS-XXXX-XXXX` codes; customers apply them at checkout, and any balance left stays on the card, which is refunded on cancellation. There's a balance check in the app. Orders fully covered by points or a gift card are placed straight away.
- **Store locator:** admin → **Stores**; the app shows the nearest store first, with directions and a call button.
- **Home eye test booking:** customers pick a day and time slot. The owner gets an email and manages visits in admin → **Eye tests** (call, schedule, complete).
- **Mobile number sign-in** (SMS code) alongside email; the option appears once MSG91 is configured.

## Server 1.7 · App 1.0.3
- **AI try-on** (`/try-on`, used by the Try on tab in the web and Android apps):
  - self-hosted face detection that places the frame on the eyes automatically and follows the face live,
  - face-shape detection with "Suits you" suggestions,
  - a 📸 Capture button that saves or shares the photo,
  - **no transparent PNG needed**: the main product photo's white background is removed in the browser.
- **Prescriptions:** ADD is always available, a **near-vision (N.V.)** row works out ADD automatically, the list refreshes after saving, sign-in is prompted first, and saving offers frame suggestions for the prescription.
- **Catalog:** Shop shows All (eyeglasses + sunglasses) by default, Home has **New arrivals**, and Home reloads when opened, so admin changes appear straight away.
- **Admin:** ⚡ **Quick add from photos** (many frames at once), an **Instagram link** in Settings (shown in the app, on the download page and to the assistant), and a try-on preview link on each frame.

## Server 1.6 · App 1.0.2
- **AI assistant ("Ask Lensio")**, grounded in the catalog, lens prices, shop information and the customer's own orders. Uses Google Gemini, with a rule-based fallback.
- **Voice search** in Shop and on Home (Android, iOS, browsers). Speech is turned into filters.
- **Live order tracking**: auto-refresh, delivery estimate, courier and shop updates, and emails for each update.
- Admin: courier and tracking panel on orders, and "AI assistant: shop information" in Settings.
- **Responsive web layout**: 2–5 frame columns depending on screen width, and centred forms.

## Server 1.5
- **Web app** built from the mobile code and served at `/`. Works on iPhone (Add to Home Screen), computers and Android browsers; installable as a PWA.
- The Android download page moved to `/download`, with a link to the web app.

## Server 1.4 · App 1.0.1
- Android APK distribution without the Play Store: download page, APK link and version in Settings, and an "Update available" banner in the app.

## Server 1.3
- **Email + password sign-in**, email codes for passwordless sign-in and password reset (Brevo), and order update emails. Replaces SMS OTP; the MSG91 code is kept for later.

## Server 1.2
- **Manual UPI payments**: exact-amount QR, UPI app button, UTR submission and staff confirmation. Shop settings page (UPI ID, QR image, COD on/off).

## Server 1.1
- Admin panel: frames with photo upload, prices, colours, stock and try-on images; lens and coating prices; orders; prescription review.
- Free-tier deployment: Render + Neon + Cloudflare R2; seed on start; setup mode for sign-in codes.

## Server 1.0 · App 1.0.0
- API, database and Android app: catalog, lens configurator, prescriptions with clinical validation, cart, checkout (Razorpay, COD), order stages, WhatsApp/Shiprocket integrations and camera try-on. Branding from the Lensio logo.
