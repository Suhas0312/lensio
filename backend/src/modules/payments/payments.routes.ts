import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { badRequest } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { markPaid } from '../orders/orders.service';
import { verifyCheckoutSignature, verifyWebhookSignature } from './razorpay.service';

const r = Router();

/** Called by the app right after Razorpay checkout succeeds. The webhook is the backstop. */
r.post('/razorpay/verify', requireAuth, validate(z.object({
  razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string(),
})), ah(async (req, res) => {
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body;
  if (!verifyCheckoutSignature(oid, pid, sig)) throw badRequest('BAD_SIGNATURE', 'Payment could not be verified');
  const p = await prisma.payment.findUnique({ where: { razorpayOrderId: oid }, include: { order: true } });
  if (!p || p.order.userId !== req.user!.id) throw badRequest('UNKNOWN_PAYMENT', 'Payment not found');
  const order = await markPaid(oid, pid, undefined, req.body);
  res.json({ ok: true, orderId: order?.id, status: order?.status });
}));

/** Records a failed attempt reported by the app, so support can see it. Order stays payable until hold expires. */
r.post('/razorpay/failed', requireAuth, validate(z.object({ razorpay_order_id: z.string(), reason: z.string().max(300).optional() })),
  ah(async (req, res) => {
    await prisma.payment.updateMany({
      where: { razorpayOrderId: req.body.razorpay_order_id, status: 'CREATED', order: { userId: req.user!.id } },
      data: { failureReason: req.body.reason ?? 'Checkout failed or dismissed' },
    });
    res.json({ ok: true });
  }));

/** Razorpay webhook. Mounted with a raw body parser so the HMAC is computed over exact bytes. */
export const razorpayWebhook = [
  express.raw({ type: 'application/json', limit: '1mb' }),
  ah(async (req, res) => {
    const sig = req.header('x-razorpay-signature') ?? '';
    if (!verifyWebhookSignature(req.body as Buffer, sig)) return res.status(400).json({ error: 'bad signature' });
    const eventId = req.header('x-razorpay-event-id') ?? '';
    const evt = JSON.parse((req.body as Buffer).toString('utf8'));
    if (eventId) {
      const seen = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
      if (seen) return res.json({ ok: true, duplicate: true });
    }
    const pay = evt.payload?.payment?.entity;
    try {
      if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && pay) {
        await markPaid(pay.order_id, pay.id, pay.method, pay);
      } else if (evt.event === 'payment.failed' && pay) {
        await prisma.payment.updateMany({
          where: { razorpayOrderId: pay.order_id, status: 'CREATED' },
          data: { failureReason: pay.error_description ?? 'Payment failed' },
        });
      }
      if (eventId) await prisma.webhookEvent.create({ data: { id: eventId, provider: 'razorpay', type: evt.event } });
    } catch (err) {
      logger.error({ err, event: evt.event }, 'Razorpay webhook processing failed');
      return res.status(500).json({ ok: false }); // Razorpay retries
    }
    res.json({ ok: true });
  }),
];

export default r;
