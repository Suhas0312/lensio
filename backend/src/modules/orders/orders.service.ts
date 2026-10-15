import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { notifyOrderStatus } from '../notifications/whatsapp.service';
import { createShipment, shiprocketEnabled } from '../shipping/shiprocket.service';
import { refundPayment } from '../payments/razorpay.service';
import { alertOwner } from '../notifications/owner.service';
import { getSettings } from '../settings/settings.service';
import { creditPoints, reversePointsForOrder } from '../loyalty/points.service';
import { refundGiftCardForOrder } from '../loyalty/giftcard.service';

/** Allowed forward transitions. The production line only moves forward. */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  PAYMENT_PENDING: ['PLACED', 'CANCELLED'],
  PLACED: ['PRESCRIPTION_VERIFIED', 'LENS_CUTTING_FITTING', 'CANCELLED'],
  PRESCRIPTION_VERIFIED: ['LENS_CUTTING_FITTING', 'CANCELLED'],
  LENS_CUTTING_FITTING: ['QUALITY_CHECK'],
  QUALITY_CHECK: ['DISPATCHED', 'LENS_CUTTING_FITTING'], // QC fail → back to fitting
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['PAYMENT_PENDING', 'PLACED', 'PRESCRIPTION_VERIFIED'];

/** Customer-facing tracking stages. */
export const TRACK_STAGES: OrderStatus[] = ['PLACED', 'PRESCRIPTION_VERIFIED', 'LENS_CUTTING_FITTING', 'QUALITY_CHECK', 'DISPATCHED', 'DELIVERED'];

