import { beforeEach, describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';
const state = { order: { id: 'o1', orderNumber: 'LNS1', status: 'DISPATCHED', awbCode: 'AWB1', user: { email: 'c@x.com', name: 'Asha' }, address: { phone: '9876543210' } } as any, updates: [] as any[] };
const mails: string[] = [], alerts: string[] = [], moves: string[] = [];
vi.mock('../../lib/prisma', () => ({ prisma: {
  order: { findUnique: async () => state.order },
  trackingUpdate: {
    findFirst: async ({ where }: any) => state.updates.find((u) => u.message === where.message && u.location === where.location) ?? null,
    create: async ({ data }: any) => { state.updates.push(data); },
  },
} }));
vi.mock('../notifications/whatsapp.service', () => ({ notifyOrderUpdate: async (o: any) => { mails.push(`${o.phone} ${o.email} Order ${o.orderNumber}: ${o.headline}`); } }));
vi.mock('../notifications/owner.service', () => ({ alertOwner: async (k: string) => { alerts.push(k); } }));
vi.mock('../orders/orders.service', () => ({ transition: async (_id: string, to: string) => { moves.push(to); } }));
const { recordCourierStatus } = await import('./courier');
beforeEach(() => { state.updates = []; mails.length = 0; alerts.length = 0; moves.length = 0; });

describe('automatic courier tracking', () => {
  it('turns courier scans into plain updates and messages key milestones on WhatsApp + email', async () => {
    await recordCourierStatus('o1', { status: 'PICKED UP', location: 'Bengaluru' });
    await recordCourierStatus('o1', { status: 'IN TRANSIT', activity: 'Bag forwarded to hub', location: 'Hubli' });
    await recordCourierStatus('o1', { status: 'OUT FOR DELIVERY', location: 'Belagavi' });
    expect(state.updates.map((u) => u.message)).toEqual(['Picked up by the courier', 'In transit', 'Out for delivery']);
    expect(mails).toEqual(['9876543210 c@x.com Order LNS1: Picked up by the courier', '9876543210 c@x.com Order LNS1: Out for delivery']);
  });
  it('ignores the same scan reported twice (webhook + backup check)', async () => {
    await recordCourierStatus('o1', { status: 'IN TRANSIT', location: 'Hubli' });
    await recordCourierStatus('o1', { status: 'IN TRANSIT', location: 'Hubli' });
    expect(state.updates).toHaveLength(1);
  });
  it('marks the order delivered automatically', async () => {
    await recordCourierStatus('o1', { status: 'DELIVERED', location: 'Belagavi' });
    expect(moves).toEqual(['DELIVERED']);
  });
  it('alerts the owner about problems (and does not mark "undelivered" as delivered)', async () => {
    await recordCourierStatus('o1', { status: 'UNDELIVERED', activity: 'Customer not available' });
    await recordCourierStatus('o1', { status: 'RTO INITIATED' });
    expect(moves).toEqual([]);
    expect(alerts).toEqual(['courier_problem', 'courier_problem']);
  });
});
