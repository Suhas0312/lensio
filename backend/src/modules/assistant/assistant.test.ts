import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';
const product = (name: string, slug: string, shape: string, price: number) => ({
  name, slug, shape, material: 'ACETATE', gender: 'UNISEX', isSunglasses: false, basePrice: price, mrp: price + 100000,
  lensWidthMm: 52, bridgeMm: 18, templeMm: 140, ratingCount: 10, images: [{ url: 'https://x/y.png' }],
  variants: [{ colorName: 'Black', size: 'MEDIUM', stock: 5 }],
});
vi.mock('../../lib/prisma', () => ({ prisma: {
  product: { findMany: async () => [product('Vista Rectangle', 'vista', 'RECTANGLE', 179900), product('Orbit Round', 'orbit', 'ROUND', 249900)] },
  lensPackage: { findMany: async () => [{ name: 'Blue cut 1.56', lensType: 'SINGLE_VISION_DISTANCE', index: '1.56', price: 0, description: 'Everyday lens.', maxAbsSph: 4, maxAbsCyl: 2 }] },
  coating: { findMany: async () => [{ name: 'Anti-reflective', price: 50000, description: 'Less glare.' }] },
  order: { findMany: async () => [{ orderNumber: 'LNS1', createdAt: new Date(), updatedAt: new Date(), status: 'LENS_CUTTING_FITTING', total: 250000,
    needsPrescription: true, trackingUrl: null, items: [{ productName: 'Vista Rectangle', prescriptionId: 'rx', lensPackageId: 'l' }], tracking: [] }] },
} }));
vi.mock('../settings/settings.service', () => ({ getSettings: async () => ({ upiId: 'shop@ybl', upiQrImage: null, codEnabled: true, shopInfo: '7-day returns on unused frames.' }) }));

const { chat } = await import('./assistant.service');
const { estimateDelivery } = await import('../orders/tracking');

afterEach(() => { vi.unstubAllGlobals(); delete process.env.GEMINI_API_KEY; });

describe('assistant (basic mode, no AI key)', () => {
  it('lists the signed-in customer\'s orders', async () => {
    const r = await chat([{ role: 'user', text: 'where is my order?' }], 'user1');
    expect(r.mode).toBe('basic');
    expect(r.reply).toContain('LNS1');
    expect(r.reply).toContain('Lens cutting');
  });
  it('asks guests to sign in for order questions and offers WhatsApp', async () => {
    const r = await chat([{ role: 'user', text: 'track my order' }], null);
    expect(r.reply).toMatch(/sign in/i);
    expect(r.handoff).toBe(true);
    expect(r.reply).not.toContain('[HANDOFF]');
  });
  it('explains prescription terms', async () => {
    const r = await chat([{ role: 'user', text: 'what is CYL in my prescription' }], null);
    expect(r.reply).toMatch(/astigmatism/);
  });
  it('turns frame names in the reply into product cards', async () => {
    const r = await chat([{ role: 'user', text: 'suggest some frames' }], null);
    expect(r.products.map((p) => p.slug)).toEqual(expect.arrayContaining(['vista', 'orbit']));
  });
});

describe('assistant (AI mode)', () => {
  it('sends catalog + rules to Gemini and returns its answer with cards', async () => {
    const { env } = await import('../../config/env');
    (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = 'test-key';
    let sent: any;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      sent = { url, body: JSON.parse(init.body), headers: init.headers };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'For a round face, try Vista Rectangle. [HANDOFF]' }] } }] }), { status: 200 });
    }));
    const r = await chat([{ role: 'user', text: 'I have a round face' }, ], 'user1');
    (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined;
    expect(r.mode).toBe('ai');
    expect(r.reply).toBe('For a round face, try Vista Rectangle.');
    expect(r.handoff).toBe(true);
    expect(r.products[0].slug).toBe('vista');
    expect(sent.headers['x-goog-api-key']).toBe('test-key');
    const sys = sent.body.systemInstruction.parts[0].text;
    expect(sys).toContain('Vista Rectangle');
    expect(sys).toContain('7-day returns');
    expect(sys).toContain('Never diagnose');
    expect(sent.body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'I have a round face' }] });
  });
  it('falls back to basic answers if Gemini fails', async () => {
    const { env } = await import('../../config/env');
    (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota', { status: 429 })));
    const r = await chat([{ role: 'user', text: 'what payment options' }], null);
    (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined;
    expect(r.mode).toBe('basic');
    expect(r.reply).toMatch(/UPI/);
  });
});

describe('delivery estimate', () => {
  const base = { createdAt: new Date(), updatedAt: new Date(), needsPrescription: true };
  it('is hidden once delivered or cancelled', () => {
    expect(estimateDelivery({ ...base, status: 'DELIVERED' })).toBeNull();
    expect(estimateDelivery({ ...base, status: 'CANCELLED' })).toBeNull();
  });
  it('waits for the prescription when one is missing', () => {
    const e = estimateDelivery({ ...base, status: 'PLACED', items: [{ lensPackageId: 'l', prescriptionId: null }] });
    expect(e?.text).toMatch(/after we receive your prescription/);
  });
  it('never shows a date in the past for a late order', () => {
    const old = new Date(Date.now() - 20 * 86400_000);
    const e = estimateDelivery({ status: 'DISPATCHED', createdAt: old, updatedAt: old, needsPrescription: false });
    expect(e!.date.getTime()).toBeGreaterThan(Date.now());
  });
});