export const orderInclude = {
  items: { include: { variant: { include: { product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' as const } } } } } }, lensPackage: true, prescription: true } },
  events: { orderBy: { createdAt: 'asc' as const } },
  tracking: { orderBy: { at: 'desc' as const }, take: 30 },
  payments: { orderBy: { createdAt: 'desc' as const } },
  user: true,
} satisfies Prisma.OrderInclude;

export function newOrderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear() % 100}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `LNS${ymd}${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}

export async function restoreStock(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const i of items) await tx.frameVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.quantity } } });
  await tx.couponUse.deleteMany({ where: { orderId } });
}

/**
 * automated: the move was made by the automation rules (not a person).
 * quiet: don't message the customer about this step (used for quick automatic in-between steps).
 */
export async function transition(orderId: string, to: OrderStatus, opts: { actorId?: string; note?: string; force?: boolean; automated?: boolean; quiet?: boolean } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { prescription: true, lensPackage: true } }, user: true } });
  if (!order) throw notFound('Order');
  if (!opts.force && !NEXT[order.status].includes(to))
    throw conflict('BAD_TRANSITION', `Cannot move an order from ${order.status} to ${to}`);
  // Anti-fraud: an unpaid order can only start once the money is confirmed (UPI checked by the shop,
  // or Razorpay captured). No button, staff account or old app can skip this.
  if (order.status === 'PAYMENT_PENDING' && to === 'PLACED' && order.total > 0) {
    const paid = await prisma.payment.count({ where: { orderId, status: 'CAPTURED' } });
    if (!paid) throw conflict('PAYMENT_NOT_CONFIRMED', 'Confirm the payment first: check your bank or UPI app for the money, then tap "Money received — confirm".');
  }

  if (to === 'PRESCRIPTION_VERIFIED' || (to === 'LENS_CUTTING_FITTING' && order.needsPrescription)) {
    const needs = order.items.filter((i) => i.lensPackage && i.lensPackage.lensType !== 'ZERO_POWER');
    const unverified = needs.filter((i) => !i.prescription || i.prescription.status !== 'VERIFIED');
    if (unverified.length) throw badRequest('RX_NOT_VERIFIED', `${unverified.length} item(s) still need a verified prescription`);
  }

  let shipping: Awaited<ReturnType<typeof createShipment>> | null = null;
  if (to === 'DISPATCHED' && shiprocketEnabled() && !order.awbCode) {
    const address = order.shippingSnapshot as unknown as Parameters<typeof createShipment>[0]['address'];
    shipping = await createShipment({
      orderNumber: order.orderNumber, createdAt: order.createdAt, isCod: order.paymentMethod === 'COD', total: order.total,
      address, email: order.user.email,
      items: order.items.map((i) => ({ name: `${i.productName} ${i.variantLabel}`, sku: i.variantId, units: i.quantity, unitPrice: i.unitPrice })),
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (to === 'CANCELLED') {
      await restoreStock(tx, order.id);
      await reversePointsForOrder(tx, order.id);
      await refundGiftCardForOrder(tx, order.id);
    }
    if (to === 'DELIVERED' && order.pointsEarned > 0) {
      await creditPoints(tx, order.userId, order.pointsEarned, 'EARNED_DELIVERY', order.id, `${order.orderNumber} delivered`);
    }
    if (shipping?.awbCode) await tx.trackingUpdate.create({ data: { orderId, source: 'courier',
      message: `Courier booked${shipping.courierName ? ` with ${shipping.courierName}` : ''} · tracking number ${shipping.awbCode}. Pickup scheduled.` } });
    await tx.orderStatusEvent.create({ data: { orderId, status: to, note: opts.note, actorId: opts.actorId } });
    return tx.order.update({
      where: { id: orderId },
      data: { status: to, cancelReason: to === 'CANCELLED' ? opts.note : undefined, holdExpiresAt: to !== 'PAYMENT_PENDING' ? null : undefined, ...(shipping ?? {}) },
    });
  });

  if (to === 'CANCELLED') await refundIfPaid(orderId);
  const snapPhone = (order.shippingSnapshot as { phone?: string } | null)?.phone;
  if (!opts.quiet) void notifyOrderStatus({ phone: snapPhone ?? order.user.phone, email: order.user.email, name: order.user.name, orderNumber: order.orderNumber, status: to, trackingUrl: updated.trackingUrl });

  // Tell the owner about orders arriving without their involvement (online payments), and customer cancellations.
  if (to === 'PLACED' && !opts.actorId) void alertNewOrder(orderId);
  if (to === 'CANCELLED' && opts.actorId === order.userId) void alertOwner('cancelled', `Order ${order.orderNumber} was cancelled by the customer`,
    [`${order.user.name ?? order.user.email ?? 'Customer'} cancelled it.`, opts.note ? `Reason: ${opts.note}` : '', order.paymentMethod === 'UPI_MANUAL' ? 'If they already paid by UPI, send the refund from your UPI app.' : ''].filter(Boolean), orderId);

  // Let the order move on by itself if the automation rules allow it.
  setImmediate(() => { runAutomation(orderId).catch((err) => logger.error({ err, orderId }, 'Order automation failed')); });
  return updated;
}

/** Called when an order is placed (COD at checkout, or after payment). Emails the owner and starts automation. */
export async function onOrderPlaced(orderId: string) {
  await alertNewOrder(orderId);
  await runAutomation(orderId).catch((err) => logger.error({ err, orderId }, 'Order automation failed'));
}

async function alertNewOrder(orderId: string) {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true, items: { include: { prescription: true, lensPackage: true } } } });
  if (!o) return;
  const a = (o.shippingSnapshot ?? {}) as { fullName?: string; phone?: string; city?: string; pincode?: string };
  const rx = o.items.filter((i) => i.lensPackage && i.lensPackage.lensType !== 'ZERO_POWER');
  const toReview = rx.filter((i) => i.prescription && i.prescription.status === 'PENDING_REVIEW').length;
  const missing = rx.filter((i) => !i.prescriptionId).length;
  const pay = o.paymentMethod === 'COD' ? 'Cash on delivery' : o.paymentMethod === 'UPI_MANUAL' ? 'UPI (confirmed)' : `Paid online (${o.paymentMethod.toLowerCase()})`;
  await alertOwner('new_order', `New order ${o.orderNumber} · ₹${Math.round(o.total / 100).toLocaleString('en-IN')}`, [
    `Customer: ${a.fullName ?? o.user.name ?? ''} · ${a.phone ? '+91 ' + a.phone : ''} · ${o.user.email ?? ''}`,
    `Deliver to: ${a.city ?? ''} ${a.pincode ?? ''}`,
    ...o.items.map((i) => `• ${i.productName} (${i.variantLabel})${i.lensPackage ? ` + ${i.lensPackage.name}` : ' · frame only'}${i.coatingCodes.length ? ` + ${i.coatingCodes.join(', ').toLowerCase()}` : ''}`),
    `Payment: ${pay}`,
    toReview ? `👓 ${toReview} prescription${toReview > 1 ? 's' : ''} to review` : '',
    missing ? `⏳ Waiting for the customer to send ${missing} prescription${missing > 1 ? 's' : ''}` : '',
  ].filter(Boolean), orderId);
}

/**
 * Automation rules (switch them on/off in admin → Settings → Automation):
 *  - frame-only orders skip the lens steps and go straight to quality check
 *  - typed prescriptions that pass every check (and aren't high power) can be approved automatically
 *  - once all prescriptions are verified the order moves on, and lens work starts straight away
 * Courier steps (dispatched → delivered) are automated by the Shiprocket integration.
 */
export async function runAutomation(orderId: string) {
  const s = await getSettings();
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { prescription: true, lensPackage: true } } } });
  if (!o) return;
  const rxItems = o.items.filter((i) => i.lensPackage && i.lensPackage.lensType !== 'ZERO_POWER');

  if (o.status === 'PLACED') {
    if (!rxItems.length) {
      // No power lenses: nothing for the shop to approve. Zero-power / plain lenses still get cut and fitted;
      // frame-only orders and sunglasses without power go straight to quality check.
      const hasLenses = o.items.some((i) => i.lensPackage);
      if (hasLenses) await transition(o.id, 'LENS_CUTTING_FITTING', { automated: true, quiet: true, note: 'Zero-power lenses: no prescription needed, lens work started' });
      else if (s.frameOnlyToQc) await transition(o.id, 'QUALITY_CHECK', { force: true, automated: true, quiet: true, note: 'No prescription lenses: preparing for dispatch' });
      return;
    }
    if (s.autoApproveTypedRx) {
      for (const i of rxItems) {
        const p = i.prescription;
        if (p && p.status === 'PENDING_REVIEW' && p.source === 'MANUAL' && !p.isHighPower && p.odSph != null && p.osSph != null) {
          await prisma.prescription.update({ where: { id: p.id }, data: { status: 'VERIFIED', reviewedAt: new Date(), reviewNote: 'Approved automatically: typed values passed all checks' } });
        }
      }
    }
    const ids = rxItems.map((i) => i.prescriptionId).filter((x): x is string => !!x);
    const fresh = await prisma.prescription.findMany({ where: { id: { in: ids } } });
    const allVerified = rxItems.every((i) => i.prescriptionId && fresh.find((p) => p.id === i.prescriptionId)?.status === 'VERIFIED');
    if (allVerified) await transition(o.id, 'PRESCRIPTION_VERIFIED', { automated: true, quiet: s.autoStartLensWork, note: 'All prescriptions verified' });
    return;
  }
  if (o.status === 'PRESCRIPTION_VERIFIED' && s.autoStartLensWork) {
    await transition(o.id, 'LENS_CUTTING_FITTING', { automated: true, note: 'Lens work started automatically' });
  }
}

export async function refundIfPaid(orderId: string) {
  const paid = await prisma.payment.findFirst({ where: { orderId, status: 'CAPTURED', razorpayPaymentId: { not: null } } });
  if (!paid) return;
  try {
    await refundPayment(paid.razorpayPaymentId!, paid.amount);
    await prisma.payment.update({ where: { id: paid.id }, data: { status: 'REFUNDED' } });
  } catch (err) {
    logger.error({ err, orderId }, 'Refund failed — needs manual action in Razorpay dashboard');
  }
}

/**
 * Mark an online payment captured. Idempotent. Handles the edge case where the
 * payment lands after the reservation expired and the order was auto-cancelled:
 * we try to re-reserve stock, and refund automatically if we cannot.
 */
export async function markPaid(razorpayOrderId: string, razorpayPaymentId: string, method: string | undefined, raw: unknown) {
  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId }, include: { order: true } });
  if (!payment) { logger.warn({ razorpayOrderId }, 'Payment for unknown Razorpay order'); return null; }
  if (payment.status === 'CAPTURED' || payment.status === 'REFUNDED') return payment.order;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'CAPTURED', razorpayPaymentId, raw: raw as Prisma.InputJsonValue, method: mapMethod(method) ?? payment.method },
  });

  const order = payment.order;
  if (order.status === 'PAYMENT_PENDING') {
    await prisma.order.update({ where: { id: order.id }, data: { paymentMethod: mapMethod(method) ?? order.paymentMethod } });
    return transition(order.id, 'PLACED', { note: 'Payment received' });
  }
  if (order.status === 'CANCELLED' && order.cancelReason === 'PAYMENT_TIMEOUT') {
    const ok = await prisma.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      for (const i of items) {
        const r = await tx.frameVariant.updateMany({ where: { id: i.variantId, stock: { gte: i.quantity } }, data: { stock: { decrement: i.quantity } } });
        if (r.count === 0) throw new Error('NO_STOCK');
      }
      return true;
    }).catch(() => false);
    if (ok) return transition(order.id, 'PLACED', { note: 'Late payment received, order revived', force: true });
    await refundIfPaid(order.id);
  }
  return order;
}

export function mapMethod(m?: string) {
  switch (m) {
    case 'upi': return 'UPI' as const;
    case 'card': return 'CARD' as const;
    case 'netbanking': return 'NETBANKING' as const;
    case 'wallet': return 'WALLET' as const;
    default: return undefined;
  }
}
