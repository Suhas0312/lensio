import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { getSettings } from '../settings/settings.service';

type Db = Prisma.TransactionClient | typeof prisma;

/** 1 point = ₹1 of redemption value. Points are only ever earned on the frame+lens+coating subtotal, never on delivery/COD fees. */
export const POINT_VALUE_PAISE = 100;

/** How many points a subtotal earns, using the shop's configured earn rate (points per ₹100 spent). */
export async function pointsForSubtotal(subtotalPaise: number): Promise<number> {
  const s = await getSettings();
  const rupees = subtotalPaise / 100;
  return Math.floor((rupees / 100) * s.loyaltyPointsPer100);
}

/** Paise value of a given number of points, capped so points can never make an order free or negative. */
export function pointsToPaise(points: number, capPaise: number): number {
  return Math.max(0, Math.min(points * POINT_VALUE_PAISE, capPaise));
}

/** Credits points and keeps the user's cached balance in sync. Idempotent per (userId, orderId, reason). */
export async function creditPoints(db: Db, userId: string, points: number, reason: 'EARNED_DELIVERY' | 'REFUNDED_CANCEL' | 'ADMIN_ADJUST', orderId?: string, note?: string) {
  if (points <= 0) return;
  if (orderId) {
    const existing = await db.pointsEntry.findFirst({ where: { userId, orderId, reason } });
    if (existing) return; // already credited (e.g. transition retried)
  }
  await db.pointsEntry.create({ data: { userId, orderId, points, reason, note } });
  await db.user.update({ where: { id: userId }, data: { pointsBalance: { increment: points } } });
}

/** Debits points (checkout redemption). Throws if the user doesn't have enough. */
export async function debitPoints(db: Db, userId: string, points: number, orderId?: string, note?: string, reason: 'REDEEMED_CHECKOUT' | 'ADMIN_ADJUST' = 'REDEEMED_CHECKOUT') {
  if (points <= 0) return;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.pointsBalance < points) throw badRequest('INSUFFICIENT_POINTS', 'Not enough points for this.');
  await db.pointsEntry.create({ data: { userId, orderId, points: -points, reason, note } });
  await db.user.update({ where: { id: userId }, data: { pointsBalance: { decrement: points } } });
}

/** Reverses points earned or spent on a cancelled order, if any were recorded for it. */
export async function reversePointsForOrder(db: Db, orderId: string) {
  const entries = await db.pointsEntry.findMany({ where: { orderId } });
  for (const e of entries) {
    if (e.points === 0) continue;
    await db.pointsEntry.create({ data: { userId: e.userId, orderId, points: -e.points, reason: 'REFUNDED_CANCEL', note: `Reversing ${e.reason} on cancellation` } });
    await db.user.update({ where: { id: e.userId }, data: { pointsBalance: { increment: -e.points } } });
  }
}
