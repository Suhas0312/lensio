import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { putPublicFile } from '../../lib/storage';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getSettings } from '../settings/settings.service';

const r = Router();

/** Recomputes a product's cached rating/ratingCount from its approved reviews. */
export async function recomputeProductRating(productId: string) {
  const agg = await prisma.review.aggregate({ where: { productId, status: 'APPROVED' }, _avg: { rating: true }, _count: true });
  await prisma.product.update({ where: { id: productId }, data: { rating: agg._avg.rating ?? 0, ratingCount: agg._count } });
}

const photoUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(badRequest('BAD_FILE_TYPE', 'Photos must be JPG, PNG or WebP'));
  },
});

r.post('/photo', requireAuth, photoUpload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('NO_FILE', 'Choose a photo');
  res.status(201).json({ url: await putPublicFile('reviews', req.file.buffer, req.file.mimetype) });
}));

const createSchema = z.object({
  productId: z.string(), orderId: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional(),
  body: z.string().trim().min(5, 'Say a little more about it').max(2000),
  photos: z.array(z.string().url()).max(4).default([]),
});

/** Leave a review — only for a product the customer actually received, once per order. */
r.post('/', requireAuth, validate(createSchema), ah(async (req, res) => {
  const b = req.body as z.infer<typeof createSchema>;
  const userId = req.user!.id;
  const item = await prisma.orderItem.findFirst({
    where: { orderId: b.orderId, order: { userId, status: 'DELIVERED' }, variant: { productId: b.productId } },
  });
  if (!item) throw badRequest('NOT_ELIGIBLE', 'You can review a frame once your order for it has been delivered.');
  const existing = await prisma.review.findUnique({ where: { productId_orderId: { productId: b.productId, orderId: b.orderId } } });
  if (existing) throw conflict('ALREADY_REVIEWED', 'You already reviewed this item for this order.');

  const settings = await getSettings();
  const review = await prisma.review.create({
    data: { ...b, userId, status: settings.reviewsAutoApprove ? 'APPROVED' : 'PENDING' },
  });
  if (review.status === 'APPROVED') await recomputeProductRating(b.productId);
  res.status(201).json(review);
}));

r.get('/mine', requireAuth, ah(async (req, res) => {
  res.json(await prisma.review.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true, slug: true } } } }));
}));

/** Reviewable order items: delivered items with no review yet, used to prompt "Rate this" in the app. */
r.get('/pending', requireAuth, ah(async (req, res) => {
  const items = await prisma.orderItem.findMany({
    where: { order: { userId: req.user!.id, status: 'DELIVERED' } },
    include: { variant: { include: { product: { select: { id: true, name: true, slug: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } } } }, order: { select: { id: true, orderNumber: true } } },
  });
  const reviewed = new Set((await prisma.review.findMany({ where: { userId: req.user!.id }, select: { productId: true, orderId: true } })).map((x) => `${x.productId}:${x.orderId}`));
  const pending = items.filter((i) => !reviewed.has(`${i.variant.product.id}:${i.order.id}`))
    .map((i) => ({ productId: i.variant.product.id, productName: i.variant.product.name, productSlug: i.variant.product.slug, productImage: i.variant.product.images[0]?.url ?? null, orderId: i.order.id, orderNumber: i.order.orderNumber }));
  // De-dupe: same product bought twice in one order should only prompt once.
  const seen = new Set<string>();
  res.json(pending.filter((p) => { const k = `${p.productId}:${p.orderId}`; if (seen.has(k)) return false; seen.add(k); return true; }));
}));

export default r;
