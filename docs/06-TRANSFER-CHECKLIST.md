# Handover and transfer checklist

The code in this bundle is complete, but the **running store also depends on online accounts**. Work through this list with the current owner.

> **Never send passwords or API keys by email or chat.** Use each service's own "transfer" or "invite member" feature, or a password manager's secure sharing. After the transfer, **rotate every key** (see step 3).

## 1. Accounts and how to transfer them

| # | Service | What it holds | How to transfer | After transfer |
|---|---|---|---|---|
| 1 | **GitHub** repo `lensio` (private) | All source code | Repo → Settings → **Transfer ownership** to the new owner's account or organisation. Or add them as an admin collaborator first | Re-connect Render to the repo if the owner changed |
| 2 | **GitHub** repo `lensio-app` (public) | Android APK downloads (Releases) | Same as above | GitHub redirects old links, but update admin → Settings → **APK download link** to the new URL anyway |
| 3 | **Render** service `lensio-api` | Hosting, environment variables, domain | Invite the new owner to the Render workspace, or have them create their own Render service from the repo (same settings as [01-SETUP-GUIDE.md, section F5](01-SETUP-GUIDE.md)) and copy the environment variables over. The database is on Neon, so no data is lost | Update DNS if a custom domain moves. Remove the old owner from the workspace |
| 4 | **Neon** project `lensio` | The database: customers, orders, frames, settings | Neon → Project settings → **Transfer project** to the new owner's account or organisation, or invite them. Or `pg_dump` → restore into their own project | Reset the database password and update `DATABASE_URL` |
| 5 | **Cloudflare R2** bucket `lensio-media` | Product photos, try-on images, prescriptions, payment screenshots | Add the new owner as a member of the Cloudflare account, or copy the bucket to their account with `rclone` | New API token → `S3_*` variables. **If the public URL changes, product image links stored in the database must be updated** (see step 4) |
| 6 | **Brevo** | Sending emails | Usually easiest: the new owner creates their own account, verifies their sender and creates an API key | Update `BREVO_API_KEY`, `MAIL_FROM` and `MAIL_FROM_NAME` |
| 7 | **Google AI Studio** | Gemini key for the assistant | The new owner creates their own key | Update `GEMINI_API_KEY`, and delete the old key |
| 8 | **Expo** project `lensio` | Android build service **and the app signing key** | expo.dev → Project → Settings → **Transfer project** to the new owner's account or organisation. The keystore moves with it | Update `mobile/app.json → expo.owner` to the new account name. **Keep this project, or its keystore**: updates must be signed with the same key, or customers have to uninstall and reinstall |
| 9 | UPI ID / QR | Where customers' money goes | — | admin → Settings → the new owner's UPI ID and name |
| 10 | WhatsApp support number | Every "Chat with us" button | — | Render `SUPPORT_WHATSAPP_NUMBER` (91 + 10 digits) |
| 11 | Admin access | Who can open `/admin` | — | Render `ADMIN_EMAILS` = the new staff emails. Remove old admins (see step 5) |
| 12 | Domain *(if bought)* | The web address | The domain seller's transfer process | Render → Custom Domains; `PUBLIC_BASE_URL` |

**Not set up at handover:** Google Play Console, Apple Developer, Razorpay, Shiprocket, WhatsApp Cloud API and MSG91. The new owner creates these in their own name, and the code is ready for each.

## 2. Information to hand over (securely)
- [ ] A list of accounts and which email owns each (the table above)
- [ ] Expo project name and account: currently project `lensio`, `extra.eas.projectId` in `mobile/app.json`
- [ ] Current Render service URL and any custom domain
- [ ] The latest released Android version (`mobile/app.json → expo.version`) and the APK release link
- [ ] Brand assets: included in `mobile/assets/brand/` (logo cut-outs, store icon, feature graphic). The original logo file is `logo-source.jpg`; ask the designer for a vector (SVG/AI) version if one exists

## 3. Rotate every secret (required)
Some keys were shared in chat and screenshots during setup. Rotate **all** of them once the transfer is done. The steps are in [05-OPERATIONS.md → Rotating secrets](05-OPERATIONS.md):
- [ ] Neon database password → `DATABASE_URL`
- [ ] Cloudflare R2 token → `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- [ ] Brevo API key → `BREVO_API_KEY`
- [ ] Gemini API key → `GEMINI_API_KEY`
- [ ] `JWT_SECRET` → a new random value (this signs everyone out, customers included; do it at a quiet time)
- [ ] Change the passwords of every account transferred above, and turn on two-factor authentication

## 4. If the photo storage address changes
Product photos are saved in the database as full URLs. After moving to a new bucket or public URL, run this in the Neon SQL editor, replacing both addresses:
```sql
UPDATE "ProductImage" SET url = replace(url, 'https://OLD-PUBLIC-URL', 'https://NEW-PUBLIC-URL');
UPDATE "Product" SET "tryOnImage" = replace("tryOnImage", 'https://OLD-PUBLIC-URL', 'https://NEW-PUBLIC-URL');
UPDATE "Setting" SET value = replace(value, 'https://OLD-PUBLIC-URL', 'https://NEW-PUBLIC-URL');
```
Prescription and payment files are stored by key, not URL, so they only need copying to the new bucket.

## 5. Removing an old admin
Taking an email out of `ADMIN_EMAILS` stops future promotion, but an account that is already an admin keeps the role. To remove it, run in the Neon SQL editor:
```sql
UPDATE "User" SET role = 'CUSTOMER' WHERE email = 'old-admin@example.com';
```

## 6. Legal and business
*(Not legal advice. Consult a professional.)*
- A written agreement transferring **ownership of the code, brand and accounts**
- The **privacy policy** and terms must name the new business. Lensio processes names, emails, phone numbers, addresses, **prescription (health) data** and order history, and sends catalog and order summaries to Google Gemini for the assistant
- GST registration and invoices, if selling commercially
- Brand names: only list branded frames (e.g. "Ray-Ban") if they're genuine stock from an authorised source
