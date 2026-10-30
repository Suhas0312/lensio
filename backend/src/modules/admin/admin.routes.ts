import { Router } from 'express';
import { z } from 'zod';
import { FrameMaterial, FrameShape, FrameSize, Gender, OrderStatus, Prisma, PrescriptionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { AppError, badRequest, notFound } from '../../lib/errors';
import multer from 'multer';
import { putPublicFile, signedUrl } from '../../lib/storage';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { validatePrescription } from '../prescriptions/rx.rules';
import { orderInclude, transition } from '../orders/orders.service';
import { STATUS_LABEL } from '../notifications/whatsapp.service';
import { androidRelease } from '../settings/appRelease';
import { testGeminiKeys } from '../assistant/assistant.service';
import { alertRecipients } from '../notifications/owner.service';
import { importCatalog, Kind, TEMPLATES } from '../catalogImport/import.service';
import { bannerSchema, getBanners, saveBanners } from '../banners/banners';
import { validShape, getSettings, saveSettings } from '../settings/settings.service';
import { mailEnabled, sendMail } from '../../lib/mail';
import { notifyEyeTest, notifyOrderUpdate } from '../notifications/whatsapp.service';
import { shiprocketEnabled } from '../shipping/shiprocket.service';
import { recomputeProductRating } from '../reviews/reviews.routes';
import { creditPoints, debitPoints } from '../loyalty/points.service';
import { issueGiftCard } from '../loyalty/giftcard.service';
import { parseCaption } from '../instagram/caption';
import { connectionStatus, disconnect as igDisconnect, importPosts, listPosts, saveToken as igSaveToken } from '../instagram/instagram.service';

const r = Router();
r.use(requireAuth, requireRole('ADMIN', 'OPTICIAN'));
const adminOnly = requireRole('ADMIN');

// ---------- Dashboard ----------
r.get('/dashboard', ah(async (_req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [byStatus, todayOrders, rxQueue, lowStock] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], _count: true }),
    prisma.order.aggregate({ where: { createdAt: { gte: today }, status: { notIn: ['CANCELLED', 'PAYMENT_PENDING'] } }, _sum: { total: true }, _count: true }),
    prisma.prescription.count({ where: { status: 'PENDING_REVIEW', orderItems: { some: {} } } }),
    prisma.frameVariant.findMany({ where: { stock: { lte: 3 } }, include: { product: { select: { name: true } } }, take: 20 }),
  ]);
  res.json({ byStatus, today: { orders: todayOrders._count, revenue: todayOrders._sum.total ?? 0 }, rxQueue, lowStock });
}));

// ---------- Live alerts (polled by the admin panel every 30 s) ----------
r.get('/alerts', ah(async (req, res) => {
  const since = new Date(Number(req.query.since) || Date.now() - 60_000);
  const [placed, paid, rx, problems, toCheck, rxQueue] = await Promise.all([
    prisma.orderStatusEvent.findMany({ where: { status: 'PLACED', createdAt: { gt: since } }, include: { order: { select: { id: true, orderNumber: true, total: true } } }, take: 20 }),
    prisma.payment.findMany({ where: { status: 'SUBMITTED', updatedAt: { gt: since } }, include: { order: { select: { id: true, orderNumber: true, total: true } } }, take: 20 }),
    prisma.orderItem.findMany({ where: { prescription: { status: 'PENDING_REVIEW', updatedAt: { gt: since } }, order: { status: { not: 'CANCELLED' } } }, include: { order: { select: { id: true, orderNumber: true } } }, take: 20 }),
    prisma.trackingUpdate.findMany({ where: { source: 'courier', at: { gt: since }, message: { in: ['Delivery attempted: courier will try again', 'Parcel is being returned to us', 'Problem with the shipment: we are looking into it', 'Courier shipment cancelled'] } }, include: { order: { select: { id: true, orderNumber: true } } }, take: 20 }),
    prisma.order.count({ where: { status: 'PAYMENT_PENDING', payments: { some: { status: 'SUBMITTED' } } } }),
    prisma.prescription.count({ where: { status: 'PENDING_REVIEW', orderItems: { some: {} } } }),
  ]);
  const rupees = (p: number) => '₹' + Math.round(p / 100).toLocaleString('en-IN');
  const events = [
    ...placed.filter((e) => !e.actorId).map((e) => ({ kind: 'new_order', orderId: e.order.id, text: `New order ${e.order.orderNumber} · ${rupees(e.order.total)}`, at: e.createdAt })),
    ...paid.map((p) => ({ kind: 'payment', orderId: p.order.id, text: `UPI payment to check · ${p.order.orderNumber} · ${rupees(p.order.total)}`, at: p.updatedAt })),
    ...rx.map((i) => ({ kind: 'prescription', orderId: i.order.id, text: `Prescription to review · ${i.order.orderNumber}`, at: new Date() })),
    ...problems.map((t) => ({ kind: 'courier', orderId: t.order.id, text: `${t.message} · ${t.order.orderNumber}`, at: t.at })),
  ];
  res.json({ now: Date.now(), events, counts: { paymentsToCheck: toCheck, prescriptionsToReview: rxQueue } });
}));

