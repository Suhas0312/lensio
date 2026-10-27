import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { transition } from '../modules/orders/orders.service';
import { remindMissingPrescriptions } from '../modules/orders/orders.routes';
import { shiprocketEnabled, trackAwb } from '../modules/shipping/shiprocket.service';
import { recordCourierStatus } from '../modules/shipping/courier';
import { env } from '../config/env';
import { sendReviewRequestEmail } from '../lib/mail';
import { notifyOrderUpdate } from '../modules/notifications/whatsapp.service';
import { refreshToken as refreshInstagramToken } from '../modules/instagram/instagram.service';
import { translateAppPhrases } from '../modules/i18n/translate.routes';

/** Two days after delivery, ask the customer to review what they bought (once per order). */
export async function sendReviewRequests() {
  const cutoff = new Date(Date.now() - 2 * 86_400_000);
  const orders = await prisma.order.findMany({
    where: { status: 'DELIVERED', reviewRequestedAt: null, events: { some: { status: 'DELIVERED', createdAt: { lte: cutoff } } } },
    include: { user: { select: { email: true, name: true } }, address: { select: { phone: true } }, items: { select: { productName: true } }, reviews: { select: { id: true } } },
    take: 50,
  });
  const link = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/rewards`;
  for (const o of orders) {
    // Mark first so a failing email can never cause repeated sends.
    await prisma.order.update({ where: { id: o.id }, data: { reviewRequestedAt: new Date() } });
    if (o.reviews.length) continue; // already reviewed
    void notifyOrderUpdate({ phone: o.address.phone, name: o.user.name, orderNumber: o.orderNumber, headline: 'How are your new glasses?',
      detail: `Rate them in the Lensio app${o.pointsEarned ? ` and earn ${o.pointsEarned} bonus points` : ''}: ${link}` });
    if (!o.user.email) continue;
    await sendReviewRequestEmail(o.user.email, o.user.name, o.orderNumber, [...new Set(o.items.map((i) => i.productName))], link, o.pointsEarned)
      .catch((err) => logger.warn({ err, order: o.orderNumber }, 'Review request email failed'));
  }
  if (orders.length) logger.info({ count: orders.length }, 'Review requests processed');
}

/** Backup for missed courier webhooks: re-checks every shipment that is on its way. */
export async function refreshCourierTracking() {
  if (!shiprocketEnabled()) return;
  const orders = await prisma.order.findMany({ where: { status: 'DISPATCHED', awbCode: { not: null } }, select: { id: true, awbCode: true }, take: 200 });
  for (const o of orders) {
    try {
      const t = await trackAwb(o.awbCode!);
      // oldest first, so the tracking list builds up in order
      for (const a of [...t.activities].reverse()) await recordCourierStatus(o.id, { activity: a.activity, location: a.location, at: a.at });
      if (/delivered/i.test(t.status) && !/undelivered/i.test(t.status)) await recordCourierStatus(o.id, { status: 'DELIVERED' });
    } catch (err) { logger.warn({ err, awb: o.awbCode }, 'Tracking refresh failed'); }
  }
}

/** Cancels unpaid online orders whose stock hold expired, releasing stock back to the catalog. */
export async function releaseExpiredHolds() {
  const expired = await prisma.order.findMany({
    where: { status: 'PAYMENT_PENDING', holdExpiresAt: { lt: new Date() } }, select: { id: true }, take: 200,
  });
  for (const o of expired) {
    await transition(o.id, 'CANCELLED', { note: 'PAYMENT_TIMEOUT' }).catch((err) => logger.error({ err, id: o.id }, 'hold release failed'));
  }
  if (expired.length) logger.info({ count: expired.length }, 'Released expired payment holds');
}

/** 15 minutes after an unpaid order, remind the customer once on WhatsApp/email before the hold runs out. */
export async function remindPendingPayments() {
  const due = await prisma.order.findMany({
    where: { status: 'PAYMENT_PENDING', paymentReminderAt: null, createdAt: { lt: new Date(Date.now() - 15 * 60_000) }, holdExpiresAt: { gt: new Date() } },
    include: { user: { select: { email: true, name: true } }, address: { select: { phone: true } } }, take: 100,
  });
  for (const o of due) {
    await prisma.order.update({ where: { id: o.id }, data: { paymentReminderAt: new Date() } });
    const mins = o.holdExpiresAt ? Math.max(1, Math.round((o.holdExpiresAt.getTime() - Date.now()) / 60_000)) : null;
    void notifyOrderUpdate({ phone: o.address.phone, email: o.user.email, name: o.user.name, orderNumber: o.orderNumber, headline: 'Payment pending',
      detail: `Finish paying from the order page in the Lensio app${mins ? ` within ${mins} minutes` : ''} to keep your frames reserved.` });
  }
}

const running = new Set<string>();   // one lock per job, so a slow job never blocks the others
async function tick(fn: () => Promise<void>, name: string) {
  if (running.has(name)) return;
  running.add(name);
  try { await fn(); } catch (err) { logger.error({ err }, `job ${name} failed`); } finally { running.delete(name); }
}

/**
 * In-process scheduler. Fine for a single instance. When you scale to multiple
 * instances, run `node dist/jobs/worker.js` as one dedicated process instead and set RUN_JOBS=false on API pods.
 */
export function startJobs() {
  setInterval(() => void tick(releaseExpiredHolds, 'holds'), 60_000);
  setInterval(() => void tick(remindPendingPayments, 'payment-reminders'), 2 * 60_000);
  setInterval(() => void tick(remindMissingPrescriptions, 'rx-reminders'), 6 * 3600_000);
  setInterval(() => void tick(refreshCourierTracking, 'courier-tracking'), 2 * 3600_000);
  setInterval(() => void tick(sendReviewRequests, 'review-requests'), 3 * 3600_000);
  setInterval(() => void tick(refreshInstagramToken, 'instagram-token'), 7 * 86_400_000);
  // Translate the whole app into every language in the background (only what is missing).
  setTimeout(() => void tick(translateAppPhrases, 'app-translation'), 2 * 60_000);
  setInterval(() => void tick(translateAppPhrases, 'app-translation'), 6 * 3600_000);
}
