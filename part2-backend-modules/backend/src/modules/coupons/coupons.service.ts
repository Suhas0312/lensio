import { Coupon, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';

type Db = Prisma.TransactionClient | typeof prisma;

export async function evaluateCoupon(db: Db, code: string, userId: string, subtotal: number, hasLens: boolean)
  : Promise<{ coupon: Coupon; discount: number }> {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  if (!coupon || !coupon.isActive || coupon.validFrom > now || (coupon.validTo && coupon.validTo < now))
    throw badRequest('COUPON_INVALID', 'This coupon code is not valid');
  if (subtotal < coupon.minOrderValue)
    throw badRequest('COUPON_MIN_ORDER', `Add items worth ₹${(coupon.minOrderValue - subtotal) / 100} more to use this coupon`);
  if (coupon.requiresLens && !hasLens)
    throw badRequest('COUPON_NEEDS_LENS', 'This coupon applies to frame + lens combos. Add lenses to a frame to use it.');
  if (coupon.firstOrderOnly) {
    const prior = await db.order.count({ where: { userId, status: { notIn: ['CANCELLED', 'PAYMENT_PENDING'] } } });
    if (prior > 0) throw badRequest('COUPON_FIRST_ORDER', 'This coupon is for your first order only');
  }
  const [userUses, totalUses] = await Promise.all([
    db.couponUse.count({ where: { couponId: coupon.id, userId } }),
    coupon.usageLimit ? db.couponUse.count({ where: { couponId: coupon.id } }) : Promise.resolve(0),
  ]);
  if (userUses >= coupon.perUserLimit) throw badRequest('COUPON_USED', 'You have already used this coupon');
  if (coupon.usageLimit && totalUses >= coupon.usageLimit) throw badRequest('COUPON_EXHAUSTED', 'This coupon has reached its limit');

  let discount = coupon.flatOff ?? 0;
  if (coupon.percentOff) {
    discount = Math.floor((subtotal * coupon.percentOff) / 100);
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  }
  return { coupon, discount: Math.min(discount, subtotal) };
}