// ---------- Orders ----------
r.get('/orders', validate(z.object({
  status: z.nativeEnum(OrderStatus).optional(), q: z.string().optional(),
  toCheck: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
}), 'query'), ah(async (req, res) => {
  const { status, q, page, toCheck } = req.query as unknown as { status?: OrderStatus; q?: string; page: number; toCheck?: string };
  const where: Prisma.OrderWhereInput = {
    status: toCheck === 'true' ? 'PAYMENT_PENDING' : status,
    payments: toCheck === 'true' ? { some: { status: 'SUBMITTED' } } : undefined,
    OR: q ? [{ orderNumber: { contains: q, mode: 'insensitive' } }, { user: { phone: { contains: q } } }, { user: { email: { contains: q, mode: 'insensitive' } } }] : undefined,
  };
  const [items, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30, include: { user: { select: { id: true, name: true, phone: true, email: true } }, address: { select: { phone: true } }, items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } } }),
    prisma.order.count({ where }),
  ]);
  const toCheckCount = await prisma.order.count({ where: { status: 'PAYMENT_PENDING', payments: { some: { status: 'SUBMITTED' } } } });
  res.json({ items, total, toCheckCount });
}));

r.get('/orders/:id', ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: orderInclude });
  if (!o) throw notFound('Order');
  const items = await Promise.all(o.items.map(async (i) => ({
    ...i, prescriptionImageUrl: i.prescription?.imageKey ? await signedUrl(i.prescription.imageKey, 1800) : null,
  })));
  const payments = await Promise.all(o.payments.map(async (p) => ({ ...p, proofUrl: p.proofKey ? await signedUrl(p.proofKey, 1800) : null })));
  const user = { id: o.user.id, name: o.user.name, phone: o.user.phone, phoneVerified: o.user.phoneVerified, email: o.user.email }; // never expose password hashes
  res.json({ ...o, user, items, payments, statusLabel: STATUS_LABEL[o.status], integrations: { shiprocket: shiprocketEnabled() } });
}));

/** Local delivery: tell the customer their order is with the delivery agent (WhatsApp + email). */
r.post('/orders/:id/out-for-delivery', ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { address: true, user: true, payments: true } });
  if (!o) throw notFound('Order');
  const cod = o.paymentMethod === 'COD' && !o.payments.some((p) => p.status === 'COD_COLLECTED');
  await prisma.trackingUpdate.create({ data: { orderId: o.id, source: 'shop', message: 'Out for delivery with our delivery partner', at: new Date() } }).catch(() => {});
  void notifyOrderUpdate({ phone: o.address.phone, email: o.user.email, name: o.user.name, orderNumber: o.orderNumber, headline: 'Out for delivery',
    detail: cod ? `Please keep ${'\u20B9'}${Math.round(o.total / 100)} ready in cash. Our delivery partner will call you.` : 'Our delivery partner will call you before arriving.' });
  res.json({ ok: true });
}));

r.post('/orders/:id/status', validate(z.object({ status: z.nativeEnum(OrderStatus), note: z.string().max(300).optional() })),
  ah(async (req, res) => {
    res.json(await transition(req.params.id, req.body.status, { actorId: req.user!.id, note: req.body.note }));
  }));

/** Manual UPI: the shop checked its bank app and the money arrived. */
r.post('/orders/:id/confirm-payment', adminOnly, ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payments: { orderBy: { createdAt: 'desc' } } } });
  if (!o) throw notFound('Order');
  if (o.status !== 'PAYMENT_PENDING') throw badRequest('NOT_PENDING', 'This order is not waiting for payment');
  const pay = o.payments[0];
  if (pay) await prisma.payment.update({ where: { id: pay.id }, data: { status: 'CAPTURED' } });
  else await prisma.payment.create({ data: { orderId: o.id, method: o.paymentMethod, status: 'CAPTURED', amount: o.total } });
  res.json(await transition(o.id, 'PLACED', { actorId: req.user!.id, note: `Payment confirmed${pay?.utr ? ' · UTR ' + pay.utr : ''}` }));
}));

/** Manual UPI: payment not found. The customer is asked to check and resubmit. */
r.post('/orders/:id/reject-payment', adminOnly, validate(z.object({ reason: z.string().min(3).max(200) })), ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payments: { orderBy: { createdAt: 'desc' } }, user: true, address: true } });
  if (!o || o.status !== 'PAYMENT_PENDING') throw badRequest('NOT_PENDING', 'This order is not waiting for payment');
  const pay = o.payments[0];
  if (pay) await prisma.payment.update({ where: { id: pay.id }, data: { status: 'FAILED', failureReason: req.body.reason } });
  // Give the customer 24 hours to fix it before the order is released.
  await prisma.order.update({ where: { id: o.id }, data: { holdExpiresAt: new Date(Date.now() + 24 * 3600_000), paymentReminderAt: new Date() } });
  void notifyOrderUpdate({ phone: o.address.phone, email: o.user.email, name: o.user.name, orderNumber: o.orderNumber,
    headline: 'Payment not received', detail: `${req.body.reason}. Please pay again from the order page in the Lensio app within 24 hours to keep your order.` });
  res.json({ ok: true });
}));

/**
 * Manual courier & tracking updates (for couriers without Shiprocket, or local delivery).
 * Customers see them live on their order screen and get an email.
 */
