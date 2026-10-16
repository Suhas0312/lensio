import { Router } from 'express';
import { z } from 'zod';
import { FrameMaterial, FrameShape, FrameSize, Gender, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { notFound } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { cleanHex, framePNG, PLACEHOLDER_IMAGE } from '../../lib/frameArt';
import { coatingSVG, lensArtPNG, lensTypeSVG } from '../../lib/lensArt';
import { getBanners, liveBanners } from '../banners/banners';

const r = Router();

/** Size band from total frame width, matching the in-app face fit guide. */
export function sizeFromFrameWidth(mm: number): FrameSize {
  if (mm < 132) return 'SMALL';
  if (mm <= 140) return 'MEDIUM';
  return 'WIDE';
}

const listQuery = z.object({
  q: z.string().max(80).optional(),
  shape: z.nativeEnum(FrameShape).optional(),
  material: z.nativeEnum(FrameMaterial).optional(),
  gender: z.nativeEnum(Gender).optional(),
  size: z.nativeEnum(FrameSize).optional(),
  sunglasses: z.enum(['true', 'false']).optional(),
  minPrice: z.coerce.number().int().optional(),
  maxPrice: z.coerce.number().int().optional(),
  maxLensWidth: z.coerce.number().int().optional(),
  brand: z.string().max(60).optional(),
  color: z.string().max(40).optional(),
  exclude: z.string().max(40).optional(),            // "Similar frames": leave out the one being viewed
  sort: z.enum(['popular', 'price_asc', 'price_desc', 'new']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

r.get('/products', validate(listQuery, 'query'), ah(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof listQuery>;
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    shape: q.shape, material: q.material,
    gender: q.gender === 'KIDS' ? 'KIDS' : q.gender ? { in: [q.gender, 'UNISEX'] } : undefined,   // kids: kids' frames only
    isSunglasses: q.sunglasses ? q.sunglasses === 'true' : undefined,
    basePrice: { gte: q.minPrice, lte: q.maxPrice },
    lensWidthMm: q.maxLensWidth ? { lte: q.maxLensWidth } : undefined,
    variants: q.size || q.color ? { some: {
      ...(q.size ? { size: q.size, stock: { gt: 0 } } : {}),
      ...(q.color ? { colorName: { contains: q.color, mode: 'insensitive' } } : {}),
    } } : undefined,
    brand: q.brand ? { equals: q.brand, mode: 'insensitive' } : undefined,
    id: q.exclude ? { not: q.exclude } : undefined,
    // Also find frames by stock code (SKU) in search.
    OR: q.q ? [
      { name: { contains: q.q, mode: 'insensitive' } },
      { brand: { contains: q.q, mode: 'insensitive' } },
      { description: { contains: q.q, mode: 'insensitive' } },
      { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } },
    ] : undefined,
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    q.sort === 'price_asc' ? { basePrice: 'asc' } : q.sort === 'price_desc' ? { basePrice: 'desc' }
    : q.sort === 'new' ? { createdAt: 'desc' } : { ratingCount: 'desc' };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit,
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, variants: { select: { colorHex: true, colorName: true, size: true, stock: true } } },
    }),
    prisma.product.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pages: Math.ceil(total / q.limit) });
}));

r.get('/products/:slug', ah(async (req, res) => {
  const p = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: [{ colorName: 'asc' }, { size: 'asc' }] } },
  });
  if (!p || !p.isActive) throw notFound('Frame');
  res.json({ ...p, sizeBand: sizeFromFrameWidth(p.frameWidthMm) });
}));

/** Approved reviews for a product, newest first, with a 1-5 star breakdown. */
r.get('/products/:slug/reviews', ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { slug: req.params.slug }, select: { id: true, rating: true, ratingCount: true } });
  if (!p) throw notFound('Frame');
  const page = Math.max(1, Number(req.query.page) || 1);
  const [items, breakdown] = await Promise.all([
    prisma.review.findMany({
      where: { productId: p.id, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 10, take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.review.groupBy({ by: ['rating'], where: { productId: p.id, status: 'APPROVED' }, _count: true }),
  ]);
  const stars = [5, 4, 3, 2, 1].map((n) => ({ stars: n, count: breakdown.find((b) => b.rating === n)?._count ?? 0 }));
  res.json({
    rating: p.rating, ratingCount: p.ratingCount, stars, page,
    items: items.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, photos: r.photos, createdAt: r.createdAt, name: r.user.name ?? 'Lensio customer' })),
  });
}));

