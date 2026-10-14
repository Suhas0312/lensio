import { Router } from 'express';
import { z } from 'zod';
import { PaymentMethod, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { signedUrl } from '../../lib/storage';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { assertCheckoutable, buildQuote } from '../cart/quote.service';
import { createRazorpayOrder } from '../payments/razorpay.service';
import { sendMail } from '../../lib/mail';
import { notifyOrderStatus, sendTemplate, STATUS_LABEL } from '../notifications/whatsapp.service';
import { lensNeedsRx } from '../lens/pricing';
import { getSettings, upiManualAvailable, upiPaymentInfo } from '../settings/settings.service';
import multer from 'multer';
import { putPrivateFile } from '../../lib/storage';
import { estimateDelivery } from './tracking';
import { alertOwner } from '../notifications/owner.service';
import { whatsappEnabled } from '../notifications/whatsapp.service';
import { smsEnabled } from '../auth/otp.service';
import { onOrderPlaced, runAutomation, CUSTOMER_CANCELLABLE, newOrderNumber, orderInclude, TRACK_STAGES, transition } from './orders.service';
import { debitPoints, pointsForSubtotal } from '../loyalty/points.service';
import { redeemGiftCard } from '../loyalty/giftcard.service';

const r = Router();
r.use(requireAuth);

/** How long an unpaid manual-UPI order keeps its stock before auto-cancelling (only if no UTR was submitted). */
const UPI_MANUAL_HOLD_MINUTES = 6 * 60;

const proofUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.mimetype)) cb(null, true);
    else cb(badRequest('BAD_FILE_TYPE', 'Attach a screenshot (JPG or PNG)'));
  },
});

