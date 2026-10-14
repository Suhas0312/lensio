import { describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

const orders = [
  { id: 'o1', orderNumber: 'LNS1', pointsEarned: 90, user: { email: 'a@x.com', name: 'Asha' }, address: { phone: '9876543210' }, items: [{ productName: 'Vista' }, { productName: 'Vista' }], reviews: [] },
  { id: 'o2', orderNumber: 'LNS2', pointsEarned: 0, user: { email: 'b@x.com', name: 'Ben' }, address: { phone: '9876543211' }, items: [{ productName: 'Orbit' }], reviews: [{ id: 'r' }] }, // already reviewed
  { id: 'o3', orderNumber: 'LNS3', pointsEarned: 0, user: { email: null, name: 'C' }, address: { phone: '9876543212' }, items: [{ productName: 'Iris' }], reviews: [] },            // no email
];
const marked: string[] = [];
let lastWhere: any;
vi.mock('../lib/prisma', () => ({ prisma: { order: {
  findMany: async (q: any) => { lastWhere = q.where; return orders; },
  update: async ({ where }: any) => { marked.push(where.id); return {}; },
} } }));
const sent: any[] = [];
vi.mock('../lib/mail', () => ({ sendReviewRequestEmail: async (...a: any[]) => { sent.push(a); return true; } }));
const wa: any[] = [];
vi.mock('../modules/notifications/whatsapp.service', () => ({ notifyOrderUpdate: async (o: any) => { wa.push(o); } }));
vi.mock('../modules/orders/orders.service', () => ({ transition: async () => ({}) }));
vi.mock('../modules/orders/orders.routes', () => ({ remindMissingPrescriptions: async () => {} }));
vi.mock('../modules/shipping/shiprocket.service', () => ({ shiprocketEnabled: () => false, trackAwb: async () => ({}) }));
vi.mock('../modules/shipping/courier', () => ({ recordCourierStatus: async () => {} }));
vi.mock('../modules/instagram/instagram.service', () => ({ refreshToken: async () => {} }));

describe('sendReviewRequests', () => {
  it('asks each delivered order once (WhatsApp + email), skipping reviewed ones', async () => {
    const { sendReviewRequests } = await import('./runner');
    await sendReviewRequests();
    expect(lastWhere).toMatchObject({ status: 'DELIVERED', reviewRequestedAt: null });
    expect(marked).toEqual(['o1', 'o2', 'o3']);          // all marked, so none are retried
    expect(sent).toHaveLength(1);                        // only Asha gets an email
    expect(sent[0][0]).toBe('a@x.com');
    expect(sent[0][3]).toEqual(['Vista']);               // product names de-duplicated
    expect(sent[0][4]).toMatch(/\/rewards$/);
    expect(sent[0][5]).toBe(90);                         // points mentioned
    expect(wa.map((m) => m.phone)).toEqual(['9876543210', '9876543212']); // WhatsApp even without an email
    expect(wa[0].detail).toMatch(/90 bonus points/);
  });
});
