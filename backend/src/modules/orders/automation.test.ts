import { beforeEach, describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

// ---- in-memory stand-ins for the database and outside services ----
type Rx = { id: string; status: string; source: string; isHighPower: boolean; odSph: number | null; osSph: number | null };
const db = { order: null as any, rx: new Map<string, Rx>(), events: [] as string[], tracking: [] as string[] };
const settings = { ownerEmailAlerts: true, autoStartLensWork: true, autoApproveTypedRx: false, frameOnlyToQc: true };
const alerts: string[] = [], customerMsgs: string[] = [];

const orderView = () => ({ ...db.order, user: { id: 'u1', email: 'c@x.com', name: 'Asha', phone: null },
  items: db.order.items.map((i: any) => ({ ...i, prescription: i.prescriptionId ? db.rx.get(i.prescriptionId) : null })) });
vi.mock('../../lib/prisma', () => {
  const tx = {
    orderStatusEvent: { create: async ({ data }: any) => { db.events.push(data.status); } },
    order: { update: async ({ data }: any) => { Object.assign(db.order, data); return db.order; } },
    trackingUpdate: { create: async ({ data }: any) => { db.tracking.push(data.message); } },
    orderItem: { findMany: async () => [] }, frameVariant: { update: async () => ({}) }, couponUse: { deleteMany: async () => ({}) }, pointsEntry: { findMany: async () => [], findFirst: async () => null, create: async () => ({}) }, giftCardRedemption: { findMany: async () => [] },
  };
  return { prisma: {
    order: { findUnique: async () => orderView() },
    prescription: {
      update: async ({ where, data }: any) => { Object.assign(db.rx.get(where.id)!, data); },
      findMany: async ({ where }: any) => where.id.in.map((id: string) => db.rx.get(id)).filter(Boolean),
    },
    payment: { findFirst: async () => null },
    $transaction: async (fn: any) => fn(tx),
  } };
});
vi.mock('../settings/settings.service', () => ({ getSettings: async () => settings }));
vi.mock('../notifications/owner.service', () => ({ alertOwner: async (k: string, t: string) => { alerts.push(`${k}: ${t}`); } }));
vi.mock('../notifications/whatsapp.service', () => ({ notifyOrderStatus: async (o: any) => { customerMsgs.push(o.status); }, STATUS_LABEL: {} }));
vi.mock('../shipping/shiprocket.service', () => ({ shiprocketEnabled: () => true,
  createShipment: async () => ({ shiprocketOrderId: 'SR1', awbCode: 'AWB123', courierName: 'Delhivery', trackingUrl: 'https://t/AWB123' }) }));
vi.mock('../payments/razorpay.service', () => ({ refundPayment: async () => ({}) }));

const { transition, onOrderPlaced } = await import('./orders.service');
const settle = () => new Promise((r) => setTimeout(r, 30)); // automation runs right after each step

const lensItem = (rxId: string | null) => ({ id: 'i1', productName: 'Vista', variantLabel: 'Black', quantity: 1, unitPrice: 1, variantId: 'v', coatingCodes: [],
  lensPackageId: 'l', lensPackage: { name: 'Thin 1.60', lensType: 'SINGLE_VISION_DISTANCE' }, prescriptionId: rxId });
const newOrder = (items: any[], status = 'PLACED') => ({ id: 'o1', orderNumber: 'LNS1', userId: 'u1', status, total: 250000, paymentMethod: 'COD',
  needsPrescription: items.some((i) => i.lensPackage), awbCode: null, shippingSnapshot: { fullName: 'Asha', phone: '9000000000' }, createdAt: new Date(), items });

beforeEach(() => {
  db.rx.clear(); db.events = []; db.tracking = []; alerts.length = 0; customerMsgs.length = 0;
  Object.assign(settings, { ownerEmailAlerts: true, autoStartLensWork: true, autoApproveTypedRx: false, frameOnlyToQc: true });
});

describe('order automation', () => {
  it('frame-only orders go straight to quality check, and the owner is told about the new order', async () => {
    db.order = newOrder([{ ...lensItem(null), lensPackageId: null, lensPackage: null }]);
    await onOrderPlaced('o1'); await settle();
    expect(db.order.status).toBe('QUALITY_CHECK');
    expect(alerts[0]).toMatch(/^new_order: New order LNS1/);
    expect(customerMsgs).not.toContain('QUALITY_CHECK'); // quiet in-between step
  });

  it('zero-power glasses need no prescription approval: lens work starts straight away', async () => {
    db.order = newOrder([{ ...lensItem(null), lensPackage: { name: 'Zero power + blue cut', lensType: 'ZERO_POWER' } }]);
    db.order.needsPrescription = false;
    await onOrderPlaced('o1'); await settle();
    expect(db.order.status).toBe('LENS_CUTTING_FITTING');
    expect(db.events).toEqual(['LENS_CUTTING_FITTING']);
  });

  it('zero-power orders never get stuck, even with "frame-only to QC" switched off', async () => {
    settings.frameOnlyToQc = false;
    db.order = newOrder([{ ...lensItem(null), lensPackage: { name: 'Zero power', lensType: 'ZERO_POWER' } }]);
    db.order.needsPrescription = false;
    await onOrderPlaced('o1'); await settle();
    expect(db.order.status).toBe('LENS_CUTTING_FITTING');
  });

  it('power lenses always wait for the shop to approve the prescription', async () => {
    db.rx.set('rx1', { id: 'rx1', status: 'PENDING_REVIEW', source: 'MANUAL', isHighPower: false, odSph: -2, osSph: -2 });
    db.order = newOrder([lensItem('rx1')]);
    await onOrderPlaced('o1'); await settle();
    expect(db.order.status).toBe('PLACED');
    expect(db.rx.get('rx1')!.status).toBe('PENDING_REVIEW');
  });

  it('waits for an uploaded prescription to be reviewed by a person', async () => {
    db.rx.set('rx1', { id: 'rx1', status: 'PENDING_REVIEW', source: 'UPLOAD', isHighPower: false, odSph: null, osSph: null });
    db.order = newOrder([lensItem('rx1')]);
    await onOrderPlaced('o1'); await settle();
    expect(db.order.status).toBe('PLACED');
  });

  it('auto-approves typed prescriptions when switched on, then starts lens work', async () => {
    settings.autoApproveTypedRx = true;
    db.rx.set('rx1', { id: 'rx1', status: 'PENDING_REVIEW', source: 'MANUAL', isHighPower: false, odSph: -1, osSph: -1.25 });
    db.order = newOrder([lensItem('rx1')]);
    await onOrderPlaced('o1'); await settle(); await settle();
    expect(db.rx.get('rx1')!.status).toBe('VERIFIED');
    expect(db.events).toEqual(['PRESCRIPTION_VERIFIED', 'LENS_CUTTING_FITTING']);
    expect(customerMsgs).toEqual(['LENS_CUTTING_FITTING']); // one message, not two
  });

  it('never auto-approves high-power prescriptions', async () => {
    settings.autoApproveTypedRx = true;
    db.rx.set('rx1', { id: 'rx1', status: 'PENDING_REVIEW', source: 'MANUAL', isHighPower: true, odSph: -8, osSph: -8 });
    db.order = newOrder([lensItem('rx1')]);
    await onOrderPlaced('o1'); await settle();
    expect(db.rx.get('rx1')!.status).toBe('PENDING_REVIEW');
    expect(db.order.status).toBe('PLACED');
  });

  it('after an optician verifies, lens work starts by itself', async () => {
    db.rx.set('rx1', { id: 'rx1', status: 'VERIFIED', source: 'UPLOAD', isHighPower: false, odSph: -1, osSph: -1 });
    db.order = newOrder([lensItem('rx1')]);
    await transition('o1', 'PRESCRIPTION_VERIFIED', { actorId: 'optician' }); await settle();
    expect(db.order.status).toBe('LENS_CUTTING_FITTING');
  });

  it('stops at each stage when automation is switched off', async () => {
    settings.autoStartLensWork = false;
    db.rx.set('rx1', { id: 'rx1', status: 'VERIFIED', source: 'UPLOAD', isHighPower: false, odSph: -1, osSph: -1 });
    db.order = newOrder([lensItem('rx1')]);
    await transition('o1', 'PRESCRIPTION_VERIFIED', { actorId: 'optician' }); await settle();
    expect(db.order.status).toBe('PRESCRIPTION_VERIFIED');
  });

  it('"ready to ship" books the courier and records the tracking number', async () => {
    db.order = newOrder([lensItem(null)], 'QUALITY_CHECK');
    await transition('o1', 'DISPATCHED', { actorId: 'staff' });
    expect(db.order.awbCode).toBe('AWB123');
    expect(db.tracking[0]).toMatch(/Courier booked with Delhivery · tracking number AWB123/);
  });

  it('tells the owner when a customer cancels', async () => {
    db.order = newOrder([lensItem(null)]);
    await transition('o1', 'CANCELLED', { actorId: 'u1', note: 'Changed my mind' });
    expect(alerts.some((a) => a.startsWith('cancelled:'))).toBe(true);
  });
});
