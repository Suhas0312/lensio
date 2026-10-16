import { beforeEach, describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

const db = { products: new Map<string, any>(), variants: new Map<string, any>(), images: [] as any[], lenses: new Map<string, any>(), coatings: new Map<string, any>() };
const tx = {
  product: { upsert: async ({ where, create, update }: any) => { const ex = db.products.get(where.slug); const p = ex ? { ...ex, ...update } : { id: 'p' + (db.products.size + 1), ...create }; db.products.set(where.slug, p); return { ...p, images: db.images.filter((i) => i.productId === p.id) }; } },
  frameVariant: { upsert: async ({ where, create, update }: any) => { db.variants.set(where.sku, db.variants.has(where.sku) ? { ...db.variants.get(where.sku), ...update } : create); } },
  productImage: { createMany: async ({ data }: any) => { db.images.push(...data); } },
};
vi.mock('../../lib/prisma', () => ({ prisma: {
  product: { findMany: async ({ where }: any) => where.slug.in.filter((s: string) => db.products.has(s)).map((slug: string) => ({ slug })),
    findUnique: async ({ where }: any) => (db.products.has(where.slug) ? { id: 'x' } : null) },
  lensPackage: { findMany: async () => [...db.lenses.keys()].map((code) => ({ code })), findUnique: async ({ where }: any) => (db.lenses.has(where.code) ? { id: 'x' } : null), upsert: async ({ where, create }: any) => db.lenses.set(where.code, create) },
  coating: { findMany: async () => [], upsert: async ({ where, create }: any) => db.coatings.set(where.code, create) },
  $transaction: async (fn: any) => fn(tx),
} }));
const { importCatalog, parseCsv, colourHex, TEMPLATES } = await import('./import.service');

beforeEach(() => { db.products.clear(); db.variants.clear(); db.images.length = 0; db.lenses.clear(); db.coatings.clear(); });

describe('CSV reading', () => {
  it('handles quotes, commas inside quotes, Excel BOM and semicolons', () => {
    expect(parseCsv('\uFEFFName,Description\n"Vista, black","He said ""wow"""\n')).toEqual([{ name: 'Vista, black', description: 'He said "wow"' }]);
    expect(parseCsv('name;price\nA;1799\n')).toEqual([{ name: 'A', price: '1799' }]);
  });
  it('knows eyewear colour names', () => { expect(colourHex('Tortoise', '')).toBe('#7A4A2A'); expect(colourHex('Matte Black', '')).toBe('#2A2A2E'); expect(colourHex('x', '#abcdef')).toBe('#ABCDEF'); });
});

describe('frames import', () => {
  it('turns one row per colour into one frame with several colours, then updates on re-import', async () => {
    const check = await importCatalog('frames', TEMPLATES.frames, true);
    expect(check).toMatchObject({ rows: 3, created: 2, updated: 0, errors: [] });
    expect(db.products.size).toBe(0);                                  // "Check file" saves nothing
    const r = await importCatalog('frames', TEMPLATES.frames, false);
    expect(r).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    const vista = db.products.get('vista-rectangle');
    expect(vista).toMatchObject({ shape: 'RECTANGLE', material: 'ACETATE', basePrice: 179900, mrp: 299900, frameWidthMm: 134, isSunglasses: false });
    expect([...db.variants.values()].filter((v) => v.productId === vista.id).map((v) => v.colorName)).toEqual(['Matte black', 'Tortoise']);
    expect(db.products.get('sky-aviator')).toMatchObject({ isSunglasses: true, gender: 'MEN' });
    const again = await importCatalog('frames', TEMPLATES.frames.replace('1799,2999', '1699,2999'), false);
    expect(again).toMatchObject({ created: 0, updated: 2 });
    expect(db.products.get('vista-rectangle').basePrice).toBe(169900);
    expect(db.images.length).toBe(2);                                  // photos not duplicated
  });
  it('explains bad rows by row number and still imports the good ones', async () => {
    const csv = 'name,shape,material,price,lens_width,bridge,temple\nGood One,cat eye,plastic,₹1,299,50,18,140\nBad,butterfly-x,metal,999,52,18,140\nNoPrice,round,metal,,52,18,140\n'.replace('₹1,299', '"₹1,299"');
    const r = await importCatalog('frames', csv, false);
    expect(r.created).toBe(1);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(r.errors[0].message).toMatch(/shape "butterfly-x" isn't known/);
    expect(db.products.get('good-one')).toMatchObject({ shape: 'CAT_EYE', material: 'ACETATE', basePrice: 129900 });
  });
});

describe('lenses and coatings import', () => {
  it('imports lens packages and coatings from the templates', async () => {
    expect(await importCatalog('lenses', TEMPLATES.lenses, false)).toMatchObject({ created: 3, errors: [] });
    expect(db.lenses.get('THIN_1_60')).toMatchObject({ lensType: 'SINGLE_VISION_DISTANCE', price: 150000 });
    expect(await importCatalog('coatings', TEMPLATES.coatings, false)).toMatchObject({ created: 2, errors: [] });
  });
});

describe('library files and options', () => {
  it('keeps codes written in the sheet (SVD-156 updates the existing lens, no duplicate)', async () => {
    db.lenses.set('SVD-156', { name: 'old' });
    const csv = 'code,name,type,index,price,max_sph,max_cyl\nSVD-156,Everyday 1.56,single vision,1.56,0,4,2\n';
    const r = await importCatalog('lenses', csv, false);
    expect(r).toMatchObject({ created: 0, updated: 1 });
    expect([...db.lenses.keys()]).toEqual(['SVD-156']);
  });
  it('imports the lens and coating library files with no errors', async () => {
    const fs = await import('fs');
    const l = await importCatalog('lenses', fs.readFileSync('../docs/catalog/lensio-lens-library.csv', 'utf8'), false);
    const c = await importCatalog('coatings', fs.readFileSync('../docs/catalog/lensio-coating-library.csv', 'utf8'), false);
    expect(l).toMatchObject({ rows: 14, created: 14, errors: [] });
    expect(c).toMatchObject({ rows: 11, created: 11, errors: [] });
    expect(db.lenses.get('PG-167')).toMatchObject({ lensType: 'PROGRESSIVE', price: 950000 });
    expect(db.coatings.has('POLARISED')).toBe(true);
  });
  it('"Show to customers right away" publishes the whole frame library with a starting stock', async () => {
    const fs = await import('fs');
    const r = await importCatalog('frames', fs.readFileSync('../docs/catalog/lensio-design-library.csv', 'utf8'), false, { showAll: true, defaultStock: 5 });
    expect(r).toMatchObject({ rows: 1545, created: 309, errors: [] });
    expect([...db.products.values()].every((p) => p.isActive)).toBe(true);
    expect([...db.variants.values()].every((v) => v.stock === 5)).toBe(true);
  });
  it('without the option, library frames stay hidden', async () => {
    const fs = await import('fs');
    await importCatalog('frames', fs.readFileSync('../docs/catalog/lensio-design-library.csv', 'utf8'), false);
    expect([...db.products.values()].every((p) => p.isActive === false)).toBe(true);
  });
});

describe('items that already exist: replace, keep both or skip', () => {
  const csv = 'name,shape,material,price,lens_width,bridge,temple,colour\nVista Rectangle,rectangle,acetate,1999,52,18,140,Black\nBrand New,round,metal,999,50,18,140,Gold\n';
  beforeEach(async () => { await importCatalog('frames', csv.split('\n').slice(0, 2).join('\n').replace('1999', '1799'), false); });   // only Vista is in the shop
  it('“Check file” lists what already exists', async () => {
    const r = await importCatalog('frames', csv, true);
    expect(r.existing).toEqual([{ key: 'vista-rectangle', name: 'Vista Rectangle', row: 2 }]);
  });
  it('replace updates the existing frame', async () => {
    const r = await importCatalog('frames', csv, false, { onExisting: 'replace' });
    expect(r).toMatchObject({ created: 1, updated: 1 });           // Brand New is new, Vista is updated
    expect(db.products.get('vista-rectangle').basePrice).toBe(199900);
  });
  it('skip leaves the existing frame as it was', async () => {
    const r = await importCatalog('frames', csv, false, { onExisting: 'skip' });
    expect(r.updated).toBe(0); expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect(db.products.get('vista-rectangle').basePrice).toBe(179900);
  });
  it('keep both adds a copy with its own name, link and stock codes', async () => {
    const r = await importCatalog('frames', csv, false, { onExisting: 'skip', choices: { 'vista-rectangle': 'both' } });
    expect(r.copies).toBe(1);
    expect(db.products.get('vista-rectangle-2')).toMatchObject({ name: 'Vista Rectangle (2)', basePrice: 199900 });
    expect(db.products.get('vista-rectangle').basePrice).toBe(179900);
    expect([...db.variants.keys()].some((k) => k.endsWith('-2'))).toBe(true);
  });
  it('works for lenses too', async () => {
    db.lenses.set('SVD-156', {});
    const lcsv = 'code,name,type,index,price,max_sph\nSVD-156,Everyday,single vision,1.56,0,4\n';
    expect((await importCatalog('lenses', lcsv, true)).existing.map((e) => e.key)).toEqual(['SVD-156']);
    await importCatalog('lenses', lcsv, false, { onExisting: 'both' });
    expect(db.lenses.get('SVD-156_2')).toMatchObject({ name: 'Everyday (2)' });
  });
});