const checkoutSchema = z.object({
  addressId: z.string(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  couponCode: z.string().max(30).nullable().optional(),
  giftCardCode: z.string().max(30).nullable().optional(),
  usePoints: z.boolean().default(false),
});

r.post('/checkout', validate(checkoutSchema), ah(async (req, res) => {
  const b = req.body as z.infer<typeof checkoutSchema>;
  const userId = req.user!.id;
  const address = await prisma.address.findFirst({ where: { id: b.addressId, userId } });
  if (!address) throw notFound('Address');
  // Delivery agents need a number to call: older accounts without one take the delivery number.
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (me && !me.phone && !(await prisma.user.findUnique({ where: { phone: address.phone } }))) {
    await prisma.user.update({ where: { id: userId }, data: { phone: address.phone } }).catch(() => {});
  }
  const isCod = b.paymentMethod === 'COD';
  // Anti-fraud: cash on delivery needs a verified mobile number (when WhatsApp/SMS codes are set up),
  // so fake or prank COD orders can't be placed with made-up numbers.
  if (isCod && (whatsappEnabled() || smsEnabled())) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { phoneVerified: true } });
    if (!me?.phoneVerified) throw badRequest('PHONE_NOT_VERIFIED', 'To pay cash on delivery, verify your mobile number first (Account → Mobile number). Or pay by UPI.');
  }
  const isUpiManual = b.paymentMethod === 'UPI_MANUAL';
  const settings = await getSettings();
  if (isCod && !settings.codEnabled) throw badRequest('COD_OFF', 'Cash on Delivery is not available right now. Pay by UPI instead.');
  if (isUpiManual && !upiManualAvailable(settings)) throw badRequest('UPI_OFF', 'UPI payment is not set up yet. Choose another way to pay.');

  const order = await prisma.$transaction(async (tx) => {
    // Serialise checkouts per user so a double-tap cannot create two orders.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const q = await buildQuote(tx, userId, {
      couponCode: b.couponCode, paymentMethod: b.paymentMethod, giftCardCode: b.giftCardCode, usePoints: b.usePoints,
    });
    assertCheckoutable(q);
    if (b.couponCode && q.couponError) throw badRequest('COUPON', q.couponError);
    if (b.giftCardCode && q.giftCardError) throw badRequest('GIFTCARD', q.giftCardError);
    if (isCod && !q.codAvailable) throw badRequest('COD_UNAVAILABLE', 'Cash on Delivery is available for orders up to ₹10,000. Pay online instead.');

    // Atomic stock reservation: fails if someone else bought the last unit.
    for (const l of q.lines) {
      const u = await tx.frameVariant.updateMany({ where: { id: l.variantId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
      if (u.count === 0) throw conflict('OUT_OF_STOCK', `${l.variant.product.name} (${l.variant.colorName}) just went out of stock`);
    }

    // Points are earned on what was actually paid for goods: subtotal after coupon, minus wallet used.
    const earnBase = Math.max(0, q.subtotal - q.discount - q.pointsAppliedPaise - q.giftCardApplied);
    const pointsEarned = await pointsForSubtotal(earnBase);

    // Points/gift card can cover the whole order: then nothing is left to pay and it's placed straight away.
    const covered = q.total === 0;
    const placedNow = isCod || covered;
    const created = await tx.order.create({
      data: {
        orderNumber: newOrderNumber(), userId, addressId: address.id,
        shippingSnapshot: address as unknown as Prisma.InputJsonValue,
        status: placedNow ? 'PLACED' : 'PAYMENT_PENDING',
        paymentMethod: b.paymentMethod,
        subtotal: q.subtotal, discount: q.discount, shippingFee: q.shippingFee, codFee: q.codFee, total: q.total,
        pointsUsed: q.pointsAppliedPaise, giftCardUsed: q.giftCardApplied, pointsEarned,
        couponCode: q.couponCode, needsPrescription: q.needsPrescription,
        holdExpiresAt: placedNow ? null : new Date(Date.now() + (isUpiManual ? UPI_MANUAL_HOLD_MINUTES : env.PAYMENT_HOLD_MINUTES) * 60_000),
        items: {
          create: q.lines.map((l) => ({
            variantId: l.variantId, lensPackageId: l.lensPackageId, prescriptionId: l.prescriptionId, coatingCodes: l.coatingCodes,
            productName: l.variant.product.name, variantLabel: `${l.variant.colorName} · ${l.variant.size}`,
            framePrice: l.price.framePrice, lensPrice: l.price.lensPrice, coatingPrice: l.price.coatingPrice,
            unitPrice: l.price.unitPrice, quantity: l.quantity,
          })),
        },
        events: { create: { status: placedNow ? 'PLACED' : 'PAYMENT_PENDING', note: covered ? 'Paid in full with points / gift card' : undefined } },
        payments: { create: { method: b.paymentMethod, status: covered ? 'CAPTURED' : isCod ? 'COD_PENDING' : 'CREATED', amount: q.total } },
      },
      include: { payments: true, user: { select: { name: true, phone: true, email: true } } },
    });
    if (q.couponId) await tx.couponUse.create({ data: { couponId: q.couponId, userId, orderId: created.id } });
    // Actually debit the wallet now that the order exists (re-validates balances/caps atomically; matches the preview above).
    if (q.pointsAppliedPaise > 0) await debitPoints(tx, userId, Math.floor(q.pointsAppliedPaise / 100), created.id, `Order ${created.orderNumber}`);
    if (q.giftCardCode && q.giftCardApplied > 0) await redeemGiftCard(tx, q.giftCardCode, userId, created.id, q.giftCardApplied);
    await tx.cartItem.deleteMany({ where: { userId } });
    return created;
  }, { timeout: 15_000 });

  if (isUpiManual && order.status === 'PAYMENT_PENDING') {
    return res.status(201).json({ order, payment: null, upi: await upiPaymentInfo(order.total, order.orderNumber) });
  }

  if (order.status === 'PLACED') {
    void onOrderPlaced(order.id);
    void notifyOrderStatus({ phone: address.phone, email: order.user.email, name: order.user.name, orderNumber: order.orderNumber, status: 'PLACED' });
    return res.status(201).json({ order, payment: null });
  }

  try {
    const rzpOrderId = await createRazorpayOrder(order.total, order.orderNumber, { orderId: order.id });
    await prisma.payment.update({ where: { id: order.payments[0].id }, data: { razorpayOrderId: rzpOrderId } });
    res.status(201).json({
      order,
      payment: { provider: 'razorpay', keyId: env.RAZORPAY_KEY_ID, razorpayOrderId: rzpOrderId, amount: order.total, currency: 'INR',
        prefill: { contact: address.phone, name: order.user.name ?? '', email: order.user.email ?? '' } },
    });
  } catch (err) {
    // Gateway down: release the stock immediately rather than holding it for the full window.
    await transition(order.id, 'CANCELLED', { note: 'PAYMENT_INIT_FAILED' });
    throw err;
  }
}));

