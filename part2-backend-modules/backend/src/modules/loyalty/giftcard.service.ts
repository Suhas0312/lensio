import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';

type Db = Prisma.TransactionClient | typeof prisma;

/** LENS-XXXX-XXXX style code: unambiguous letters/digits only (no 0/O/1/I). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateGiftCardCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return `LENS-${part()}-${part()}`;
}

export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '');

/** Looks up a code and returns it only if usable (active, not expired, balance > 0). Never mutates. */
export async function findUsableGiftCard(db: Db, code: string) {
  const gc = await db.giftCard.findUnique({ where: { code: normalizeCode(code) } });
  if (!gc) throw badRequest('GIFTCARD_NOT_FOUND', 'That gift card code was not found.');
  if (!gc.isActive) throw badRequest('GIFTCARD_INACTIVE', 'This gift card has been deactivated.');
  if (gc.expiresAt && gc.expiresAt < new Date()) throw badRequest('GIFTCARD_EXPIRED', 'This gift card has expired.');
  if (gc.balance <= 0) throw badRequest('GIFTCARD_EMPTY', 'This gift card has no balance left.');
  return gc;
}

/** Redeems up to `capPaise` from a gift card against an order, inside the caller's transaction. Returns paise actually applied. */
export async function redeemGiftCard(db: Db, code: string, userId: string, orderId: string, capPaise: number): Promise<number> {
  const gc = await findUsableGiftCard(db, code);
  const amount = Math.min(gc.balance, capPaise);
  if (amount <= 0) return 0;
  const updated = await db.giftCard.updateMany({ where: { id: gc.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
  if (updated.count === 0) throw badRequest('GIFTCARD_RACE', 'This gift card balance just changed. Please try again.');
  await db.giftCardRedemption.create({ data: { giftCardId: gc.id, orderId, userId, amount } });
  return amount;
}

/** Refunds a redemption back onto its gift card (used when an order is cancelled). */
export async function refundGiftCardForOrder(db: Db, orderId: string) {
  const reds = await db.giftCardRedemption.findMany({ where: { orderId } });
  for (const red of reds) {
    await db.giftCard.update({ where: { id: red.giftCardId }, data: { balance: { increment: red.amount } } });
  }
}

export async function issueGiftCard(valuePaise: number, opts: { purchaserName?: string; purchaserEmail?: string; recipientEmail?: string; message?: string; expiresAt?: Date } = {}) {
  if (valuePaise <= 0) throw badRequest('BAD_VALUE', 'Gift card value must be positive.');
  let code = generateGiftCardCode();
  for (let i = 0; i < 5 && (await prisma.giftCard.findUnique({ where: { code } })); i++) code = generateGiftCardCode();
  return prisma.giftCard.create({ data: { code, initialValue: valuePaise, balance: valuePaise, ...opts } });
}
