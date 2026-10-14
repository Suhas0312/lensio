# API reference

Base path: `/v1`. Requests and responses are JSON unless noted.

**Access levels:**
- **Public**: no sign-in needed.
- **User**: requires the header `Authorization: Bearer <token>`.
- **Optional**: works signed in or out; being signed in adds personal data.
- **Staff**: requires the ADMIN or OPTICIAN role.
- **Admin**: requires the ADMIN role only.

**Errors** return `{ "error": { "code": "…", "message": "…", "details"?: … } }`. Validation errors put their field messages in `details.fieldErrors`.

**Money** is in integer paise (₹1 = 100).

## General

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | `{ok:true}` when the database is reachable (outside `/v1`) |
| GET | `/v1/config` | Public | Support WhatsApp number, available payment methods, Android app link and latest version, whether the AI is on, server version |
| GET | `/v1/qr?data=upi://pay?...` | Public | PNG QR code, for `upi://` links only |

## Auth and account (`/v1/auth`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/register` | Public | `{name, email, password}` creates an account. Returns `{token, user, isNew}` |
| POST | `/login` | Public | `{email, password}` returns `{token, user}` |
| POST | `/email-code/send` | Public | `{email}` emails a 6-digit code (10 minutes). Rate-limited |
| POST | `/email-code/verify` | Public | `{email, code, newPassword?, name?}` signs in, creating the account if new. With `newPassword`, it also sets or resets the password |
| POST | `/password` | User | `{newPassword, currentPassword?}` sets or changes the password |
| GET / PATCH | `/me` | User | Read or update `{name, email}` |
| GET / POST | `/addresses` | User | List or add a delivery address |
| DELETE | `/addresses/:id` | User | Delete an address (only if no order uses it) |
| POST | `/otp/send`, `/otp/verify` | Public | SMS sign-in. Kept for the future; needs MSG91 |

## Catalog (`/v1/catalog`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/products` | Public | Query parameters: `q, shape, material, gender, size, sunglasses, minPrice, maxPrice, maxLensWidth, sort (popular\|price_asc\|price_desc\|new), page, limit`. Returns `{items, total, page, pages}` |
| GET | `/products/:slug` | Public | Product with images, variants and size band |
| GET | `/products/:id/tryon-image` | Public | The frame's try-on source image (uploaded PNG, or the main photo), served from the same server so the try-on page can process it |
| GET | `/filters` | Public | Available shapes, materials, genders and sizes |
| GET | `/fit-guide?faceWidthMm=` | Public | Size bands and a recommendation |
| GET | `/wishlist` | User | Saved frames |
| PUT / DELETE | `/wishlist/:productId` | User | Save or remove a frame |

## Lenses and prescriptions

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/v1/lens/options?sunglasses=` | Public | Lens types with their packages and allowed coatings, plus all coatings |
| GET | `/v1/prescriptions` | User | The user's prescriptions, with signed image URLs |
| POST | `/v1/prescriptions/validate` | User | Checks values without saving; returns `{errors, warnings, isHighPower, normalized}` |
| POST | `/v1/prescriptions/manual` | User | Saves manual values `{od:{sph,cyl,axis,add}, os:{…}, pdTotal \| pdRight+pdLeft, lensType?}` |
| POST | `/v1/prescriptions/upload` | User | Multipart upload with field `file` (JPG/PNG/HEIC/WebP/PDF, 8 MB max) |
| DELETE | `/v1/prescriptions/:id` | User | Delete, if not used by an order |

## Cart and orders

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/v1/cart?coupon=&paymentMethod=` | User | Quote: lines, subtotal, discount, delivery and COD fees, total, and anything blocking checkout |
| POST | `/v1/cart/items` | User | `{variantId, lensPackageId?, coatingCodes[], prescriptionId?, sendRxLater?, quantity}` |
| PATCH / DELETE | `/v1/cart/items/:id` | User | Change or remove an item |
| POST | `/v1/orders/checkout` | User | `{addressId, paymentMethod (UPI_MANUAL\|COD\|UPI\|CARD\|NETBANKING), couponCode?}`. Returns `{order, payment?, upi?}` |
| GET | `/v1/orders` | User | The user's orders |
| GET | `/v1/orders/:id` | User | Full order: timeline, `eta`, `tracking[]`, courier details, `upi` payment info (if unpaid), `canCancel`, WhatsApp link |
| POST | `/v1/orders/:id/upi-payment` | User | Multipart `utr` (12 digits) plus optional `screenshot`. Marks the payment as submitted for staff to check |
| POST | `/v1/orders/:id/pay` | User | Retries a Razorpay payment within the hold window |
| POST | `/v1/orders/:id/cancel` | User | `{reason?}`, allowed before lens cutting starts |
| POST | `/v1/orders/:id/items/:itemId/prescription` | User | `{prescriptionId}` attaches a prescription sent after ordering |

## Payments and shipping (integrations)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/v1/payments/razorpay/verify` | User | The app confirms a Razorpay checkout (HMAC signature check) |
| POST | `/v1/payments/razorpay/failed` | User | Records a failed or cancelled attempt |
| POST | `/v1/payments/razorpay/webhook` | Razorpay | Raw body, `x-razorpay-signature` verified; idempotent by event ID |
| POST | `/v1/shipping/shiprocket/webhook` | Shiprocket | Header `x-api-key` = `SHIPROCKET_WEBHOOK_TOKEN`. Stores courier scans and marks delivery |
| GET | `/v1/shipping/serviceability/:pincode` | Public | Basic PIN code check |

