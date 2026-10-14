# WhatsApp setup (login codes + automatic customer updates)

Lensio uses the official **WhatsApp Business Platform (Meta Cloud API)**. Once it is set up, everything below is sent automatically. Nothing needs to be clicked in the admin panel.

| When | Customer gets on WhatsApp |
|---|---|
| Signs in with mobile number | 6-digit login code with a **Copy code** button (SMS is the backup) |
| Order placed / each step (prescription verified, lens fitting, quality check, dispatched, delivered, cancelled) | Order update with the new status |
| Unpaid order after 15 minutes | Payment reminder, once |
| UPI payment rejected in admin | What went wrong and how to pay again |
| Prescription missing / rejected | Request to upload a (new) prescription |
| Courier scans (picked up, out for delivery, delivery attempted…) and your manual tracking updates | Tracking update |
| 2 days after delivery | Review request with bonus points |
| Eye test at home booked, confirmed, completed or cancelled | Eye-test update |
| **You (the owner)** | New orders, payments to check, prescriptions to review, courier problems |

Every message also goes by email when the customer has one. If WhatsApp is not set up yet, the app keeps working: emails still go out and login codes use SMS (or email sign-in).

## 1. Create the WhatsApp Business account (about 30 minutes)

1. Go to **business.facebook.com** and create (or open) your Meta Business account for Lensio.
2. Go to **developers.facebook.com → My Apps → Create app → Business**, name it "Lensio", and add the **WhatsApp** product.
3. In **WhatsApp → API Setup**, click **Add phone number**. Use a number that is **not** already on the normal WhatsApp or WhatsApp Business app (a new SIM is easiest). Verify it with the code Meta sends.
4. Note the **Phone number ID** shown there. This is `WHATSAPP_PHONE_NUMBER_ID`.
5. Add a payment method in **WhatsApp Manager → Settings → Payment methods**. Meta charges a small fee per message; see Meta's WhatsApp pricing page for current India rates.
6. Recommended: complete **Business verification** (Business settings → Security centre). Until then Meta limits how many customers you can message per day.

## 2. Create a permanent access token

The token shown on the API Setup page expires after 24 hours. Make a permanent one:

1. **business.facebook.com → Settings → Users → System users → Add**: name "Lensio server", role **Admin**.
2. Click **Add assets** → Apps → Lensio → **Full control**. Also add your **WhatsApp account** with full control.
3. Click **Generate new token** → app Lensio → expiry **Never** → tick `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Copy the token. This is `WHATSAPP_TOKEN`. Keep it secret.

## 3. Create the 5 message templates

In **WhatsApp Manager → Message templates → Create template**, language **English**. Names and text must match exactly (the `{{1}}` parts are filled in by Lensio).

| Name | Category | Body text |
|---|---|---|
| `login_code` | **Authentication** | Choose **Copy code**. Meta writes the text itself ("{{1}} is your verification code."). Tick "Add security recommendation" and set expiry to 5 minutes if offered. |
| `order_update` | Utility | `Hi {{1}}, your Lensio order {{2}} is now: {{3}}. {{4}}` |
| `prescription_needed` | Utility | `Hi {{1}}, upload your prescription for order {{2}} so we can start cutting your lenses.` |
| `eye_test_update` | Utility | `Hi {{1}}, your Lensio eye test at home: {{2}}. {{3}}` |
| `owner_alert` | Utility | `Lensio alert: {{1}}. {{2}}` |

Meta asks for sample values for each `{{n}}`. Use for example: `Asha`, `LNS10234`, `Dispatched`, `Track it in the Lensio app.` Approval usually takes minutes to a few hours.

If you chose **English (US)** instead of plain English, set `WHATSAPP_TEMPLATE_LANG` to `en_US` in Render.

## 4. Add the settings in Render

Render → your Lensio service → **Environment** → add:

| Key | Value |
|---|---|
| `WHATSAPP_TOKEN` | the permanent token from step 2 |
| `WHATSAPP_PHONE_NUMBER_ID` | the Phone number ID from step 1 |
| `OWNER_WHATSAPP_NUMBERS` | your own 10-digit mobile number(s) for shop alerts, comma-separated, e.g. `9876543210,9123456780` |
| `WHATSAPP_TEMPLATE_LANG` | only if your templates are not plain `en` (e.g. `en_US`) |

Optional SMS backup for login codes (if WhatsApp is down or the customer has no WhatsApp): `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`.

Save. Render restarts the server. Check `https://<your-server>/v1/config`: `"otpWhatsApp": true` means WhatsApp login codes are on.

## 5. Test

1. In the app, sign in with **Mobile number**. The code should arrive on WhatsApp within seconds.
2. Place a test order. You should get "Order placed" on WhatsApp, and your owner number gets the new-order alert.
3. In admin, move the order to the next step and watch the customer message arrive.

## If messages don't arrive

- Render → **Logs**, search for `WhatsApp send failed`. The line shows Meta's reason:
  - `Template name does not exist` / `132001`: the template name or language doesn't match (step 3).
  - `131026` / `Message undeliverable`: that number isn't on WhatsApp. Login codes fall back to SMS automatically.
  - `190` / `Invalid OAuth access token`: the token expired. Make the permanent one (step 2).
  - `131047`: you're past Meta's daily limit for unverified businesses. Complete business verification.
- `[WhatsApp not set up]` in the logs means `WHATSAPP_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is missing in Render.
