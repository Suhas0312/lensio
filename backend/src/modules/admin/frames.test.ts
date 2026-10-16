import express from 'express';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

const db = { products: [] as any[], ordered: new Set<string>(), log: [] as string[] };
vi.mock('../../middleware/auth', () => ({ requireAuth: (_q: any, _r: any, n: any) => n(), requireRole: () => (_q: any, _r: any, n: any) => n() }));
vi.mock('../../lib/prisma', () => ({ prisma: {
  product: {
    findFirst: async ({ where }: any) => db.products.find((p) => p.name.toLowerCase() === where.name.equals.toLowerCase() && p.brand.toLowerCase() === where.brand.equals.toLowerCase() && (!where.id || p.id !== where.id.not)) ?? null,
    findUnique: async ({ where }: any) => db.products.find((p) => p.id === where.id) ?? null,
    create: async ({ data }: any) => { const p = { id: 'new', ...data }; db.products.push(p); return p; },
    update: async ({ where, data }: any) => { db.log.push(`update ${where.id} ${JSON.stringify(data)}`); return {}; },
    delete: async ({ where }: any) => { db.log.push(`delete ${where.id}`); db.products = db.products.filter((p) => p.id !== where.id); return {}; },
  },
  orderItem: { count: async ({ where }: any) => (db.ordered.has(where.variant.productId) ? 1 : 0) },
  frameVariant: { updateMany: async () => { db.log.push('stock 0'); return { count: 1 }; } },
  cartItem: { deleteMany: async () => ({ count: 0 }) },
  $transaction: async (ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops({})),
} }));
const { default: routes } = await import('./admin.routes');
const { errorHandler } = await import('../../middleware/error');

let base = '';
const server = express().use(express.json()).use('/a', routes).use(errorHandler).listen(0);
beforeAll(() => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/a`; });
afterAll(() => server.close());
beforeEach(() => { db.products = [{ id: 'p1', name: 'Oval TR90 · Wide', brand: 'Lensio' }, { id: 'p2', name: 'Vista Rectangle', brand: 'Lensio' }]; db.ordered = new Set(['p2']); db.log = []; });

const frame = (name: string) => ({ slug: 'x-' + Math.random().toString(36).slice(2, 6), name, description: 'd', shape: 'OVAL', material: 'TR90', gender: 'UNISEX', basePrice: 119900, mrp: 189900, lensWidthMm: 52, bridgeMm: 18, templeMm: 140, frameWidthMm: 134, images: [], variants: [{ sku: 'S' + Math.random().toString(36).slice(2, 8), colorName: 'Black', colorHex: '#111111', size: 'MEDIUM', stock: 1, priceDelta: 0 }] });
const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('frames: no double entries, safe delete', () => {
  it('refuses a second frame with the same name (any capitals)', async () => {
    const r = await post('/products', frame('oval tr90 · WIDE'));
    expect(r.status).toBe(409);
    expect((await r.json()).error.message).toMatch(/already exists/);
  });
  it('accepts a new name', async () => {
    expect((await post('/products', frame('Brand New Frame'))).status).toBe(201);
  });
  it('deletes a frame that was never ordered', async () => {
    const r = await (await fetch(base + '/products/p1', { method: 'DELETE' })).json();
    expect(r.result).toBe('deleted'); expect(db.log).toContain('delete p1');
  });
  it('hides (does not delete) a frame that is in past orders', async () => {
    const r = await (await fetch(base + '/products/p2', { method: 'DELETE' })).json();
    expect(r.result).toBe('hidden'); expect(db.log).not.toContain('delete p2'); expect(db.log).toContain('stock 0');
  });
});
