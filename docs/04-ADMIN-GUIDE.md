# Admin panel guide (for store staff)

Open **`https://<your-address>/admin`** in any browser on a computer, tablet or phone.

## Signing in
- Only emails listed in the server setting **`ADMIN_EMAILS`** can open the admin panel. Ask your developer to add new staff.
- **First time, or forgot your password:** click **"Email me a code"**, enter your email and type the 6-digit code you receive (check Spam). Set a password in the same step.
- After that, sign in with your email and password.

## Frames

**Add a frame:** **Frames → Add frame**.

| Section | What to enter |
|---|---|
| **Photos** | Drag in or pick JPG, PNG or WebP photos (up to 5 MB each). The **first photo** is the main one; use ← → to reorder. Best results: one frame, front view, plain white background, same lighting for every frame. |
| **Details** | Name, shape, material, who it's for, and a short description. Tick **sunglasses** if they are. |
| **Price** | **Selling price** and **MRP** in rupees. The app shows the % off automatically. This is the frame-only price; lenses are added on top. |
| **Measurements (mm)** | The numbers printed inside the arm, e.g. `52-18-140` (lens width, bridge, temple), plus the full **frame width**, which sets the Small / Medium / Wide size. |
| **Colours and stock** | One row per colour: name, swatch colour, size and stock. **Extra ₹** charges more for that colour. Leave SKU empty to generate one. |
| **Try-on image** *(optional)* | A front-view PNG with a transparent background. It appears in the Try on tab. |

Click **Add frame** or **Save changes**. It's live in the app immediately.

**Add many frames at once:** **Frames → ⚡ Quick add from photos**. Pick several photos (one photo = one frame) and fill in the name and price for each; shape, audience, sunglasses and stock are optional. Click **Create N frames**, then open any frame later to add measurements, more photos and colours. Tip: to use products from your Instagram, save the photos from your posts to your computer first. Instagram doesn't allow other apps to copy posts automatically.

**Try-on images happen automatically:** the Try on page uses each frame's main photo and removes a white background itself. Front-view photos on a plain white background give the best result. Use **Preview try-on** on a frame to check how it looks.

**Hide a frame** without deleting it: open it → **Hide from app**. Past orders keep working.

## Lens prices
**Lens prices** lists every lens package and coating.
- Change a price in rupees and click outside the box to save it.
- Untick **Offered** to stop selling one.
- Coupons can be switched on or off here too.

**What the customer pays** = frame price + lens price + coatings, minus any coupon, plus delivery (free above ₹999) and the COD fee (₹49, if they pay cash on delivery).

## Orders

**Orders** lists everything, newest first. You can filter by status, or search by order number, email or phone.

**Stages:** Awaiting payment → Order placed → Prescription verified → Lens cutting & fitting → Quality check → Dispatched → Delivered.
- Open an order and use **Move order** to go to the next stage. The customer gets an email (and WhatsApp, if set up) at every stage.
- An order can't pass **Prescription verified** until its prescriptions are verified (see below).
- If quality check fails, move it back to **Lens cutting & fitting**.
- **Cancelling** returns the stock automatically. For UPI orders that were already paid, **send the refund yourself** from your UPI app.

### Payments to check (UPI)
1. Click **Payments to check** at the top of Orders. It lists every order where the customer entered a UPI reference number (UTR).
2. Open the order and find the **amount and UTR** in your bank or UPI app (PhonePe / Paytm Business, etc.).
3. **Money received — confirm** moves the order to *Order placed*. **Not received** asks the customer to check and resubmit.

### Courier and live tracking
In an order → **Courier & live tracking**:
1. Enter the **courier**, **tracking number** and, optionally, the courier's **tracking link** once.
2. Add updates as they happen, e.g. *Packed and ready to ship*, *Picked up by courier*, *Out for delivery*. There's a ready-made list, and you can add a location.
3. Each update appears on the customer's order screen within 20 seconds, and they get an email.
4. If Shiprocket is connected, courier scans are added automatically.