r.post('/orders/:id/tracking', validate(z.object({
  message: z.string().trim().min(2).max(200),
  location: z.string().trim().max(100).optional(),
  courierName: z.string().trim().max(60).optional(),
  awbCode: z.string().trim().max(60).optional(),
  trackingUrl: z.string().trim().url().optional().or(z.literal('')),
  notify: z.boolean().default(true),
})), ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { user: true, address: true } });
  if (!o) throw notFound('Order');
  const { message, location, courierName, awbCode, trackingUrl, notify } = req.body;
  await prisma.$transaction([
    prisma.trackingUpdate.create({ data: { orderId: o.id, message, location: location || null, source: 'shop' } }),
    prisma.order.update({ where: { id: o.id }, data: {
      courierName: courierName || undefined, awbCode: awbCode || undefined, trackingUrl: trackingUrl || undefined } }),
  ]);
  if (notify) {
    void notifyOrderUpdate({ phone: o.address.phone, email: o.user.email, name: o.user.name, orderNumber: o.orderNumber,
      headline: message, detail: `${location ? `Location: ${location}. ` : ''}${trackingUrl ? `Track it: ${trackingUrl}` : 'Track it live in the Lensio app.'}` });
  }
  res.status(201).json(await prisma.trackingUpdate.findMany({ where: { orderId: o.id }, orderBy: { at: 'desc' } }));
}));

r.delete('/orders/:id/tracking/:updateId', adminOnly, ah(async (req, res) => {
  await prisma.trackingUpdate.deleteMany({ where: { id: req.params.updateId, orderId: req.params.id } });
  res.status(204).end();
}));

/** COD reconciliation once the courier remits cash. */
r.post('/orders/:id/cod-collected', adminOnly, ah(async (req, res) => {
  const u = await prisma.payment.updateMany({ where: { orderId: req.params.id, status: 'COD_PENDING' }, data: { status: 'COD_COLLECTED' } });
  if (!u.count) throw badRequest('NO_COD', 'No pending COD payment on this order');
  res.json({ ok: true });
}));

// ---------- Prescription review (optician) ----------
r.get('/prescriptions/queue', ah(async (_req, res) => {
  const list = await prisma.prescription.findMany({
    where: { status: 'PENDING_REVIEW', orderItems: { some: {} } }, orderBy: { createdAt: 'asc' }, take: 50,
    include: { user: { select: { name: true, phone: true, email: true } }, orderItems: { include: { order: { select: { orderNumber: true, id: true } }, lensPackage: true } } },
  });
  res.json(await Promise.all(list.map(async (p) => ({ ...p, imageUrl: p.imageKey ? await signedUrl(p.imageKey, 1800) : null }))));
}));

const num = z.coerce.number().nullable().optional();
const eye = z.object({ sph: num, cyl: num, axis: z.coerce.number().int().nullable().optional(), add: num, near: num });

/** Optician reads the uploaded image (or double-checks manual entry), records values, then verifies or rejects. */
r.post('/prescriptions/:id/review', validate(z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  note: z.string().max(300).optional(),
  values: z.object({ od: eye, os: eye, pdTotal: num, pdRight: num, pdLeft: num }).optional(),
})), ah(async (req, res) => {
  const p = await prisma.prescription.findUnique({ where: { id: req.params.id }, include: { user: true, orderItems: { include: { lensPackage: true, order: { include: { address: true } } } } } });
  if (!p) throw notFound('Prescription');
  const data: Prisma.PrescriptionUpdateInput = {
    status: req.body.decision as PrescriptionStatus, reviewNote: req.body.note, reviewedById: req.user!.id, reviewedAt: new Date(),
  };
  if (req.body.decision === 'VERIFIED') {
    const lensType = p.orderItems[0]?.lensPackage?.lensType ?? null;
    const values = req.body.values ?? {
      od: { sph: p.odSph && Number(p.odSph), cyl: p.odCyl && Number(p.odCyl), axis: p.odAxis, add: p.odAdd && Number(p.odAdd), near: p.odNear && Number(p.odNear) },
      os: { sph: p.osSph && Number(p.osSph), cyl: p.osCyl && Number(p.osCyl), axis: p.osAxis, add: p.osAdd && Number(p.osAdd), near: p.osNear && Number(p.osNear) },
      pdTotal: p.pdTotal && Number(p.pdTotal), pdRight: p.pdRight && Number(p.pdRight), pdLeft: p.pdLeft && Number(p.pdLeft),
    };
    const v = validatePrescription(values, lensType);
    if (v.errors.length) throw badRequest('INVALID_PRESCRIPTION', 'Values do not pass validation', v);
    const n = v.normalized; const d = (x?: number | null) => (x == null ? null : new Prisma.Decimal(x));
    Object.assign(data, {
      odSph: d(n.od.sph), odCyl: d(n.od.cyl), odAxis: n.od.axis ?? null, odAdd: d(n.od.add),
      osSph: d(n.os.sph), osCyl: d(n.os.cyl), osAxis: n.os.axis ?? null, osAdd: d(n.os.add),
      pdTotal: d(n.pdTotal), pdRight: d(n.pdRight), pdLeft: d(n.pdLeft), isHighPower: v.isHighPower,
    });
  }
  const updated = await prisma.prescription.update({ where: { id: p.id }, data });
  if (req.body.decision === 'REJECTED') {
    const o = p.orderItems.map((i) => i.order).find((x) => x.status !== 'CANCELLED');
    const phone = o?.address.phone ?? p.user.phone;
    void notifyOrderUpdate({ phone, email: p.user.email, name: p.user.name, orderNumber: o?.orderNumber ?? 'with us',
      headline: 'Prescription needs a new copy', detail: `${req.body.note ? req.body.note + '. ' : ''}Please upload a clear photo of your prescription in the Lensio app.` });
  }

  // Auto-advance any orders whose prescriptions are now all verified.
  if (req.body.decision === 'VERIFIED') {
    const orderIds = [...new Set(p.orderItems.map((i) => i.orderId))];
    for (const oid of orderIds) {
      await transition(oid, 'PRESCRIPTION_VERIFIED', { actorId: req.user!.id }).catch(() => undefined);
    }
  }
  res.json(updated);
}));