## AI assistant

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/v1/assistant/chat` | Optional | `{messages:[{role:'user'\|'assistant', text}]}` (up to 20; the last must be from the user). Returns `{reply, products[], handoff, mode:'ai'\|'basic', supportWhatsApp}`. Limits: 10 per minute, 150 per day per IP |

## Admin (`/v1/admin`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/dashboard` | Staff | Orders by status, today's revenue, prescription queue size, low stock |
| GET | `/orders?status=&q=&toCheck=true&page=` | Staff | Order list; `toCheck` shows UPI payments waiting for confirmation |
| GET | `/orders/:id` | Staff | Full order, including payment proofs and prescription images as signed URLs |
| POST | `/orders/:id/status` | Staff | `{status, note?}` moves the order (same rules as the state machine) |
| POST | `/orders/:id/confirm-payment` | Admin | Manual UPI received; moves the order to PLACED |
| POST | `/orders/:id/reject-payment` | Admin | `{reason}`; the customer can submit the UTR again |
| POST | `/orders/:id/tracking` | Staff | `{message, location?, courierName?, awbCode?, trackingUrl?, notify?}` adds a live tracking update and emails the customer |
| DELETE | `/orders/:id/tracking/:updateId` | Admin | Delete a tracking update |
| POST | `/orders/:id/cod-collected` | Admin | Marks cash on delivery as collected |
| GET | `/prescriptions/queue` | Staff | Prescriptions waiting for review |
| POST | `/prescriptions/:id/review` | Staff | `{decision: VERIFIED\|REJECTED, note?, values?}` |
| POST | `/uploads` | Admin | Multipart `file` + `kind (products\|tryon\|settings)`. Returns a public `{url}` |
| GET / POST | `/products` | Staff / Admin | List, or create a product with images and variants |
| GET / PUT | `/products/:id` | Staff / Admin | Read, or fully save a product (images, variants added, edited or removed) |
| PATCH | `/products/:id` | Admin | `{isActive}` shows or hides it |
| PATCH | `/variants/:id/stock` | Admin | `{stock}` |
| GET | `/pricing` | Staff | Lens packages, coatings and coupons |
| PATCH | `/lens-packages/:id`, `/coatings/:id` | Admin | `{price?, isActive?, name?, description?}` |
| POST / PATCH | `/coupons`, `/coupons/:id` | Admin | Create a coupon, or turn one on or off |
| GET / PUT | `/settings` | Staff / Admin | `{upiId, upiPayeeName, upiQrImage, codEnabled, androidApkUrl, androidLatestVersion, shopInfo, instagramUrl}` |

## Pages served by the backend

| Path | What |
|---|---|
| `/` and any other page path | Web app (single-page app from `public/web`) |
| `/admin` | Admin panel |
| `/download` | Android APK download page |
| `/try-on` | AI try-on page (`?embed=1` inside the apps, `&frame=<slug>` to preselect a frame) |
| `/media/*` | Public files, only when `STORAGE_DRIVER=local` (development) |

## Reviews, rewards, stores and eye tests (server 1.9)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/v1/catalog/products/:slug/reviews?page=` | Public | Approved reviews, average and a 5→1 breakdown |
| POST | `/v1/reviews` | User | `{productId, orderId, rating 1-5, title?, body, photos[]}`, allowed only for delivered orders, one per product per order |
| POST | `/v1/reviews/photo` | User | Multipart `file`; returns `{url}` |
| GET | `/v1/reviews/mine`, `/v1/reviews/pending` | User | The user's reviews / delivered items not yet reviewed |
| GET | `/v1/loyalty/me` | User | Points balance, rates and history |
| GET | `/v1/loyalty/giftcard/:code` | User | Gift card balance (rate-limited) |
| GET | `/v1/stores?lat=&lng=` | Public | Active stores, sorted by distance when a location is given |
| POST / GET / DELETE | `/v1/eye-test`, `/v1/eye-test/mine`, `/v1/eye-test/:id` | User | Request, list or cancel a home eye-test visit |
| GET | `/v1/cart?usePoints=true&giftCard=CODE` | User | The quote now includes `pointsAvailable`, `pointsApplied`, `pointsAppliedPaise`, `giftCardApplied`, `giftCardBalance` and `giftCardError` |
| POST | `/v1/orders/checkout` | User | Adds `giftCardCode?` and `usePoints?`. Points and the gift card are debited in the same transaction as the order |
| GET / POST / DELETE | `/v1/admin/reviews`, `/reviews/:id/moderate`, `/reviews/:id` | Staff / Admin | Review moderation |
| GET / POST / PATCH | `/v1/admin/giftcards`, `/giftcards/:id` | Admin | List, issue, or turn a gift card on or off |
| POST | `/v1/admin/loyalty/adjust` | Admin | `{email, points (+/-), note?}` |
| GET / POST / PUT / DELETE | `/v1/admin/stores`, `/stores/:id` | Staff / Admin | Store locations |
| GET / POST | `/v1/admin/eye-test`, `/eye-test/:id` | Staff / Admin | Eye-test requests: `{status, scheduledFor?, staffNote?}` |

## Instagram import (server 2.0)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/v1/admin/instagram/status` | Admin | `{connected, username?, error?}` |
| PUT / DELETE | `/v1/admin/instagram/token` | Admin | `{token}` saves after checking it works, or disconnects. Stored in `Setting` key `instagramToken`, or the `INSTAGRAM_ACCESS_TOKEN` env |
| GET | `/v1/admin/instagram/posts?after=` | Admin | Recent posts with `images[]`, `caption`, `imported` and `guess` (parsed name, price, MRP, shape, gender, sunglasses) |
| POST | `/v1/admin/instagram/import` | Admin | `{items:[{id, name, price, mrp?, shape, gender, sunglasses, stock}]}` (up to 20). Re-reads each post, copies the photos to R2 and creates the products |
| POST | `/v1/admin/instagram/parse` | Staff | `{caption}` returns the parsed guess (used by Quick add) |
