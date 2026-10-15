# Adding many frames, lenses and coatings at once

Admin panel → **Frames** → **📥 Bulk import (CSV)**.

1. Pick **Frames**, **Lenses** or **Coatings** and tap **Download the … template**.
2. Open it in Excel or Google Sheets. Keep the first row (the column names). Add one row per item.
3. Save as **CSV** (Excel: File → Save As → “CSV UTF-8”; Google Sheets: File → Download → CSV).
4. Choose the file → **Check file**. Fix any rows it lists (row numbers match your sheet) → **Import**.

Importing the same file again **updates** prices, stock and details. Nothing is duplicated.

## Frames: one row per colour/size
| column | example | notes |
|---|---|---|
| name | Vista Rectangle | required; rows with the same name (and brand) become one frame |
| brand | Lensio | optional |
| type | eyeglasses / sunglasses | |
| shape | rectangle, round, cat eye, aviator, wayfarer, square, oval, geometric | required |
| material | acetate/plastic, metal, titanium, TR90, mixed | |
| gender | men, women, unisex, kids | |
| price, mrp | 1799, 2999 | rupees (₹ and commas are fine) |
| lens_width, bridge, temple | 52, 18, 140 | mm, required (printed on the arm: 52□18-140) |
| frame_width, weight | 134, 22 | optional; width is calculated if empty |
| colour, colour_hex | Tortoise | hex is optional for common colour names |
| size | small / medium / wide | optional; worked out from the width |
| stock, sku | 10 | sku is created if empty |
| image_url | https://…/a.jpg \| https://…/b.jpg | several photos separated by \| |
| description, active | …, yes | |

Frames without a photo still show a drawn picture in their shape and colour.

## Lenses
`name, type (single vision / reading / bifocal / progressive / zero power), index (1.50–1.74), price (0 = included), max_sph, max_cyl, description, active`

## Coatings
`name, price, description, active`