// ---------- Catalog management ----------
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(badRequest('BAD_FILE_TYPE', 'Upload a JPG, PNG or WebP image'));
  },
});

/** Upload one product photo or try-on PNG. Returns its public URL to put in the product. */
/** Banner videos: MP4 or WebM, up to 25 MB (short, silent loops). */
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['video/mp4', 'video/webm'].includes(file.mimetype)) cb(null, true);
    else cb(badRequest('BAD_FILE_TYPE', 'Upload an MP4 or WebM video'));
  },
});
r.post('/uploads/video', adminOnly, videoUpload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('NO_FILE', 'Choose a video to upload');
  res.status(201).json({ url: await putPublicFile('banners', req.file.buffer, req.file.mimetype) });
}));

/** Banner audio: MP3 / M4A / AAC / OGG, up to 10 MB. */
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg'].includes(file.mimetype)) cb(null, true);
    else cb(badRequest('BAD_FILE_TYPE', 'Upload an MP3, M4A, AAC or OGG audio file'));
  },
});
r.post('/uploads/audio', adminOnly, audioUpload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('NO_FILE', 'Choose an audio file to upload');
  res.status(201).json({ url: await putPublicFile('banners', req.file.buffer, req.file.mimetype) });
}));

r.post('/uploads', adminOnly, imageUpload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('NO_FILE', 'Choose an image to upload');
  const folder = req.body.kind === 'tryon' ? 'tryon' : req.body.kind === 'settings' ? 'settings' : req.body.kind === 'banners' ? 'banners' : req.body.kind === 'models' ? 'models' : 'products';
  res.status(201).json({ url: await putPublicFile(folder, req.file.buffer, req.file.mimetype) });
}));

const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().min(1).max(60),
  colorName: z.string().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must look like #1B1B1F'),
  size: z.nativeEnum(FrameSize),
  stock: z.number().int().min(0),
  priceDelta: z.number().int().default(0),
});
const productSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
  name: z.string().min(2).max(80), brand: z.string().default('Lensio'), description: z.string().min(1),
  shape: z.nativeEnum(FrameShape), material: z.nativeEnum(FrameMaterial), gender: z.nativeEnum(Gender),
  isSunglasses: z.boolean().default(false),
  basePrice: z.number().int().positive(), mrp: z.number().int().positive(),
  lensWidthMm: z.number().int().min(30).max(70), bridgeMm: z.number().int().min(10).max(30),
  templeMm: z.number().int().min(110).max(160), frameWidthMm: z.number().int().min(100).max(170),
  weightGrams: z.number().int().nullable().optional(), tryOnImage: z.string().url().nullable().optional(),
  tryOn3d: z.object({
    url: z.string().url().refine((u) => /^https:\/\//.test(u) && /\.(glb|gltf)(\?|$)/i.test(u), 'Use an https link to a .glb or .gltf file'),
    scale: z.number().min(0.2).max(5).default(1), offsetY: z.number().min(-40).max(40).default(0),
    offsetZ: z.number().min(-40).max(40).default(0), rotX: z.number().min(-45).max(45).default(0),
  }).nullable().optional().transform((v) => (v === null ? Prisma.DbNull : v)),   // null = remove the model
  instagramPostUrl: z.string().url().nullable().optional().or(z.literal('').transform(() => null)),
  isActive: z.boolean().default(true),
  images: z.array(z.string().url()).default([]),
  variants: z.array(variantSchema).min(1, 'Add at least one colour'),
}).refine((p) => p.mrp >= p.basePrice, { message: 'MRP must be at least the selling price', path: ['mrp'] });

r.get('/products', ah(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(await prisma.product.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q } }, { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } }] } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { colorName: 'asc' } } },
  }));
}));

/** Banners: home carousel, managed in admin → Banners. */
r.get('/banners', adminOnly, ah(async (_req, res) => { res.json(await getBanners()); }));
r.put('/banners', adminOnly, validate(z.object({ banners: z.array(bannerSchema).max(20) })), ah(async (req, res) => { res.json(await saveBanners(req.body.banners)); }));

