# Lensio: project handover

**Lensio** is an online optical store ("Your lens, our world"): customers browse frames, choose lenses and coatings, add a prescription, pay by UPI or cash on delivery, and track their order. Staff run the store from a web admin panel.

This package contains everything needed to run, change and extend it.

## What's in the box

| Folder / file | What it is |
|---|---|
| `backend/` | The API server (Node.js 20, Express, TypeScript, PostgreSQL via Prisma). Also serves the **admin panel** (`/admin`), the **web app** (`/`) and the **Android download page** (`/download`). |
| `mobile/` | The customer app (React Native / Expo SDK 51, TypeScript). One codebase builds the **Android app** and the **web app** (which also works on iPhone). |
| `docs/` | This documentation. |
| `render.yaml` | Hosting blueprint for Render. |
| `docker-compose.yml` | Local PostgreSQL for development. |

## Read in this order

1. **[01-SETUP-GUIDE.md](01-SETUP-GUIDE.md)**: A to Z: accounts, running locally, deploying, building the apps.
2. **[02-ARCHITECTURE.md](02-ARCHITECTURE.md)**: how the code is organised and how the main flows work.
3. **[03-API-REFERENCE.md](03-API-REFERENCE.md)**: every API endpoint.
4. **[04-ADMIN-GUIDE.md](04-ADMIN-GUIDE.md)**: how store staff use the admin panel.
5. **[05-OPERATIONS.md](05-OPERATIONS.md)**: releasing updates, logs, backups, rotating keys, troubleshooting.
6. **[06-TRANSFER-CHECKLIST.md](06-TRANSFER-CHECKLIST.md)**: accounts and credentials to hand over.
7. **[07-ROADMAP.md](07-ROADMAP.md)**: known limitations and recommended next steps.

## Features at a glance

**Customers (Android app + web app)**
- Email + password sign-in, or a 6-digit code by email (password reset)
- Catalog with filters (shape, size, material, gender, price), sunglasses, wishlist
- **Voice search** ("women's black cat eye under 2000" → filters)
- Frame measurements and a size guide (Small / Medium / Wide)
- **Camera try-on**: live front camera with the frame overlaid; drag, pinch and rotate to position it
- Step-by-step lens choice: type → lens package → coatings → prescription → review
- Prescriptions: photo upload or manual entry (SPH/CYL/AXIS/ADD/PD) with clinical validation
- Checkout: **UPI QR / UPI app** (no fees, staff confirm the UTR), Cash on Delivery, optional Razorpay
- **Live order tracking**: auto-refreshing timeline, delivery estimate, courier updates
- **AI assistant ("Ask Lensio")**: grounded in the real catalog, prices and the customer's own orders
- Web app installable to the iPhone / Android home screen; responsive on computers

**Staff (admin panel at `/admin`)**
- Frames: photos, prices, measurements, colours, stock, try-on images
- Lens and coating prices, coupons
- Orders: move through stages, confirm UPI payments, courier and tracking updates
- Prescription review queue for the optician
- Settings: UPI ID / QR, cash on delivery, Android app link and version, assistant shop information

## Current production setup (at handover)

| Piece | Service | Plan |
|---|---|---|
| API + admin + web app | Render (Docker web service) | Free (sleeps when idle; upgrade to Starter for launch) |
| Database | Neon PostgreSQL (Singapore) | Free |
| Photos and prescriptions | Cloudflare R2 bucket `lensio-media` | Free up to 10 GB |
| Email | Brevo | Free, 300 emails/day |
| AI assistant | Google Gemini API | Free tier |
| Android builds | Expo EAS | Free |
| APK downloads | Public GitHub repo `lensio-app` (Releases) | Free |

Live address at handover: `https://lensio-api.onrender.com` (web app), `/admin` (admin panel), `/download` (Android).

## Quality checks at handover
- Backend: TypeScript compiles cleanly; **59 automated tests pass** (prescription rules incl. near vision, UPI links and QR, passwords, AI assistant with a mocked model, delivery estimates).
- Mobile: TypeScript compiles cleanly; voice-query parser tests pass; web build tested in headless Chrome at phone, tablet and desktop sizes.
- No secrets are stored in the source code. All credentials live in the hosting dashboard's environment settings.
