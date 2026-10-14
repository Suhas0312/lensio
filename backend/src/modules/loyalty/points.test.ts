import { describe, expect, it, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

const settings = { loyaltyEnabled: true, loyaltyPointsPer100: 5, loyaltyMaxRedeemPercent: 20 };
vi.mock('../settings/settings.service', () => ({ getSettings: async () => settings }));

const users: Record<string, { pointsBalance: number }> = {};
const entries: any[] = [];
const db = {
  user: {
    findUniqueOrThrow: async ({ where: { id } }: any) => { if (!users[id]) throw new Error('no user'); return { id, ...users[id] }; },
    update: async ({ where: { id }, data }: any) => {
      if (data.pointsBalance?.increment !== undefined) users[id].pointsBalance += data.pointsBalance.increment;
      if (data.pointsBalance?.decrement !== undefined) users[id].pointsBalance -= data.pointsBalance.decrement;
      return { id, ...users[id] };
    },
  },
  pointsEntry: {
    create: async ({ data }: any) => { entries.push(data); return data; },
    findFirst: async ({ where }: any) => entries.find((e) => e.userId === where.userId && e.orderId === where.orderId && e.reason === where.reason) ?? null,
    findMany: async ({ where }: any) => entries.filter((e) => e.orderId === where.orderId),
  },
} as any;

beforeEach(() => { Object.keys(users).forEach((k) => delete users[k]); entries.length = 0; users.u1 = { pointsBalance: 0 }; });

describe('pointsForSubtotal', () => {
  it('earns points at the configured rate', async () => {
    const { pointsForSubtotal } = await import('./points.service');
    // ₹100 subtotal * 5 points per ₹100 = 5 points
    expect(await pointsForSubtotal(100 * 100)).toBe(5);
    expect(await pointsForSubtotal(250 * 100)).toBe(12); // floor(2.5 * 5)
    expect(await pointsForSubtotal(0)).toBe(0);
  });
});

describe('pointsToPaise', () => {
  it('converts 1 point = ₹1 and never exceeds the cap', async () => {
    const { pointsToPaise } = await import('./points.service');
    expect(pointsToPaise(50, 10000)).toBe(5000);
    expect(pointsToPaise(500, 3000)).toBe(3000); // capped
    expect(pointsToPaise(0, 3000)).toBe(0);
  });
});

describe('creditPoints / debitPoints', () => {
  it('credits and updates the cached balance', async () => {
    const { creditPoints } = await import('./points.service');
    await creditPoints(db, 'u1', 20, 'EARNED_DELIVERY', 'o1');
    expect(users.u1.pointsBalance).toBe(20);
    expect(entries).toHaveLength(1);
  });
  it('is idempotent per order+reason (no double-crediting on retried transitions)', async () => {
    const { creditPoints } = await import('./points.service');
    await creditPoints(db, 'u1', 20, 'EARNED_DELIVERY', 'o1');
    await creditPoints(db, 'u1', 20, 'EARNED_DELIVERY', 'o1');
    expect(users.u1.pointsBalance).toBe(20);
    expect(entries).toHaveLength(1);
  });
  it('debits when enough balance, and rejects when not', async () => {
    const { creditPoints, debitPoints } = await import('./points.service');
    await creditPoints(db, 'u1', 100, 'EARNED_DELIVERY', 'o1');
    await debitPoints(db, 'u1', 30, 'o2');
    expect(users.u1.pointsBalance).toBe(70);
    await expect(debitPoints(db, 'u1', 1000, 'o3')).rejects.toThrow(/enough points/);
    expect(users.u1.pointsBalance).toBe(70); // unchanged on failure
  });
});

describe('reversePointsForOrder', () => {
  it('reverses both an earn and a redemption tied to a cancelled order', async () => {
    const { creditPoints, debitPoints, reversePointsForOrder } = await import('./points.service');
    users.u1.pointsBalance = 100;
    await debitPoints(db, 'u1', 40, 'o1'); // -40 -> 60
    await creditPoints(db, 'u1', 5, 'EARNED_DELIVERY', 'o1'); // +5 -> 65 (unlikely combo, but tests independence)
    await reversePointsForOrder(db, 'o1');
    expect(users.u1.pointsBalance).toBe(100); // back to original
  });
  it('does nothing for an order with no entries', async () => {
    const { reversePointsForOrder } = await import('./points.service');
    users.u1.pointsBalance = 10;
    await reversePointsForOrder(db, 'no-such-order');
    expect(users.u1.pointsBalance).toBe(10);
  });
});
