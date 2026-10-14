import { Router } from 'express';
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { badRequest, notFound } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { lensNeedsRx, priceItem } from '../lens/pricing';
import { buildQuote } from './quote.service';

const r = Router();
r.use(requireAuth);

const itemSchema = z.object({
  variantId: z.string(),
  lensPackageId: z.string().nullable().optional(),
  coatingCodes: z.array(z.string()).max(6).default([]),
  prescriptionId: z.string().nullable().optional(),
  sendRxLater: z.boolean().default(false),
  quantity: z.number().int().min(1).max(5).default(1),
});

async function checkItem(userId: string, b: z.infer<typeof itemSchema>) {
  const variant = await prisma.frameVariant.findUnique({ where: { id: b.variantId }, include: { product: true } });
  if (!variant || !variant.product.isActive) throw notFound('Frame');
  const lens = b.lensPackageId ? await prisma.lensPackage.findUnique({ where: { id: b.lensPackageId } }) : null;
  if (b.lensPackageId && (!lens || !lens.isActive)) throw notFound('Lens');
  if (variant.product.isSunglasses && lens && lens.lensType !== 'SINGLE_VISION_DISTANCE' && lens.lensType !== 'ZERO_POWER')
    throw badRequest('LENS_NOT_ALLOWED', 'Sunglasses support single vision or zero power lenses only');
  const rx = b.prescriptionId ? await prisma.prescription.findFirst({ where: { id: b.prescriptionId, userId } }) : null;
  if (b.prescriptionId && !rx) throw notFound('Prescription');
  if (!lensNeedsRx(lens?.lensType) && (b.prescriptionId || b.sendRxLater))
    throw badRequest('RX_NOT_NEEDED', 'This lens does not use a prescription');
  if (rx && lens && (lens.lensType === 'BIFOCAL' || lens.lensType === 'PROGRESSIVE') && rx.source === 'MANUAL' && rx.odAdd == null)
    throw badRequest('RX_MISSING_ADD', 'This prescription has no ADD value, which bifocal and progressive lenses need');
  const coatings = await prisma.coating.findMany();
  // Throws with a clear message if the lens cannot carry this power or coatings are invalid.
  priceItem({ frameBase: variant.product.basePrice, variantDelta: variant.priceDelta, isSunglasses: variant.product.isSunglasses,
    lens, coatings, requestedCodes: b.coatingCodes, rx });
  if (variant.stock < b.quantity) throw badRequest('OUT_OF_STOCK', 'This colour and size is out of stock');
}

const quoteQuery = z.object({
  coupon: z.string().optional(), paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  giftCard: z.string().optional(), usePoints: z.enum(['true', 'false']).optional(),
});

r.get('/', validate(quoteQuery, 'query'), ah(async (req, res) => {
  const q = req.query as z.infer<typeof quoteQuery>;
  res.json(await buildQuote(prisma, req.user!.id, {
    couponCode: q.coupon, paymentMethod: q.paymentMethod, giftCardCode: q.giftCard, usePoints: q.usePoints === 'true',
  }));
}));

r.post('/items', validate(itemSchema), ah(async (req, res) => {
  const b = req.body as z.infer<typeof itemSchema>;
  await checkItem(req.user!.id, b);
  const count = await prisma.cartItem.count({ where: { userId: req.user!.id } });
  if (count >= 10) throw badRequest('CART_FULL', 'Your cart can hold up to 10 items');
  const item = await prisma.cartItem.create({ data: { ...b, coatingCodes: [...new Set(b.coatingCodes)], userId: req.user!.id } });
  res.status(201).json(item);
}));

r.patch('/items/:id', validate(itemSchema.partial()), ah(async (req, res) => {
  const existing = await prisma.cartItem.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!existing) throw notFound('Cart item');
  const merged = itemSchema.parse({ ...existing, ...req.body });
  await checkItem(req.user!.id, merged);
  res.json(await prisma.cartItem.update({ where: { id: existing.id }, data: { ...merged, coatingCodes: [...new Set(merged.coatingCodes)] } }));
}));

r.delete('/items/:id', ah(async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  res.status(204).end();
}));

export default r;
