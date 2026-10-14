import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { lensNeedsRx, priceItem } from '../lens/pricing';
import { evaluateCoupon } from '../coupons/coupons.service';
import { getSettings } from '../settings/settings.service';
import { findUsableGiftCard, normalizeCode } from '../loyalty/giftcard.service';
import { pointsToPaise } from '../loyalty/points.service';

type Db = Prisma.TransactionClient | typeof prisma;

export const FREE_SHIPPING_ABOVE = 99900; // ₹999
export const SHIPPING_FEE = 9900;
export const COD_FEE = 4900;
export const COD_MAX_ORDER = 1000000; // ₹10,000

export const cartInclude = {
  variant: { include: { product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' as const } } } } } },
  lensPackage: true,
  prescription: true,
} satisfies Prisma.CartItemInclude;

export type CartRow = Prisma.CartItemGetPayload<{ include: typeof cartInclude }>;

export async function buildQuote(db: Db, userId: string, opts: { couponCode?: string | null; paymentMethod?: PaymentMethod | null; giftCardCode?: string | null; usePoints?: boolean } = {}) {
  const [rows, coatings] = await Promise.all([
    db.cartItem.findMany({ where: { userId }, include: cartInclude, orderBy: { createdAt: 'asc' } }),
    db.coating.findMany(),
  ]);

  const lines = rows.map((row) => {
    const p = row.variant.product;
    const price = priceItem({
      frameBase: p.basePrice, variantDelta: row.variant.priceDelta, isSunglasses: p.isSunglasses,
      lens: row.lensPackage, coatings, requestedCodes: row.coatingCodes, rx: row.prescription,
    });
    const issues: string[] = [];
    if (!p.isActive) issues.push('This frame is no longer available');
    if (row.variant.stock < row.quantity) issues.push(row.variant.stock === 0 ? 'Out of stock' : `Only ${row.variant.stock} left`);
    if (lensNeedsRx(row.lensPackage?.lensType) && !row.prescriptionId && !row.sendRxLater)
      issues.push('Add a prescription or choose to send it later');
    return { ...row, price, lineTotal: price.unitPrice * row.quantity, issues };
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const hasLens = lines.some((l) => !!l.lensPackageId);

  let discount = 0; let couponCode: string | null = null; let couponError: string | null = null; let couponId: string | null = null;
  if (opts.couponCode && subtotal > 0) {
    try {
      const c = await evaluateCoupon(db, opts.couponCode, userId, subtotal, hasLens);
      discount = c.discount; couponCode = c.coupon.code; couponId = c.coupon.id;
    } catch (e) {
      couponError = (e as Error).message;
    }
  }

  const afterDiscount = subtotal - discount;
  const shippingFee = afterDiscount >= FREE_SHIPPING_ABOVE || subtotal === 0 ? 0 : SHIPPING_FEE;
  const codFee = opts.paymentMethod === 'COD' ? COD_FEE : 0;
  const payableBeforeWallet = afterDiscount + shippingFee + codFee;

  // --- Wallet: loyalty points, then a gift card, applied read-only here (checkout debits them for real). ---
  const s = await getSettings();
  let pointsAvailable = 0, pointsApplied = 0, pointsAppliedPaise = 0;
  if (s.loyaltyEnabled && opts.usePoints && subtotal > 0) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } });
    pointsAvailable = user?.pointsBalance ?? 0;
    const cap = Math.min(payableBeforeWallet, Math.floor((subtotal * s.loyaltyMaxRedeemPercent) / 100));
    pointsAppliedPaise = pointsToPaise(pointsAvailable, cap);
    pointsApplied = Math.floor(pointsAppliedPaise / 100); // whole points only, so paise value stays exact
    pointsAppliedPaise = pointsApplied * 100;
  }

  let giftCardCode: string | null = null, giftCardBalance = 0, giftCardApplied = 0, giftCardError: string | null = null;
  const remainingAfterPoints = payableBeforeWallet - pointsAppliedPaise;
  if (opts.giftCardCode && remainingAfterPoints > 0) {
    try {
      const gc = await findUsableGiftCard(db, opts.giftCardCode);
      giftCardCode = gc.code; giftCardBalance = gc.balance;
      giftCardApplied = Math.min(gc.balance, remainingAfterPoints);
    } catch (e) {
      giftCardError = (e as Error).message;
    }
  } else if (opts.giftCardCode) {
    giftCardCode = normalizeCode(opts.giftCardCode);
  }

  const total = Math.max(0, payableBeforeWallet - pointsAppliedPaise - giftCardApplied);

  return {
    lines, subtotal, discount, couponCode, couponId, couponError, shippingFee, codFee, payableBeforeWallet, total,
    pointsAvailable, pointsApplied, pointsAppliedPaise,
    giftCardCode, giftCardBalance, giftCardApplied, giftCardError,
    codAvailable: total - codFee + COD_FEE <= COD_MAX_ORDER,
    needsPrescription: lines.some((l) => lensNeedsRx(l.lensPackage?.lensType)),
    blocking: lines.flatMap((l) => l.issues.map((i) => ({ cartItemId: l.id, message: i }))),
  };
}

export function assertCheckoutable(q: Awaited<ReturnType<typeof buildQuote>>) {
  if (!q.lines.length) throw badRequest('CART_EMPTY', 'Your cart is empty');
  if (q.blocking.length) throw badRequest('CART_ISSUES', 'Fix the items in your cart before checking out', q.blocking);
}
