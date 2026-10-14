import { beforeEach, describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

// Anti-fraud: an order waiting for payment must not start until the money is confirmed.
const db = { order: null as any, captured: 0, events: [] as string[] };
vi.mock('../../lib/prisma', () => {
  const tx = {
    orderStatusEvent: { create: async ({ data }: any) => { db.events.push(data.status); } },
    order: { update: async ({ data }: any) => { Object.assign(db.order, data); return db.order; } },
    trackingUpdate: { create: async () => ({}) }, orderItem: { findMany: async () => [] }, frameVariant: { update: async () => ({}) },
    couponUse: { deleteMany: async () => ({}) }, pointsEntry: { findMany: async () => [], findFirst: async () => null, create: async () => ({}) }, giftCardRedemption: { findMany: async () => [] },
  };
  return { prisma: {
    order: { findUnique: async () => ({ ...db.order, items: [], user: { id: 'u1', email: 'c@x.com', name: 'Asha', phone: null } }) },
    payment: { count: async () => db.captured, findFirst: async () => null },
    prescription: { findMany: async () => [], update: async () => ({}) },
    $transaction: async (fn: any) => fn(tx),
  } };
});
vi.mock('../settings/settings.service', () => ({ getSettings: async () => ({ autoStartLensWork: false, frameOnlyToQc: false, autoApproveTypedRx: false, ownerEmailAlerts: false }) }));
vi.mock('../notifications/owner.service', () => ({ alertOwner: async () => {} }));
vi.mock('../notifications/whatsapp.service', () => ({ notifyOrderStatus: async () => {}, STATUS_LABEL: {} }));
vi.mock('../shipping/shiprocket.service', () => ({ shiprocketEnabled: () => false, createShipment: async () => null }));
vi.mock('../payments/razorpay.service', () => ({ refundPayment: async () => ({}) }));

const { transition } = await import('./orders.service');

describe('payment guard', () => {
  beforeEach(() => { db.order = { id: 'o1', orderNumber: 'LNS1', userId: 'u1', status: 'PAYMENT_PENDING', total: 179900, paymentMethod: 'UPI_MANUAL', needsPrescription: false }; db.captured = 0; db.events = []; });

  it('refuses to start an unpaid order', async () => {
    await expect(transition('o1', 'PLACED', { actorId: 'staff' })).rejects.toMatchObject({ code: 'PAYMENT_NOT_CONFIRMED' });
    expect(db.order.status).toBe('PAYMENT_PENDING');
    expect(db.events).toEqual([]);
  });
  it('starts the order once the payment is captured', async () => {
    db.captured = 1;
    await transition('o1', 'PLACED', { actorId: 'admin' });
    expect(db.order.status).toBe('PLACED');
  });
  it('still lets an unpaid order be cancelled', async () => {
    await transition('o1', 'CANCELLED', { actorId: 'admin', note: 'No payment' });
    expect(db.order.status).toBe('CANCELLED');
  });
});