## Prescriptions
**Prescriptions** shows every prescription waiting for review:
1. Open the photo or check the typed values.
2. Correct or fill in SPH / CYL / AXIS / ADD / PD if needed.
3. **Verify** moves the order forward. **Reject** (with a note) asks the customer for a clearer copy.

High-power prescriptions are flagged. Make sure the chosen lens supports the power.

## Settings

| Setting | What it does |
|---|---|
| **UPI ID** and **name** | Customers pay this UPI ID. The app shows a QR with the exact amount. Scan the ₹1 test QR after saving to check it. |
| **QR image** (backup) | Used only if no UPI ID is set. Customers then type the amount themselves. |
| **Cash on delivery** | Turn COD on or off (₹49 fee, orders up to ₹10,000). |
| **AI assistant: shop information** | What the in-app assistant tells customers about your shop: returns and exchanges, warranty, address, hours, delivery areas. Keep it up to date. The assistant never makes up policies it wasn't given. |
| **Instagram** | Your profile link, shown in the app, on the download page and by the assistant. |
| **Android app download** | The APK link and latest version number. Customers on older versions see "Update available". |

## Everyday checklist
- **Morning:** open **Payments to check** and confirm UPI payments; review **Prescriptions**.
- **During the day:** move orders through the stages, and add tracking updates when parcels leave.
- **Weekly:** check low stock on the dashboard; add new frames; hide sold-out ones.

## Reviews
**Reviews** lists customer reviews by status. Only customers whose order was **delivered** can review, one review per frame per order.
- If "Publish customer reviews straight away" is on in Settings, reviews go live at once and you can still **Hide** any of them.
- If it's off, each review waits under **Pending** until you **Approve** it.
- A frame's star rating updates automatically.

## Rewards: loyalty points and gift cards
- **Points:** customers earn points when an order is **delivered** (default 5 points per ₹100; 1 point = ₹1). They use points at checkout, for up to 20% of an order. Points go back automatically if an order is cancelled. Change the rates in **Settings → Loyalty points and reviews**. To give or remove points, e.g. as an apology, use **Rewards → Loyalty points** with the customer's email.
- **Gift cards:** **Rewards → Issue a gift card** creates a code like `LENS-ABCD-2345`. Give the code to the customer. It works at checkout, and the balance carries over until it's used up. Untick **Active** to cancel a card.

## Stores
**Stores → Add store** with the address, phone, opening hours and map location. For the location, long-press the pin in Google Maps and copy the two numbers. Customers see the nearest store first, with **Directions** and **Call** buttons.

## Home eye tests
Customers request a home visit from the app, choosing a day and a morning, afternoon or evening slot, and you get an email for each request. In **Eye tests**, call the customer, set the visit time and click **Mark scheduled**; the customer sees the booked time in the app. After the visit, click **Completed**. The app only takes bookings: arranging the optometrist's visit is up to your team.

## Import frames from Instagram
**Frames → 📸 Import from Instagram.** You connect once (about 10 minutes):
1. Your Instagram must be a **professional account**: in the Instagram app, **Settings → Account type and tools → Switch to professional account**. It's free.
2. Go to **developers.facebook.com/apps** → **Create app**, and choose the use case **"Manage messaging & content on Instagram"**.
3. In the app, open **Instagram → API setup with Instagram login** → **Add account**, log in to your shop's Instagram, then click **Generate token**.
4. Paste the token into Lensio admin → **Import from Instagram** → **Connect**. It renews itself automatically.

Then tick the posts you want. Check the **name, price, shape and "for"** read from each caption, and click **Import**. Photos are copied to your storage, and each frame gets a **View on Instagram** link. Posts already in your shop are greyed out. Add measurements and colours by opening each frame afterwards.

**Without connecting:** save the photos from your posts, use **⚡ Quick add from photos**, and click **📋 Fill from caption** on each row to paste the caption.

## Review requests (automatic)
Two days after an order is delivered, the customer gets an email asking them to rate their frames, with a link and their points earned. It's sent once per order, and skipped if they already reviewed. The app also shows a **"How are your … ?"** banner on Home until they do.