/** Frames → "Show all hidden frames": publish every hidden frame, optionally giving out-of-stock colours a stock. */
r.post('/products/show-hidden', adminOnly, validate(z.object({ stock: z.number().int().min(0).max(100000).optional() })), ah(async (req, res) => {
  const hidden = await prisma.product.findMany({ where: { isActive: false }, select: { id: true } });
  const ids = hidden.map((p) => p.id);
  if (!ids.length) return res.json({ shown: 0, restocked: 0 });
  const [shown, restocked] = await prisma.$transaction([
    prisma.product.updateMany({ where: { id: { in: ids } }, data: { isActive: true } }),
    req.body.stock ? prisma.frameVariant.updateMany({ where: { productId: { in: ids }, stock: 0 }, data: { stock: req.body.stock } }) : prisma.frameVariant.updateMany({ where: { id: '__none__' }, data: {} }),
  ]);
  res.json({ shown: shown.count, restocked: restocked.count });
}));

r.get('/products/:id', ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id }, include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true } });
  if (!p) throw notFound('Product');
  res.json(p);
}));

/** No double entries: the same frame name (and brand) can exist only once. */
async function assertNoDuplicate(name: string, brand: string, exceptId?: string) {
  const dup = await prisma.product.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' }, brand: { equals: (brand || 'Lensio').trim(), mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true },
  });
  if (dup) throw new AppError(409, 'DUPLICATE_FRAME', `A frame named "${dup.name}" already exists. Edit that frame instead, or use a different name.`, { existingId: dup.id });
}

/**
 * Deletes a frame completely. A frame that appears in past orders can't be removed (those orders must keep
 * their details), so it is hidden and its stock set to 0 instead.
 */
async function deleteFrame(id: string): Promise<'deleted' | 'hidden' | 'missing'> {
  const p = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!p) return 'missing';
  const ordered = await prisma.orderItem.count({ where: { variant: { productId: id } } });
  if (ordered) {
    await prisma.$transaction([
      prisma.product.update({ where: { id }, data: { isActive: false } }),
      prisma.frameVariant.updateMany({ where: { productId: id }, data: { stock: 0 } }),
    ]);
    return 'hidden';
  }
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { variant: { productId: id } } }),
    prisma.product.delete({ where: { id } }),            // colours, photos, reviews, wishlists go with it
  ]);
  return 'deleted';
}

r.delete('/products/:id', adminOnly, ah(async (req, res) => {
  const r2 = await deleteFrame(req.params.id);
  if (r2 === 'missing') throw notFound('Frame');
  res.json({ result: r2 });
}));

/** Frames list → tick several frames → Show / Hide / Set stock / Delete. */
r.post('/products/bulk', adminOnly, validate(z.object({
  ids: z.array(z.string()).min(1).max(2000), action: z.enum(['show', 'hide', 'stock', 'delete']), stock: z.number().int().min(0).max(100000).optional(),
})), ah(async (req, res) => {
  const { ids, action, stock } = req.body as { ids: string[]; action: string; stock?: number };
  if (action === 'show' || action === 'hide') {
    const r2 = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { isActive: action === 'show' } });
    return res.json({ updated: r2.count });
  }
  if (action === 'stock') {
    if (stock === undefined) throw badRequest('STOCK_MISSING', 'Enter the stock for each colour');
    const r2 = await prisma.frameVariant.updateMany({ where: { productId: { in: ids } }, data: { stock } });
    return res.json({ updated: r2.count });
  }
  let deleted = 0, hidden = 0;
  for (const id of ids) { const r2 = await deleteFrame(id); if (r2 === 'deleted') deleted++; else if (r2 === 'hidden') hidden++; }
  res.json({ deleted, hidden });
}));

r.post('/products', adminOnly, validate(productSchema), ah(async (req, res) => {
  const { images, variants, ...p } = req.body as z.infer<typeof productSchema>;
  await assertNoDuplicate(p.name, p.brand);
  res.status(201).json(await prisma.product.create({
    data: { ...p, images: { create: images.map((url, i) => ({ url, sortOrder: i })) }, variants: { create: variants.map(({ id: _id, ...v }) => v) } },
    include: { variants: true, images: true },
  }));
}));

/** Full save from the admin form: fields, photo order, and colours (added, edited or removed). */
r.put('/products/:id', adminOnly, validate(productSchema), ah(async (req, res) => {
  const { images, variants, ...p } = req.body as z.infer<typeof productSchema>;
  const existing = await prisma.product.findUnique({ where: { id: req.params.id }, include: { variants: true } });
  if (!existing) throw notFound('Product');
  await assertNoDuplicate(p.name, p.brand, existing.id);
  const keep = new Set(variants.filter((v) => v.id).map((v) => v.id));
  const removed = existing.variants.filter((v) => !keep.has(v.id));

  const saved = await prisma.$transaction(async (tx) => {
    for (const v of removed) {
      const used = await tx.orderItem.count({ where: { variantId: v.id } });
      if (used) await tx.frameVariant.update({ where: { id: v.id }, data: { stock: 0 } }); // keep for order history
      else { await tx.cartItem.deleteMany({ where: { variantId: v.id } }); await tx.frameVariant.delete({ where: { id: v.id } }); }
    }
    for (const { id, ...v } of variants) {
      if (id) await tx.frameVariant.update({ where: { id }, data: v });
      else await tx.frameVariant.create({ data: { ...v, productId: existing.id } });
    }
    await tx.productImage.deleteMany({ where: { productId: existing.id } });
    await tx.productImage.createMany({ data: images.map((url, i) => ({ productId: existing.id, url, sortOrder: i })) });
    return tx.product.update({ where: { id: existing.id }, data: p, include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } } });
  });
  res.json(saved);
}));