/** Retry payment for an order still inside its hold window (e.g. after a failed UPI attempt). */
r.post('/:id/pay', ah(async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: { payments: { orderBy: { createdAt: 'desc' } }, user: { select: { name: true, phone: true, email: true } } } });
  if (!order) throw notFound('Order');
  if (order.status !== 'PAYMENT_PENDING') throw conflict('NOT_PAYABLE', 'This order does not need payment');
  if (order.holdExpiresAt && order.holdExpiresAt < new Date()) throw conflict('HOLD_EXPIRED', 'This order expired. Add the items to your cart again.');
  const existing = order.payments.find((p) => p.razorpayOrderId && p.status !== 'FAILED');
  let rzpOrderId = existing?.razorpayOrderId;
  if (!rzpOrderId) {
    rzpOrderId = await createRazorpayOrder(order.total, `${order.orderNumber}-R${order.payments.length}`, { orderId: order.id });
    await prisma.payment.create({ data: { orderId: order.id, method: order.paymentMethod, status: 'CREATED', amount: order.total, razorpayOrderId: rzpOrderId } });
  }
  res.json({ provider: 'razorpay', keyId: env.RAZORPAY_KEY_ID, razorpayOrderId: rzpOrderId, amount: order.total, currency: 'INR',
    prefill: { contact: (order.shippingSnapshot as { phone?: string } | null)?.phone ?? order.user.phone ?? '', name: order.user.name ?? '', email: order.user.email ?? '' } });
}));

r.get('/', ah(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50,
    include: { items: { include: { variant: { include: { product: { include: { images: { take: 1 } } } } } } } },
  });
  res.json(orders.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] })));
}));

