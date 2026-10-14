import { describe, expect, it, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

let cards: Record<string, any> = {};
const redemptions: any[] = [];
const db = {
  giftCard: {
    findUnique: async ({ where: { id, code } }: any) => (id ? cards[Object.keys(cards).find((k) => cards[k].id === id)!] : cards[code]) ?? null,
    updateMany: async ({ where, data }: any) => {
      const c = cards[Object.keys(cards).find((k) => cards[k].id === where.id) ?? ''];
      if (!c || c.balance < where.balance.gte) return { count: 0 };
      c.balance -= data.balance.decrement; return { count: 1 };
    },
    update: async ({ where: { id }, data }: any) => {
      const c = cards[Object.keys(cards).find((k) => cards[k].id === id) ?? ''];
      c.balance += data.balance.increment; return c;
    },
  },
  giftCardRedemption: {
    create: async ({ data }: any) => { redemptions.push(data); return data; },
    findMany: async ({ where }: any) => redemptions.filter((r) => r.orderId === where.orderId),
  },
} as any;

beforeEach(() => {
  cards = { 'LENS-ABCD-1234': { id: 'gc1', code: 'LENS-ABCD-1234', initialValue: 50000, balance: 50000, isActive: true, expiresAt: null } };
  redemptions.length = 0;
});

describe('generateGiftCardCode', () => {
  it('produces an unambiguous LENS-XXXX-XXXX code', async () => {
    const { generateGiftCardCode } = await import('./giftcard.service');
    const code = generateGiftCardCode();
    expect(code).toMatch(/^LENS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[0O1I]/);
  });
});

describe('findUsableGiftCard', () => {
  it('finds an active card with balance', async () => {
    const { findUsableGiftCard } = await import('./giftcard.service');
    const gc = await findUsableGiftCard(db, 'lens-abcd-1234'); // case/space insensitive
    expect(gc.balance).toBe(50000);
  });
  it('rejects unknown, inactive, expired or empty cards', async () => {
    const { findUsableGiftCard } = await import('./giftcard.service');
    await expect(findUsableGiftCard(db, 'NOPE')).rejects.toThrow(/not found/);
    cards['LENS-ABCD-1234'].isActive = false;
    await expect(findUsableGiftCard(db, 'LENS-ABCD-1234')).rejects.toThrow(/deactivated/);
    cards['LENS-ABCD-1234'].isActive = true; cards['LENS-ABCD-1234'].expiresAt = new Date(Date.now() - 1000);
    await expect(findUsableGiftCard(db, 'LENS-ABCD-1234')).rejects.toThrow(/expired/);
    cards['LENS-ABCD-1234'].expiresAt = null; cards['LENS-ABCD-1234'].balance = 0;
    await expect(findUsableGiftCard(db, 'LENS-ABCD-1234')).rejects.toThrow(/no balance/);
  });
});

describe('redeemGiftCard', () => {
  it('deducts only up to the cap, and only up to the balance', async () => {
    const { redeemGiftCard } = await import('./giftcard.service');
    const applied = await redeemGiftCard(db, 'LENS-ABCD-1234', 'u1', 'o1', 20000);
    expect(applied).toBe(20000);
    expect(cards['LENS-ABCD-1234'].balance).toBe(30000);
    const applied2 = await redeemGiftCard(db, 'LENS-ABCD-1234', 'u1', 'o2', 100000); // more than remaining balance
    expect(applied2).toBe(30000);
    expect(cards['LENS-ABCD-1234'].balance).toBe(0);
    expect(redemptions).toHaveLength(2);
  });
  it('returns 0 without touching the balance when the cap is 0', async () => {
    const { redeemGiftCard } = await import('./giftcard.service');
    const applied = await redeemGiftCard(db, 'LENS-ABCD-1234', 'u1', 'o1', 0);
    expect(applied).toBe(0);
    expect(cards['LENS-ABCD-1234'].balance).toBe(50000);
    expect(redemptions).toHaveLength(0);
  });
});

describe('refundGiftCardForOrder', () => {
  it('puts redeemed amounts back on cancellation', async () => {
    const { redeemGiftCard, refundGiftCardForOrder } = await import('./giftcard.service');
    await redeemGiftCard(db, 'LENS-ABCD-1234', 'u1', 'o1', 20000);
    expect(cards['LENS-ABCD-1234'].balance).toBe(30000);
    await refundGiftCardForOrder(db, 'o1');
    expect(cards['LENS-ABCD-1234'].balance).toBe(50000);
  });
});
