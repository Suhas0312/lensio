import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { getSettings } from '../settings/settings.service';
import { findUsableGiftCard } from './giftcard.service';

const r = Router();
r.use(requireAuth);

const REASON: Record<string, string> = {
  EARNED_DELIVERY: 'Earned on a delivered order', REDEEMED_CHECKOUT: 'Used at checkout',
  REFUNDED_CANCEL: 'Returned: order cancelled', ADMIN_ADJUST: 'Added by Lensio',
};

/** The customer's points balance and history. */
r.get('/me', ah(async (req, res) => {
  const [user, entries, s] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { pointsBalance: true } }),
    prisma.pointsEntry.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { orderNumber: true } } } }),
    getSettings(),
  ]);
  res.json({
    enabled: s.loyaltyEnabled, balance: user.pointsBalance, valueRupees: user.pointsBalance,
    pointsPer100: s.loyaltyPointsPer100, maxRedeemPercent: s.loyaltyMaxRedeemPercent,
    history: entries.map((e) => ({ id: e.id, points: e.points, label: e.note && e.reason === 'ADMIN_ADJUST' ? e.note : REASON[e.reason], orderNumber: e.order?.orderNumber ?? null, at: e.createdAt })),
  });
}));

/** Gift card balance check (signed-in, rate-limited so codes can't be guessed). */
const gcLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: true, legacyHeaders: false });
r.get('/giftcard/:code', gcLimiter, ah(async (req, res) => {
  const gc = await findUsableGiftCard(prisma, req.params.code);
  res.json({ code: gc.code, balance: gc.balance, expiresAt: gc.expiresAt });
}));

export default r;