r.get('/:id', ah(async (req, res) => {
  const o = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: orderInclude });
  if (!o) throw notFound('Order');
  const reached = new Map(o.events.map((e) => [e.status, e.createdAt]));
  const currentIdx = TRACK_STAGES.indexOf(o.status);
  const stages = o.needsPrescription ? TRACK_STAGES : TRACK_STAGES.filter((s) => s !== 'PRESCRIPTION_VERIFIED' && s !== 'LENS_CUTTING_FITTING');
  const timeline = stages.map((s) => ({
    status: s, label: STATUS_LABEL[s],
    done: o.status !== 'CANCELLED' && (reached.has(s) || (currentIdx >= 0 && TRACK_STAGES.indexOf(s) <= currentIdx)),
    at: reached.get(s) ?? null,
  }));
  const items = await Promise.all(o.items.map(async (i) => ({
    ...i, needsRxUpload: lensNeedsRx(i.lensPackage?.lensType) && !i.prescriptionId,
    prescriptionImageUrl: i.prescription?.imageKey ? await signedUrl(i.prescription.imageKey) : null,
  })));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user, ...rest } = o;
  const latestPay = o.payments[0];
  const upi = o.paymentMethod === 'UPI_MANUAL' && o.status === 'PAYMENT_PENDING'
    ? { ...(await upiPaymentInfo(o.total, o.orderNumber)), submitted: latestPay?.status === 'SUBMITTED', utr: latestPay?.utr ?? null,
        rejectedReason: latestPay?.status === 'FAILED' ? latestPay.failureReason : null }
    : null;
  const eta = estimateDelivery(o);
  res.json({ ...rest, items, upi, eta: eta ? { date: eta.date, text: eta.text } : null, serverTime: new Date(), statusLabel: STATUS_LABEL[o.status], timeline, canCancel: CUSTOMER_CANCELLABLE.includes(o.status),
    supportWhatsApp: `https://wa.me/${env.SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi Lensio, I need help with order ${o.orderNumber}`)}` });
}));

r.post('/:id/cancel', validate(z.object({ reason: z.string().max(200).optional() })), ah(async (req, res) => {
  const o = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!o) throw notFound('Order');
  if (!CUSTOMER_CANCELLABLE.includes(o.status))
    throw conflict('NOT_CANCELLABLE', 'Your lenses are already being made, so this order can no longer be cancelled. Chat with us for help.');
  res.json(await transition(o.id, 'CANCELLED', { actorId: req.user!.id, note: req.body.reason ?? 'Cancelled by customer' }));
}));

/** Attach a prescription to an item placed with "send prescription later". */
r.post('/:id/items/:itemId/prescription', validate(z.object({ prescriptionId: z.string() })), ah(async (req, res) => {
  const item = await prisma.orderItem.findFirst({
    where: { id: req.params.itemId, orderId: req.params.id, order: { userId: req.user!.id } }, include: { order: true },
  });
  if (!item) throw notFound('Order item');
  if (!['PLACED', 'PAYMENT_PENDING'].includes(item.order.status))
    throw conflict('RX_LOCKED', 'The prescription can no longer be changed for this order');
  const rx = await prisma.prescription.findFirst({ where: { id: req.body.prescriptionId, userId: req.user!.id } });
  if (!rx) throw notFound('Prescription');
  const updatedItem = await prisma.orderItem.update({ where: { id: item.id }, data: { prescriptionId: rx.id } });
  void alertOwner('prescription_to_review', `Prescription received for order ${item.order.orderNumber}`,
    [`For: ${item.productName}`, rx.source === 'UPLOAD' ? 'The customer uploaded a photo. Please read and verify it.' : 'The customer typed the values. Please check and verify them.'], item.orderId);
  void runAutomation(item.orderId).catch(() => undefined);
  res.json(updatedItem);
}));

/** Customer reports a manual UPI payment with its 12-digit UTR (and optionally a screenshot). */
r.post('/:id/upi-payment', proofUpload.single('screenshot'), ah(async (req, res) => {
  const utr = String(req.body?.utr ?? '').replace(/\s/g, '');
  if (!/^\d{12}$/.test(utr)) throw badRequest('BAD_UTR', 'Enter the 12-digit UPI reference number (UTR) from your payment app');
  const o = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: { payments: { orderBy: { createdAt: 'desc' } } } });
  if (!o) throw notFound('Order');
  if (o.paymentMethod !== 'UPI_MANUAL' || o.status !== 'PAYMENT_PENDING') throw conflict('NOT_PAYABLE', 'This order does not need a UPI payment');
  const dup = await prisma.payment.findFirst({ where: { utr, status: { in: ['SUBMITTED', 'CAPTURED'] }, NOT: { orderId: o.id } } });
  if (dup) throw badRequest('UTR_USED', 'This reference number is already used on another order. Check it in your payment app.');
  const proofKey = req.file ? await putPrivateFile(`payments/${req.user!.id}`, req.file.buffer, req.file.mimetype) : undefined;
  const pay = o.payments[0];
  await prisma.$transaction([
    pay
      ? prisma.payment.update({ where: { id: pay.id }, data: { status: 'SUBMITTED', utr, proofKey, failureReason: null } })
      : prisma.payment.create({ data: { orderId: o.id, method: 'UPI_MANUAL', status: 'SUBMITTED', amount: o.total, utr, proofKey } }),
    // Stop the auto-cancel timer: the shop now needs to check the payment.
    prisma.order.update({ where: { id: o.id }, data: { holdExpiresAt: null } }),
  ]);
  void alertOwner('payment_to_check', `UPI payment to check · ${o.orderNumber} · ₹${Math.round(o.total / 100).toLocaleString('en-IN')}`, [
    `The customer says they paid ₹${Math.round(o.total / 100).toLocaleString('en-IN')} by UPI.`,
    `UPI reference (UTR): ${utr}`,
    'Check your bank or UPI app for this reference, then confirm it in the admin panel.',
    proofKey ? 'They also attached a payment screenshot.' : '',
  ].filter(Boolean), o.id);
  res.json({ ok: true });
}));

export default r;

/** Reminder for orders still missing a prescription; called from the jobs runner. */
export async function remindMissingPrescriptions() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const orders = await prisma.order.findMany({
    where: { status: 'PLACED', needsPrescription: true, createdAt: { lt: since }, items: { some: { prescriptionId: null, lensPackageId: { not: null } } } },
    include: { user: true }, take: 100,
  });
  for (const o of orders) {
    const phone = (o.shippingSnapshot as { phone?: string } | null)?.phone ?? o.user.phone;
    if (phone) await sendTemplate(phone, 'prescription_needed', [o.user.name ?? 'there', o.orderNumber]);
    if (o.user.email) await sendMail(o.user.email, `Send your prescription for order ${o.orderNumber}`,
      `Hi ${o.user.name ?? 'there'}, upload your prescription for Lensio order ${o.orderNumber} in the app so we can start making your lenses.`);
  }
}