/**
 * Frame image for the try-on page, served from this server so the browser can process it
 * (remove the white background, crop, capture photos). Uses the uploaded try-on PNG if there
 * is one, otherwise the main product photo.
 */
const tryonCache = new Map<string, { at: number; type: string; body: Buffer }>();
/** Drawn frame picture (transparent PNG) for frames without a real photo. ?c=colour hex, ?pad=1 for shop pictures. */
r.get('/products/:id/frame.png', ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id }, include: { variants: { select: { colorHex: true }, take: 1 } } });
  if (!p) throw notFound('Frame');
  const hex = cleanHex(req.query.c) ?? cleanHex(p.variants[0]?.colorHex) ?? '#1B1F3B';
  const png = framePNG(p.id, p.updatedAt, p, hex, req.query.pad === '1');
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }).send(png);
}));

/** Home carousel: banners switched on in admin, inside their dates. */
r.get('/banners', ah(async (_req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json(liveBanners(await getBanners())); }));

/** Filter options that really exist in the shop (brands, colours with a swatch), for the Shop filters. */
r.get('/facets', ah(async (_req, res) => {
  const [brands, colours] = await Promise.all([
    prisma.product.groupBy({ by: ['brand'], where: { isActive: true }, _count: { _all: true }, orderBy: { _count: { brand: 'desc' } } }),
    prisma.frameVariant.findMany({ where: { product: { isActive: true } }, select: { colorName: true, colorHex: true } }),
  ]);
  const byName = new Map<string, { name: string; hex: string; count: number }>();
  for (const c of colours) {
    const base = c.colorName.split('/')[0].trim();                       // "Gold / Green lens" → "Gold"
    const k = base.toLowerCase();
    const e = byName.get(k) ?? { name: base, hex: c.colorHex, count: 0 }; e.count++; byName.set(k, e);
  }
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ brands: brands.map((b) => ({ name: b.brand, count: b._count._all })), colours: [...byName.values()].sort((a, b) => b.count - a.count).slice(0, 16) });
}));

/** Shape tiles (Home → Shop by frame shape): a drawn frame in that shape. */
r.get('/shape-art/:shape.png', ah(async (req, res) => {
  const shape = req.params.shape.toUpperCase();
  if (!/^(RECTANGLE|ROUND|CAT_EYE|AVIATOR|WAYFARER|SQUARE|OVAL|GEOMETRIC)$/.test(shape)) throw notFound('Shape');
  const spec = { shape, material: shape === 'ROUND' || shape === 'AVIATOR' || shape === 'OVAL' ? 'METAL' : 'ACETATE', isSunglasses: false, lensWidthMm: 52, bridgeMm: 18, frameWidthMm: 138 };
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }).send(framePNG(`shape-${shape}`, new Date(0), spec as never, '#1B1F3B', true));
}));

/** Pictures for the lens choice screen: /lens-art/type/PROGRESSIVE.png, /lens-art/lens/SVD-160.png, /lens-art/coating/MIRROR.png */
r.get('/lens-art/:kind/:code.png', ah(async (req, res) => {
  const { kind, code } = req.params;
  let key: string, draw: () => string;
  if (kind === 'type') {
    if (!/^[A-Z_]{3,40}$/.test(code)) throw notFound('Picture');
    key = `type:${code}`; draw = () => lensTypeSVG(code);
  } else if (kind === 'lens') {
    const l = await prisma.lensPackage.findUnique({ where: { code } });
    if (!l) throw notFound('Lens');
    key = `lens:${l.code}:${l.lensType}:${l.index}:${l.name}`; draw = () => lensTypeSVG(l.lensType, Number(l.index), l.name);
  } else if (kind === 'coating') {
    const c = await prisma.coating.findUnique({ where: { code } });
    if (!c) throw notFound('Coating');
    key = `coat:${c.code}:${c.name}`; draw = () => coatingSVG(c.code, c.name);
  } else throw notFound('Picture');
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }).send(lensArtPNG(key, draw));
}));

/**
 * 3D try-on model (GLB/glTF) for a frame, fetched by the server so the try-on page can load it under its
 * security rules (it may only load files from this server). Cached in memory; 25 MB limit.
 */
