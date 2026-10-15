# Lensio libraries: frames, lenses, coatings

## Frames: design library (309 frame designs, 1,545 colour options)

`lensio-design-library.csv` is a ready-made list of **original, generic frame designs** covering what the market
offers: 8 shapes × acetate / TR90 / metal / titanium × full-rim / half-rim / rimless × small / medium / wide,
eyeglasses and UV400 sunglasses, a kids range, each in 5 popular colours. They are Lensio's own generic designs,
not copies of any brand's products.

Everything imports **hidden** (`active = no`) with **stock 0** and a **suggested** price, so customers see
nothing until you choose.

## Use it
Quickest: Admin → Frames → 📥 Bulk import → Frames → choose the file → tick **Show these frames to customers right away** and set a **starting stock** → Check file → Import. Every frame goes live at once (edit prices later in Frames).

Or choose frame by frame:
1. Open the file in Excel or Google Sheets.
2. **Delete the rows you don't stock.** For the rest, set your **price**, **mrp** and **stock**, add **image_url**
   if you have photos, and change **active** to `yes`.
3. Save as CSV → Admin → Frames → 📥 Bulk import → Frames → **Check file** → **Import**.

You can import the whole file first (everything hidden) and switch frames on later: edit the sheet and import it
again. Rows are matched by name and colour, so this updates them instead of adding duplicates.

Frames without photos show a drawn picture in their shape and colour; real photos look better, so add them when you can.

## Lenses and coatings
`lensio-lens-library.csv` (14 lens options: zero power, polycarbonate, 1.56 to 1.74, reading, bifocal D-top and
Kryptok, progressive standard / wide-view / 1.67) and `lensio-coating-library.csv` (11 coatings: anti-reflective,
blue cut, water repellent, photochromic, photochromic + blue cut, hard coat, UV400, polarised, tint, mirror,
night drive). They keep the codes of the lenses and coatings already in your shop, so importing **updates** those
and adds the new ones. Prices are suggestions in rupees: edit them in the sheet before importing, or later in
Admin → Lens prices.

Admin → Frames → 📥 Bulk import → **Lenses** (or **Coatings**) → choose the file → Check file → Import.
