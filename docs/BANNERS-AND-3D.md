# Banners and 3D try-on: assets

## Home banners (Admin → Banners)
- **Desktop image:** 1600 × 600 px (wide). **Mobile image:** 900 × 900 px (square), or 900 × 560.
- JPG, PNG or WebP, under 5 MB. Keep important text and faces in the middle: phones crop the sides.
- Headline (up to 80 characters), text (200), button (30), link: `/shop`, `/shop?kind=sunglasses`,
  `/shop?gender=KIDS`, `/shop?shape=ROUND`, `/shop?material=TITANIUM`, `/tryon`, `/product/<frame-link>` or an https address.
- Image description: for customers using screen readers.
- Visible / From / Until: banners appear and disappear on their own.
- Use only real offers that apply at checkout.

## 3D try-on models (Admin → Frames → frame → 3D try-on model)
Every frame already works in 3D (built from its shape, size, material and colour). A model makes it photo-real.
- Format: **GLB** (preferred) or glTF, hosted at an **https** link (e.g. Cloudflare R2). Up to 25 MB; aim for < 3 MB.
- Orientation: frame front facing **+Z** (towards the viewer), **Y up**, arms going back along −Z.
- Any unit: Lensio scales the model so its front is as wide as the frame's “frame width (mm)”.
- Calibration: Size × (fine scale), Up/down mm, Forward/back mm, Tilt °. Check on your own face in Try on → 3D.
- Lenses: use a transparent material (alpha) so eyes show through; sunglasses can use a tinted lens material.
