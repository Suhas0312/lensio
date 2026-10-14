import { FrameMaterial, FrameShape, FrameSize, Gender, LensType, PrismaClient } from '@prisma/client';
const R = (n: number) => n * 100; // rupees → paise

const lensPackages: { code: string; name: string; lensType: LensType; index: number; description: string; price: number; maxAbsSph: number; maxAbsCyl: number }[] = [
  { code: 'ZP-STD', name: 'Zero power — clear', lensType: 'ZERO_POWER', index: 1.56, description: 'Clear lenses with no power.', price: 0, maxAbsSph: 0, maxAbsCyl: 0 },
  { code: 'SVD-156', name: 'Everyday 1.56', lensType: 'SINGLE_VISION_DISTANCE', index: 1.56, description: 'Standard thickness, great for low power.', price: R(0), maxAbsSph: 4, maxAbsCyl: 2 },
  { code: 'SVD-160', name: 'Thin 1.60', lensType: 'SINGLE_VISION_DISTANCE', index: 1.6, description: '20% thinner. Recommended above ±3.', price: R(1500), maxAbsSph: 8, maxAbsCyl: 4 },
  { code: 'SVD-167', name: 'Ultra thin 1.67', lensType: 'SINGLE_VISION_DISTANCE', index: 1.67, description: 'For high power, up to ±12.', price: R(3500), maxAbsSph: 12, maxAbsCyl: 6 },
  { code: 'SVD-174', name: 'Thinnest 1.74', lensType: 'SINGLE_VISION_DISTANCE', index: 1.74, description: 'For very high power, up to ±20.', price: R(6500), maxAbsSph: 20, maxAbsCyl: 6 },
  { code: 'SVR-156', name: 'Reading 1.56', lensType: 'SINGLE_VISION_READING', index: 1.56, description: 'For books and phones.', price: R(0), maxAbsSph: 4, maxAbsCyl: 2 },
  { code: 'SVR-160', name: 'Reading thin 1.60', lensType: 'SINGLE_VISION_READING', index: 1.6, description: 'Thinner reading lens.', price: R(1500), maxAbsSph: 8, maxAbsCyl: 4 },
  { code: 'BF-156', name: 'Bifocal D-top 1.56', lensType: 'BIFOCAL', index: 1.56, description: 'Distance and reading, with a visible segment.', price: R(1800), maxAbsSph: 6, maxAbsCyl: 3 },
  { code: 'PG-156', name: 'Progressive standard', lensType: 'PROGRESSIVE', index: 1.56, description: 'Smooth vision at all distances.', price: R(3500), maxAbsSph: 6, maxAbsCyl: 3 },
  { code: 'PG-160W', name: 'Progressive wide-view 1.60', lensType: 'PROGRESSIVE', index: 1.6, description: 'Wider reading and computer zones, easier to adapt.', price: R(6500), maxAbsSph: 8, maxAbsCyl: 4 },
];

const coatings = [
  { code: 'ARC', name: 'Anti-reflective', description: 'Cuts glare from headlights and screens. Looks clearer in photos.', price: R(500) },
  { code: 'BLUE_CUT', name: 'Blue cut', description: 'Filters blue light from screens. Includes anti-reflective.', price: R(1000) },
  { code: 'HYDROPHOBIC', name: 'Water & smudge repellent', description: 'Hydrophobic and oleophobic layer. Wipes clean easily.', price: R(400) },
  { code: 'PHOTOCHROMIC', name: 'Photochromic', description: 'Darkens in sunlight, clear indoors.', price: R(2000) },
];