r.patch('/products/:id', adminOnly, validate(z.object({ isActive: z.boolean() })), ah(async (req, res) => {
  res.json(await prisma.product.update({ where: { id: req.params.id }, data: req.body }));
}));

/** Frames list → edit stock of every colour of one frame in one go. */
r.put('/products/:id/stock', adminOnly, validate(z.object({ stocks: z.array(z.object({ id: z.string(), stock: z.number().int().min(0).max(100000) })).min(1).max(200) })), ah(async (req, res) => {
  const ids = (await prisma.frameVariant.findMany({ where: { productId: req.params.id }, select: { id: true } })).map((v) => v.id);
  const updates = (req.body.stocks as { id: string; stock: number }[]).filter((x) => ids.includes(x.id));
  await prisma.$transaction(updates.map((x) => prisma.frameVariant.update({ where: { id: x.id }, data: { stock: x.stock } })));
  res.json(await prisma.product.findUnique({ where: { id: req.params.id }, include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { colorName: 'asc' } } } }));
}));

r.patch('/variants/:id/stock', adminOnly, validate(z.object({ stock: z.number().int().min(0) })), ah(async (req, res) => {
  res.json(await prisma.frameVariant.update({ where: { id: req.params.id }, data: { stock: req.body.stock } }));
}));