const modelCache = new Map<string, { at: number; type: string; body: Buffer }>();
r.get('/products/:id/model3d', ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true, isActive: true, tryOn3d: true } });
  const url = (p?.tryOn3d as { url?: string } | null)?.url;
  if (!p || !p.isActive || !url || !/^https:\/\//.test(url)) throw notFound('3D model');
  let hit = modelCache.get(url);
  if (!hit || Date.now() - hit.at > 6 * 3600_000) {
    const r2 = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r2.ok) throw notFound('3D model');
    const body = Buffer.from(await r2.arrayBuffer());
    if (body.length > 25 * 1024 * 1024) throw notFound('3D model');
    const glb = body.subarray(0, 4).toString('latin1') === 'glTF';
    hit = { at: Date.now(), type: glb ? 'model/gltf-binary' : 'model/gltf+json', body };
    if (modelCache.size > 40) modelCache.delete(modelCache.keys().next().value as string);
    modelCache.set(url, hit);
  }
  res.set({ 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=3600' }).send(hit.body);
}));

r.get('/products/:id/tryon-image', ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id }, include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } });
  const src = p?.tryOnImage || p?.images[0]?.url;
  if (!p || !p.isActive || !src) throw notFound('Frame image');
  if (!p.tryOnImage && PLACEHOLDER_IMAGE.test(src)) return res.redirect(302, `/v1/catalog/products/${encodeURIComponent(p.id)}/frame.png`);
  const key = `${p.id}:${src}`;
  let hit = tryonCache.get(key);
  if (!hit || Date.now() - hit.at > 6 * 3600_000) {
    const r2 = await fetch(src, { signal: AbortSignal.timeout(15_000) });
    const type = r2.headers.get('content-type') ?? 'image/jpeg';
    if (!r2.ok || !type.startsWith('image/')) throw notFound('Frame image');
    const body = Buffer.from(await r2.arrayBuffer());
    if (body.length > 8 * 1024 * 1024) throw notFound('Frame image');
    hit = { at: Date.now(), type, body };
    if (tryonCache.size > 300) tryonCache.delete(tryonCache.keys().next().value as string);
    tryonCache.set(key, hit);
  }
  res.set({ 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=3600', 'X-Tryon-Source': p.tryOnImage ? 'png' : 'photo' }).send(hit.body);
}));

r.get('/filters', ah(async (_req, res) => {
  res.json({
    shapes: Object.values(FrameShape), materials: Object.values(FrameMaterial),
    genders: Object.values(Gender), sizes: Object.values(FrameSize),
  });
}));

/** Face fit guide: map a measured face width (mm, e.g. from the try-on screen) to a frame size band. */
r.get('/fit-guide', ah(async (req, res) => {
  const faceWidth = Number(req.query.faceWidthMm);
  const bands = [
    { size: 'SMALL', frameWidthMm: 'under 132', lensWidthMm: '46–49', faceWidthMm: 'under 130' },
    { size: 'MEDIUM', frameWidthMm: '132–140', lensWidthMm: '50–53', faceWidthMm: '130–140' },
    { size: 'WIDE', frameWidthMm: 'over 140', lensWidthMm: '54–58', faceWidthMm: 'over 140' },
  ];
  const recommended = Number.isFinite(faceWidth) && faceWidth > 0 ? sizeFromFrameWidth(faceWidth + 2) : null;
  res.json({
    bands, recommended,
    howToRead: 'The numbers on the inside of a temple arm, like 52-18-140, are lens width, bridge width and temple length in mm.',
  });
}));

// Wishlist
r.get('/wishlist', requireAuth, ah(async (req, res) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' },
    include: { product: { include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true } } },
  });
  // Only frames still on sale (the app's frame cards need colours/variants too)
  res.json(items.map((i) => i.product).filter((p) => p.isActive));
}));
r.put('/wishlist/:productId', requireAuth, ah(async (req, res) => {
  await prisma.wishlistItem.upsert({
    where: { userId_productId: { userId: req.user!.id, productId: req.params.productId } },
    update: {}, create: { userId: req.user!.id, productId: req.params.productId },
  });
  res.status(204).end();
}));
r.delete('/wishlist/:productId', requireAuth, ah(async (req, res) => {
  await prisma.wishlistItem.deleteMany({ where: { userId: req.user!.id, productId: req.params.productId } });
  res.status(204).end();
}));

export default r;
