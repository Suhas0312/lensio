import { Router } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { logger } from '../../lib/logger';
import { recordCourierStatus } from './courier';

const r = Router();

/** Shiprocket tracking webhook. Configure in Shiprocket → Settings → API → Webhooks with the x-api-key token. */
/**
 * Shiprocket tracking webhook. Register the /courier-updates address in Shiprocket:
 * its settings refuse URLs containing words like "shiprocket". Header x-api-key = SHIPROCKET_WEBHOOK_TOKEN.
 */
r.post(['/courier-updates', '/shiprocket/webhook'], ah(async (req, res) => {
  if (!env.SHIPROCKET_WEBHOOK_TOKEN || req.header('x-api-key') !== env.SHIPROCKET_WEBHOOK_TOKEN)
    return res.status(401).json({ ok: false });
  const awb = String(req.body?.awb ?? '');
  const status = String(req.body?.current_status ?? '').toUpperCase();
  const order = awb ? await prisma.order.findFirst({ where: { awbCode: awb } }) : null;
  if (order) {
    const scans = Array.isArray(req.body?.scans) ? req.body.scans : [];
    const last = scans[scans.length - 1] ?? {};
    await recordCourierStatus(order.id, {
      status, activity: String(last.activity ?? req.body?.current_status ?? ''),
      location: String(last.location ?? req.body?.current_location ?? '') || null,
      at: req.body?.current_timestamp ? new Date(String(req.body.current_timestamp)) : undefined,
    });
  } else if (awb) {
    logger.info({ awb, status }, 'Shiprocket update for an unknown AWB');
  }
  res.json({ ok: true });
}));

/** Pincode serviceability check for the address form. */
r.get('/serviceability/:pincode', ah(async (req, res) => {
  const ok = /^[1-9]\d{5}$/.test(req.params.pincode);
  // For live courier coverage, call Shiprocket /courier/serviceability here.
  res.json({ serviceable: ok, etaDays: ok ? '5–7' : null });
}));

export default r;
