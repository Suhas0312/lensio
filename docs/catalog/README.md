# Lensio design library (309 frame designs, 1,545 colour options)

`lensio-design-library.csv` is a ready-made list of **original, generic frame designs** covering what the market
offers: 8 shapes × acetate / TR90 / metal / titanium × full-rim / half-rim / rimless × small / medium / wide,
eyeglasses and UV400 sunglasses, a kids range, each in 5 popular colours. They are Lensio's own generic designs,
not copies of any brand's products.

Everything imports **hidden** (`active = no`) with **stock 0** and a **suggested** price, so customers see
nothing until you choose.

## Use it
1. Open the file in Excel or Google Sheets.
2. **Delete the rows you don't stock.** For the rest, set your **price**, **mrp** and **stock**, add **image_url**
   if you have photos, and change **active** to `yes`.
3. Save as CSV → Admin → Frames → 📥 Bulk import → Frames → **Check file** → **Import**.

You can import the whole file first (everything hidden) and switch frames on later: edit the sheet and import it
again. Rows are matched by name and colour, so this updates them instead of adding duplicates.

Frames without photos show a drawn picture in their shape and colour; real photos look better, so add them when you can.