// ---------- Lens & coating prices ----------
r.get('/pricing', ah(async (_req, res) => {
  const [lensPackages, coatings, coupons] = await Promise.all([
    prisma.lensPackage.findMany({ orderBy: [{ lensType: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.coating.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.coupon.findMany({ orderBy: { code: 'asc' } }),
  ]);
  res.json({ lensPackages, coatings, coupons });
}));

r.patch('/lens-packages/:id', adminOnly, validate(z.object({
  name: z.string().min(2).optional(), description: z.string().optional(),
  price: z.number().int().min(0).optional(), isActive: z.boolean().optional(),
})), ah(async (req, res) => {
  res.json(await prisma.lensPackage.update({ where: { id: req.params.id }, data: req.body }));
}));

r.patch('/coatings/:id', adminOnly, validate(z.object({
  name: z.string().min(2).optional(), description: z.string().optional(),
  price: z.number().int().min(0).optional(), isActive: z.boolean().optional(),
})), ah(async (req, res) => {
  res.json(await prisma.coating.update({ where: { id: req.params.id }, data: req.body }));
}));

r.patch('/coupons/:id', adminOnly, validate(z.object({ isActive: z.boolean() })), ah(async (req, res) => {
  res.json(await prisma.coupon.update({ where: { id: req.params.id }, data: req.body }));
}));

r.post('/coupons', adminOnly, validate(z.object({
  code: z.string().min(3).max(30).transform((s) => s.toUpperCase()), description: z.string(),
  percentOff: z.number().int().min(1).max(100).optional(), flatOff: z.number().int().positive().optional(),
  maxDiscount: z.number().int().optional(), minOrderValue: z.number().int().default(0),
  firstOrderOnly: z.boolean().default(false), requiresLens: z.boolean().default(false),
  usageLimit: z.number().int().optional(), perUserLimit: z.number().int().default(1), validTo: z.coerce.date().optional(),
}).refine((c) => !!c.percentOff !== !!c.flatOff, 'Set either percentOff or flatOff')), ah(async (req, res) => {
  res.status(201).json(await prisma.coupon.create({ data: req.body }));
}));

// ---------- Shop settings ----------
r.get('/settings', ah(async (_req, res) => { res.json(await getSettings()); }));
/** Settings → "Test AI keys" for Ask Lensio. */
r.post('/assistant/test', ah(async (_req, res) => { res.json({ keys: await testGeminiKeys() }); }));

/** Settings → "Send test email": checks the email service and where order alerts go. */
r.post('/settings/test-email', adminOnly, ah(async (_req, res) => {
  const s = await getSettings();
  const to = alertRecipients(s.alertEmails);
  const configured = mailEnabled();
  if (!configured || !to.length) return res.json({ configured, recipients: to, sent: [] as string[], failed: [] as string[] });
  const results = await Promise.all(to.map(async (addr) => ({ addr, ok: await sendMail(addr, '✅ Lensio test email', 'This is a test from your Lensio admin panel. New-order alerts will arrive at this address.') })));
  res.json({ configured, recipients: to, sent: results.filter((r) => r.ok).map((r) => r.addr), failed: results.filter((r) => !r.ok).map((r) => r.addr), alertsOn: s.ownerEmailAlerts });
}));

/** Frames → Bulk import: thousands of frames / lenses / coatings from a CSV. dryRun = "Check file" only. */
r.get('/import/template/:kind', adminOnly, ah(async (req, res) => {
  const kind = req.params.kind as Kind;
  if (!TEMPLATES[kind]) throw badRequest('BAD_KIND', 'Choose frames, lenses or coatings');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="lensio-${kind}-template.csv"` }).send('\uFEFF' + TEMPLATES[kind]);
}));
r.post('/import/:kind', adminOnly, validate(z.object({
  csv: z.string().min(1).max(15_000_000), dryRun: z.boolean().default(true),
  showAll: z.boolean().optional(), defaultStock: z.number().int().min(0).max(100000).optional(),
  onExisting: z.enum(['replace', 'both', 'skip']).optional(),
  choices: z.record(z.enum(['replace', 'both', 'skip'])).optional(),
})), ah(async (req, res) => {
  const kind = req.params.kind as Kind;
  if (!TEMPLATES[kind]) throw badRequest('BAD_KIND', 'Choose frames, lenses or coatings');
  const { showAll, defaultStock, onExisting, choices } = req.body;
  res.json(await importCatalog(kind, req.body.csv, req.body.dryRun, { showAll, defaultStock, onExisting, choices }));
}));
/** What customers get right now: the automatic GitHub release (or the admin fallback), for the settings page. */
r.get('/app-release', adminOnly, ah(async (_req, res) => { res.json(await androidRelease()); }));

r.put('/settings', adminOnly, validate(z.object({
  upiId: z.string().trim().regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/, 'A UPI ID looks like name@okaxis').nullable().optional().or(z.literal('').transform(() => null)),
  upiPayeeName: z.string().trim().min(2).max(50).optional(),
  upiQrImage: z.string().url().nullable().optional(),
  codEnabled: z.boolean().optional(),
  androidApkUrl: z.string().trim().url('Paste the full link, starting with https://').nullable().optional().or(z.literal('').transform(() => null)),
  shopInfo: z.string().max(4000).nullable().optional(),
  instagramUrl: z.string().trim().url('Paste your full Instagram link').nullable().optional().or(z.literal('').transform(() => null)),
  ownerEmailAlerts: z.boolean().optional(), autoStartLensWork: z.boolean().optional(),
  autoApproveTypedRx: z.boolean().optional(), frameOnlyToQc: z.boolean().optional(), eyeTestEnabled: z.boolean().optional(), storesEnabled: z.boolean().optional(),
  bannerShapeDesktop: z.string().trim().refine(validShape, 'Banner shape: width:height between 1:2 and 4:1, e.g. 16:9 or 1920:1080').optional(),
  bannerShapeMobile: z.string().trim().refine(validShape, 'Banner shape: width:height between 1:2 and 4:1, e.g. 16:9 or 1080:1080').optional(),
  tryOn2d: z.boolean().optional(), tryOn3d: z.boolean().optional(), assistantEnabled: z.boolean().optional(),
  alertEmails: z.string().trim().max(500).refine((v) => !v || v.split(',').map((e) => e.trim()).filter(Boolean).every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)), 'Enter email addresses separated by commas').optional(),
  androidLatestVersion: z.string().trim().regex(/^\d+\.\d+\.\d+$/, 'Version looks like 1.0.1').nullable().optional().or(z.literal('').transform(() => null)),
  androidMinVersion: z.string().trim().regex(/^\d+\.\d+\.\d+$/, 'Minimum version looks like 1.0.1').nullable().optional().or(z.literal('').transform(() => null)),
  androidUpdateNotes: z.string().trim().max(600).nullable().optional().or(z.literal('').transform(() => null)),
  androidReleaseRepo: z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/, 'Type it like Suhas0312/lensio-app').nullable().optional().or(z.literal('').transform(() => null)),
  loyaltyEnabled: z.boolean().optional(), loyaltyPointsPer100: z.number().int().min(0).max(1000).optional(),
  loyaltyMaxRedeemPercent: z.number().int().min(0).max(100).optional(), reviewsAutoApprove: z.boolean().optional(),
})), ah(async (req, res) => { res.json(await saveSettings(req.body)); }));

// ---------- Reviews (moderation) ----------
r.get('/reviews', ah(async (req, res) => {
  const status = req.query.status as string | undefined;
  res.json(await prisma.review.findMany({
    where: status ? { status: status as any } : undefined, orderBy: { createdAt: 'desc' }, take: 100,
    include: { user: { select: { name: true, email: true } }, product: { select: { name: true, slug: true } } },
  }));
}));

r.post('/reviews/:id/moderate', adminOnly, validate(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().max(300).optional() })), ah(async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!review) throw notFound('Review');
  const updated = await prisma.review.update({ where: { id: review.id }, data: { status: req.body.decision, moderatorNote: req.body.note } });
  await recomputeProductRating(review.productId);
  res.json(updated);
}));

r.delete('/reviews/:id', adminOnly, ah(async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!review) throw notFound('Review');
  await prisma.review.delete({ where: { id: review.id } });
  await recomputeProductRating(review.productId);
  res.status(204).end();
}));

// ---------- Loyalty: manual point adjustments ----------
r.post('/loyalty/adjust', adminOnly, validate(z.object({ email: z.string().email(), points: z.number().int(), note: z.string().max(200).optional() })), ah(async (req, res) => {
  const user = await prisma.user.findFirst({ where: { email: req.body.email.toLowerCase() } });
  if (!user) throw notFound('Customer');
  if (req.body.points > 0) await creditPoints(prisma, user.id, req.body.points, 'ADMIN_ADJUST', undefined, req.body.note);
  else if (req.body.points < 0) await debitPoints(prisma, user.id, -req.body.points, undefined, req.body.note, 'ADMIN_ADJUST');
  res.json(await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, name: true, pointsBalance: true } }));
}));

// ---------- Gift cards ----------
r.get('/giftcards', adminOnly, ah(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(await prisma.giftCard.findMany({
    where: q ? { code: { contains: q.toUpperCase() } } : undefined, orderBy: { createdAt: 'desc' }, take: 100,
  }));
}));

r.post('/giftcards', adminOnly, validate(z.object({
  valueRupees: z.number().positive(), purchaserName: z.string().max(80).optional(), purchaserEmail: z.string().email().optional(),
  recipientEmail: z.string().email().optional(), message: z.string().max(300).optional(), expiresAt: z.coerce.date().optional(),
})), ah(async (req, res) => {
  const { valueRupees, ...rest } = req.body;
  res.status(201).json(await issueGiftCard(Math.round(valueRupees * 100), rest));
}));

r.patch('/giftcards/:id', adminOnly, validate(z.object({ isActive: z.boolean() })), ah(async (req, res) => {
  res.json(await prisma.giftCard.update({ where: { id: req.params.id }, data: req.body }));
}));

// ---------- Store locations ----------
r.get('/stores', ah(async (_req, res) => { res.json(await prisma.store.findMany({ orderBy: { sortOrder: 'asc' } })); }));

const storeSchema = z.object({
  name: z.string().min(1).max(100), addressLine: z.string().min(3).max(300), city: z.string().min(1).max(60),
  state: z.string().min(1).max(60), pincode: z.string().regex(/^[1-9]\d{5}$/), phone: z.string().max(20).optional(),
  latitude: z.number().optional(), longitude: z.number().optional(), hours: z.string().max(200).optional(),
  isActive: z.boolean().default(true), sortOrder: z.number().int().default(0),
});
r.post('/stores', adminOnly, validate(storeSchema), ah(async (req, res) => { res.status(201).json(await prisma.store.create({ data: req.body })); }));
r.put('/stores/:id', adminOnly, validate(storeSchema), ah(async (req, res) => { res.json(await prisma.store.update({ where: { id: req.params.id }, data: req.body })); }));
r.delete('/stores/:id', adminOnly, ah(async (req, res) => { await prisma.store.delete({ where: { id: req.params.id } }); res.status(204).end(); }));

// ---------- Home eye-test requests ----------
r.get('/eye-test', ah(async (req, res) => {
  const status = req.query.status as string | undefined;
  res.json(await prisma.eyeTestRequest.findMany({
    where: status ? { status: status as any } : { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 100,
    include: { user: { select: { email: true } } },
  }));
}));

r.post('/eye-test/:id', adminOnly, validate(z.object({
  status: z.enum(['REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
  scheduledFor: z.coerce.date().optional(), staffNote: z.string().max(500).optional(),
})), ah(async (req, res) => {
  const row = await prisma.eyeTestRequest.findUnique({ where: { id: req.params.id }, include: { user: { select: { email: true } } } });
  if (!row) throw notFound('Request');
  const updated = await prisma.eyeTestRequest.update({ where: { id: row.id }, data: req.body });
  const changedTime = req.body.scheduledFor && +new Date(req.body.scheduledFor) !== +(row.scheduledFor ?? 0);
  if ((req.body.status && req.body.status !== row.status) || changedTime) {
    const when = updated.scheduledFor ? updated.scheduledFor.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    const msg = updated.status === 'SCHEDULED' ? { h: `Confirmed for ${when || 'your chosen slot'}`, d: 'Our optometrist will call before arriving.' }
      : updated.status === 'COMPLETED' ? { h: 'Completed', d: 'Your prescription is saved in the Lensio app. Thank you!' }
      : updated.status === 'CANCELLED' ? { h: 'Cancelled', d: 'Book again any time from the Lensio app.' } : null;
    if (msg) void notifyEyeTest({ phone: updated.phone, email: row.user?.email, name: updated.fullName, headline: msg.h, detail: msg.d });
  }
  res.json(updated);
}));

// ---------- Instagram import ----------
r.post('/instagram/parse', validate(z.object({ caption: z.string().max(5000) })), ah(async (req, res) => { res.json(parseCaption(req.body.caption)); }));
r.get('/instagram/status', adminOnly, ah(async (_req, res) => { res.json(await connectionStatus()); }));
r.put('/instagram/token', adminOnly, validate(z.object({ token: z.string().min(10).max(1000) })), ah(async (req, res) => { res.json(await igSaveToken(req.body.token)); }));
r.delete('/instagram/token', adminOnly, ah(async (_req, res) => { await igDisconnect(); res.status(204).end(); }));
r.get('/instagram/posts', adminOnly, ah(async (req, res) => { res.json(await listPosts(typeof req.query.after === 'string' ? req.query.after : undefined)); }));
r.post('/instagram/import', adminOnly, validate(z.object({ items: z.array(z.object({
  id: z.string().regex(/^\d+$/), name: z.string().trim().min(2).max(80), price: z.number().positive(), mrp: z.number().positive().nullable().optional(),
  shape: z.nativeEnum(FrameShape), gender: z.nativeEnum(Gender), sunglasses: z.boolean(), stock: z.number().int().min(0).max(10000),
})).min(1).max(20) })), ah(async (req, res) => { res.json(await importPosts(req.body.items)); }));

export default r;