const frames: { slug: string; name: string; shape: FrameShape; material: FrameMaterial; gender: Gender; isSunglasses?: boolean; price: number; mrp: number; dims: [number, number, number, number]; colors: [string, string][] }[] = [
  { slug: 'orbit-round-titanium', name: 'Orbit Round', shape: 'ROUND', material: 'TITANIUM', gender: 'UNISEX', price: 2499, mrp: 3999, dims: [49, 20, 145, 134], colors: [['Gunmetal', '#4A4E57'], ['Gold', '#C9A45C']] },
  { slug: 'vista-rectangle-acetate', name: 'Vista Rectangle', shape: 'RECTANGLE', material: 'ACETATE', gender: 'MEN', price: 1799, mrp: 2999, dims: [54, 17, 145, 141], colors: [['Matte black', '#1B1B1F'], ['Havana', '#6B3E26']] },
  { slug: 'iris-cat-eye', name: 'Iris Cat-Eye', shape: 'CAT_EYE', material: 'ACETATE', gender: 'WOMEN', price: 1999, mrp: 3499, dims: [52, 18, 140, 137], colors: [['Plum', '#5B2A5E'], ['Crystal pink', '#E7B8C4']] },
  { slug: 'drift-wayfarer-tr90', name: 'Drift Wayfarer', shape: 'WAYFARER', material: 'TR90', gender: 'UNISEX', price: 1299, mrp: 1999, dims: [51, 19, 142, 136], colors: [['Navy', '#1E2A55'], ['Black', '#111114']] },
  { slug: 'pixel-kids-square', name: 'Pixel Kids', shape: 'SQUARE', material: 'TR90', gender: 'KIDS', price: 999, mrp: 1499, dims: [46, 16, 128, 124], colors: [['Sky blue', '#5AB6E8'], ['Red', '#D23B3B']] },
  { slug: 'skyline-aviator-sun', name: 'Skyline Aviator', shape: 'AVIATOR', material: 'METAL', gender: 'UNISEX', isSunglasses: true, price: 2299, mrp: 3499, dims: [58, 14, 140, 144], colors: [['Gold / green', '#B89B5E'], ['Silver / grey', '#A7ABB3']] },
];

/** Idempotent: safe to run on every deploy. Sample frames are only added when the catalog is empty. */
export async function runSeed(prisma: PrismaClient) {
  for (const [i, p] of lensPackages.entries()) await prisma.lensPackage.upsert({ where: { code: p.code }, update: { ...p, sortOrder: i }, create: { ...p, sortOrder: i } });
  for (const [i, c] of coatings.entries()) await prisma.coating.upsert({ where: { code: c.code }, update: { ...c, sortOrder: i }, create: { ...c, sortOrder: i } });

  await prisma.coupon.upsert({
    where: { code: 'FIRST10' }, update: {},
    create: { code: 'FIRST10', description: '10% off your first frame + lens combo', percentOff: 10, maxDiscount: R(750), firstOrderOnly: true, requiresLens: true, perUserLimit: 1 },
  });

  if ((await prisma.product.count()) > 0) { console.log('Catalog has products; skipping sample frames.'); return; }
  for (const f of frames) {
    const [lw, br, tm, fw] = f.dims;
    const size: FrameSize = fw < 132 ? 'SMALL' : fw <= 140 ? 'MEDIUM' : 'WIDE';
    await prisma.product.upsert({
      where: { slug: f.slug }, update: {},
      create: {
        slug: f.slug, name: f.name, description: `${f.name}: lightweight ${f.material.toLowerCase()} frame with spring hinges and adjustable nose pads.`,
        shape: f.shape, material: f.material, gender: f.gender, isSunglasses: !!f.isSunglasses,
        basePrice: R(f.price), mrp: R(f.mrp), lensWidthMm: lw, bridgeMm: br, templeMm: tm, frameWidthMm: fw, weightGrams: 18,
        // Replace with your product photography (front view on white) and a transparent front-view PNG for try-on.
        images: { create: [{ url: `https://placehold.co/800x600/F4F5FB/1B1F3B/png?text=${encodeURIComponent(f.name)}`, sortOrder: 0 }] },
        tryOnImage: null,
        rating: 4.3, ratingCount: 20 + Math.floor(Math.random() * 200),
        variants: { create: f.colors.map(([name, hex], i) => ({ sku: `${f.slug}-${i}`.toUpperCase(), colorName: name, colorHex: hex, size, stock: 25 })) },
      },
    });
  }
  console.log('Seeded lens packages, coatings, FIRST10 coupon and sample frames.');
}

