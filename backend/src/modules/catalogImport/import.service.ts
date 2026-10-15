import { FrameMaterial, FrameShape, FrameSize, Gender, LensType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Bulk catalogue import (admin → Frames → Bulk import): thousands of frames, lenses and coatings from a CSV
 * (Excel / Google Sheets → “Save as CSV”). Re-importing updates prices and stock without duplicates.
 */
export type Kind = 'frames' | 'lenses' | 'coatings';
export interface RowError { row: number; message: string }
export interface ImportResult { kind: Kind; rows: number; created: number; updated: number; skipped: number; errors: RowError[]; dryRun: boolean }

// ---------- CSV ----------
/** RFC-4180 CSV: quotes, commas and line breaks inside quotes, CRLF, BOM. Also accepts ; or tab separators. */
export function parseCsv(text: string): Record<string, string>[] {
  const t = text.replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// ---------- value helpers ----------
const pick = (r: Record<string, string>, ...names: string[]) => { for (const n of names) if (r[n] !== undefined && r[n] !== '') return r[n]; return ''; };
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
/** "₹1,799", "1799.00", "Rs 1799" → paise */
const money = (v: string) => { const n = Number(v.replace(/[^\d.]/g, '')); return v && Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const num = (v: string) => { const n = Number(v.replace(/[^\d.+-]/g, '')); return v && Number.isFinite(n) ? n : NaN; };
const yes = (v: string, dflt: boolean) => (!v ? dflt : /^(y|yes|true|1|active|on)$/i.test(v));

const SHAPES: Record<string, FrameShape> = {
  rectangle: 'RECTANGLE', rectangular: 'RECTANGLE', rect: 'RECTANGLE', round: 'ROUND', circle: 'ROUND', panto: 'ROUND',
  cat_eye: 'CAT_EYE', cateye: 'CAT_EYE', cat: 'CAT_EYE', butterfly: 'CAT_EYE', aviator: 'AVIATOR', pilot: 'AVIATOR', teardrop: 'AVIATOR',
  wayfarer: 'WAYFARER', square: 'SQUARE', oval: 'OVAL', geometric: 'GEOMETRIC', hexagon: 'GEOMETRIC', hexagonal: 'GEOMETRIC', octagon: 'GEOMETRIC', clubmaster: 'WAYFARER', browline: 'WAYFARER',
};
const MATERIALS: Record<string, FrameMaterial> = {
  acetate: 'ACETATE', plastic: 'ACETATE', cellulose: 'ACETATE', metal: 'METAL', steel: 'METAL', stainless_steel: 'METAL', alloy: 'METAL', aluminium: 'METAL', aluminum: 'METAL',
  titanium: 'TITANIUM', beta_titanium: 'TITANIUM', tr90: 'TR90', tr_90: 'TR90', ultem: 'TR90', nylon: 'TR90', mixed: 'MIXED', combination: 'MIXED', metal_acetate: 'MIXED',
};
const GENDERS: Record<string, Gender> = { men: 'MEN', man: 'MEN', male: 'MEN', gents: 'MEN', women: 'WOMEN', woman: 'WOMEN', female: 'WOMEN', ladies: 'WOMEN', unisex: 'UNISEX', all: 'UNISEX', kids: 'KIDS', kid: 'KIDS', children: 'KIDS', child: 'KIDS', boys: 'KIDS', girls: 'KIDS' };
const LENS_TYPES: Record<string, LensType> = {
  single_vision: 'SINGLE_VISION_DISTANCE', single_vision_distance: 'SINGLE_VISION_DISTANCE', distance: 'SINGLE_VISION_DISTANCE', sv: 'SINGLE_VISION_DISTANCE', single_vision_reading: 'SINGLE_VISION_READING', reading: 'SINGLE_VISION_READING',
  bifocal: 'BIFOCAL', kryptok: 'BIFOCAL', d_bifocal: 'BIFOCAL', progressive: 'PROGRESSIVE', varifocal: 'PROGRESSIVE', multifocal: 'PROGRESSIVE', zero_power: 'ZERO_POWER', zero: 'ZERO_POWER', plano: 'ZERO_POWER', no_power: 'ZERO_POWER', computer: 'ZERO_POWER',
};
const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const SIZES: Record<string, FrameSize> = { s: 'SMALL', small: 'SMALL', narrow: 'SMALL', m: 'MEDIUM', medium: 'MEDIUM', regular: 'MEDIUM', l: 'WIDE', large: 'WIDE', wide: 'WIDE', xl: 'WIDE', extra_wide: 'WIDE' };
export const sizeFromWidth = (w: number): FrameSize => (w < 132 ? 'SMALL' : w <= 140 ? 'MEDIUM' : 'WIDE');

/** Common eyewear colour names → hex, so the sheet only needs the colour name. */
const COLOUR_HEX: Record<string, string> = {
  black: '#1B1F3B', matte_black: '#2A2A2E', glossy_black: '#111111', brown: '#6B3E26', dark_brown: '#4A2C1A', tortoise: '#7A4A2A', havana: '#8B5A2B', demi: '#7A4A2A', tortoiseshell: '#7A4A2A',
  gold: '#C9A24A', rose_gold: '#B76E79', silver: '#A7ABB3', gunmetal: '#5B5F66', grey: '#8A8F98', gray: '#8A8F98', blue: '#2D5A8C', navy: '#1F2A55', light_blue: '#7FB3E6', teal: '#1F7A7A',
  red: '#B3261E', wine: '#7A2E3A', maroon: '#6D1F2B', burgundy: '#6D1F2B', pink: '#E8A0B4', peach: '#F2B48C', purple: '#6B3FA0', lavender: '#B9A3E3', plum: '#5A2D5C', green: '#2F6B3A', olive: '#6B6B2F',
  white: '#F2F2F2', ivory: '#EFE6D2', transparent: '#D9DEE7', crystal: '#D9DEE7', clear: '#D9DEE7', nude: '#D8B79E', beige: '#D8C3A5', yellow: '#E0B32E', orange: '#E07B2E', copper: '#B06A3B', bronze: '#8C6A3F',
};
export function colourHex(name: string, hex: string) {
  if (/^#?[0-9a-f]{6}$/i.test(hex)) return '#' + hex.replace('#', '').toUpperCase();
  const k = key(name);
  return COLOUR_HEX[k] ?? COLOUR_HEX[Object.keys(COLOUR_HEX).find((c) => k.includes(c)) ?? ''] ?? '#555B66';
}

// ---------- frames ----------
interface FrameRow { row: number; slug: string; product: Omit<Prisma.ProductCreateInput, 'slug'>; variant: { sku: string; colorName: string; colorHex: string; size: FrameSize; stock: number; priceDelta: number }; images: string[] }

function readFrame(r: Record<string, string>, row: number): FrameRow | RowError {
  const name = pick(r, 'name', 'frame_name', 'product_name', 'model');
  if (!name) return { row, message: 'name is missing' };
  const shape = SHAPES[key(pick(r, 'shape', 'frame_shape'))];
  if (!shape) return { row, message: `shape "${pick(r, 'shape')}" isn't known (use: rectangle, round, cat eye, aviator, wayfarer, square, oval, geometric)` };
  const material = MATERIALS[key(pick(r, 'material', 'frame_material'))] ?? (pick(r, 'material') ? undefined : 'ACETATE');
  if (!material) return { row, message: `material "${pick(r, 'material')}" isn't known (use: acetate/plastic, metal, titanium, TR90, mixed)` };
  const gender = GENDERS[key(pick(r, 'gender', 'for'))] ?? 'UNISEX';
  const price = money(pick(r, 'price', 'selling_price', 'sale_price'));
  if (!(price > 0)) return { row, message: 'price is missing or not a number' };
  const mrp = money(pick(r, 'mrp', 'list_price')) || price;
  const lens = num(pick(r, 'lens_width', 'lens', 'eye_size', 'a')), bridge = num(pick(r, 'bridge', 'dbl')), temple = num(pick(r, 'temple', 'arm', 'temple_length'));
  if (!(lens >= 30 && lens <= 70)) return { row, message: 'lens_width should be 30–70 (mm)' };
  if (!(bridge >= 10 && bridge <= 30)) return { row, message: 'bridge should be 10–30 (mm)' };
  if (!(temple >= 110 && temple <= 160)) return { row, message: 'temple should be 110–160 (mm)' };
  const frameWidth = num(pick(r, 'frame_width', 'total_width')) || Math.round(2 * lens + bridge + 12);
  const type = key(pick(r, 'type', 'category'));
  const isSunglasses = /sun/.test(type) || /^(yes|true|1)$/i.test(pick(r, 'sunglasses'));
  const colorName = pick(r, 'colour', 'color', 'colour_name', 'color_name') || 'Black';
  const size = SIZES[key(pick(r, 'size'))] ?? sizeFromWidth(frameWidth);
  const stock = Math.max(0, Math.round(num(pick(r, 'stock', 'qty', 'quantity')) || 0));
  const brand = pick(r, 'brand') || 'Lensio';
  const slug = slugify(`${brand === 'Lensio' ? '' : brand + ' '}${name}`) || `frame-${row}`;
  const sku = (pick(r, 'sku', 'code', 'item_code') || `${slug}-${slugify(colorName)}-${size}`).toUpperCase().slice(0, 64);
  const images = pick(r, 'image_url', 'image', 'images', 'photo').split(/[|\s]+/).filter((u) => /^https?:\/\//i.test(u));
  return {
    row, slug, images,
    product: {
      name, brand, description: pick(r, 'description', 'details') || `${name}: ${shape.toLowerCase().replace('_', '-')} ${isSunglasses ? 'sunglasses' : 'frame'} in ${material.toLowerCase()}.`,
      shape, material, gender, isSunglasses, basePrice: price, mrp: Math.max(mrp, price),
      lensWidthMm: Math.round(lens), bridgeMm: Math.round(bridge), templeMm: Math.round(temple), frameWidthMm: Math.round(frameWidth),
      weightGrams: Math.round(num(pick(r, 'weight', 'weight_g', 'weight_grams'))) || null, isActive: yes(pick(r, 'active', 'is_active'), true),
    },
    variant: { sku, colorName, colorHex: colourHex(colorName, pick(r, 'colour_hex', 'color_hex', 'hex')), size, stock, priceDelta: money(pick(r, 'extra_price', 'price_delta')) || 0 },
  };
}

async function importFrames(rows: Record<string, string>[], dryRun: boolean): Promise<ImportResult> {
  const res: ImportResult = { kind: 'frames', rows: rows.length, created: 0, updated: 0, skipped: 0, errors: [], dryRun };
  const groups = new Map<string, FrameRow[]>();
  rows.forEach((r, i) => {
    const x = readFrame(r, i + 2);
    if ('message' in x) { res.errors.push(x); res.skipped++; return; }
    groups.set(x.slug, [...(groups.get(x.slug) ?? []), x]);
  });
  const existing = new Set((await prisma.product.findMany({ where: { slug: { in: [...groups.keys()] } }, select: { slug: true } })).map((p) => p.slug));
  for (const [slug, list] of groups) {
    existing.has(slug) ? res.updated++ : res.created++;
    if (dryRun) continue;
    const base = list[0];
    try {
      await prisma.$transaction(async (tx) => {
        const p = await tx.product.upsert({ where: { slug }, create: { slug, ...base.product }, update: base.product, include: { images: true } });
        for (const x of list) {
          await tx.frameVariant.upsert({ where: { sku: x.variant.sku }, create: { ...x.variant, productId: p.id }, update: { ...x.variant, productId: p.id } });
        }
        const have = new Set(p.images.map((i) => i.url));
        const add = [...new Set(list.flatMap((x) => x.images))].filter((u) => !have.has(u));
        if (add.length) await tx.productImage.createMany({ data: add.map((url, k) => ({ productId: p.id, url, sortOrder: p.images.length + k })) });
      });
    } catch (e) {
      existing.has(slug) ? res.updated-- : res.created--; res.skipped += list.length;
      res.errors.push({ row: base.row, message: `"${base.product.name}" could not be saved: ${(e as Error).message.split('\n').pop()?.slice(0, 120)}` });
    }
  }
  return res;
}

// ---------- lenses ----------
async function importLenses(rows: Record<string, string>[], dryRun: boolean): Promise<ImportResult> {
  const res: ImportResult = { kind: 'lenses', rows: rows.length, created: 0, updated: 0, skipped: 0, errors: [], dryRun };
  const items: { row: number; code: string; data: Omit<Prisma.LensPackageCreateInput, 'code'> }[] = [];
  rows.forEach((r, i) => {
    const row = i + 2, name = pick(r, 'name', 'lens_name');
    const lensType = LENS_TYPES[key(pick(r, 'type', 'lens_type'))];
    const index = num(pick(r, 'index', 'refractive_index')), price = money(pick(r, 'price', 'extra_price'));
    const sph = num(pick(r, 'max_sph', 'max_power', 'sph')), cyl = num(pick(r, 'max_cyl', 'cyl'));
    const err = !name ? 'name is missing' : !lensType ? `type "${pick(r, 'type')}" isn't known (single vision, reading, bifocal, progressive, zero power)`
      : !(index >= 1.4 && index <= 1.9) ? 'index should be like 1.50, 1.56, 1.60, 1.67, 1.74' : !(price >= 0) ? 'price is missing (0 = included)'
      : !(Math.abs(sph) <= 30) ? 'max_sph should be the highest power supported, e.g. 6' : null;
    if (err) { res.errors.push({ row, message: err }); res.skipped++; return; }
    items.push({ row, code: (pick(r, 'code') || slugify(name)).toUpperCase().replace(/-/g, '_').slice(0, 48), data: {
      name, lensType, index: new Prisma.Decimal(index.toFixed(2)), price, description: pick(r, 'description', 'details') || name,
      maxAbsSph: new Prisma.Decimal(Math.abs(sph || 0).toFixed(2)), maxAbsCyl: new Prisma.Decimal(Math.abs(cyl || 0).toFixed(2)),
      isActive: yes(pick(r, 'active'), true), sortOrder: Math.round(num(pick(r, 'sort', 'sort_order')) || 0),
    } });
  });
  const existing = new Set((await prisma.lensPackage.findMany({ where: { code: { in: items.map((x) => x.code) } }, select: { code: true } })).map((x) => x.code));
  for (const x of items) {
    existing.has(x.code) ? res.updated++ : res.created++;
    if (!dryRun) await prisma.lensPackage.upsert({ where: { code: x.code }, create: { code: x.code, ...x.data }, update: x.data });
  }
  return res;
}

// ---------- coatings ----------
async function importCoatings(rows: Record<string, string>[], dryRun: boolean): Promise<ImportResult> {
  const res: ImportResult = { kind: 'coatings', rows: rows.length, created: 0, updated: 0, skipped: 0, errors: [], dryRun };
  const items: { code: string; data: Omit<Prisma.CoatingCreateInput, 'code'> }[] = [];
  rows.forEach((r, i) => {
    const name = pick(r, 'name', 'coating'), price = money(pick(r, 'price'));
    if (!name || !(price >= 0)) { res.errors.push({ row: i + 2, message: !name ? 'name is missing' : 'price is missing (0 = free)' }); res.skipped++; return; }
    items.push({ code: (pick(r, 'code') || slugify(name)).toUpperCase().replace(/-/g, '_').slice(0, 48), data: { name, price, description: pick(r, 'description') || name, isActive: yes(pick(r, 'active'), true), sortOrder: Math.round(num(pick(r, 'sort')) || 0) } });
  });
  const existing = new Set((await prisma.coating.findMany({ where: { code: { in: items.map((x) => x.code) } }, select: { code: true } })).map((x) => x.code));
  for (const x of items) {
    existing.has(x.code) ? res.updated++ : res.created++;
    if (!dryRun) await prisma.coating.upsert({ where: { code: x.code }, create: { code: x.code, ...x.data }, update: x.data });
  }
  return res;
}

export const MAX_ROWS = 20000;
export async function importCatalog(kind: Kind, csv: string, dryRun: boolean): Promise<ImportResult> {
  const rows = parseCsv(csv);
  if (!rows.length) return { kind, rows: 0, created: 0, updated: 0, skipped: 0, errors: [{ row: 1, message: 'The file is empty or has no header row.' }], dryRun };
  if (rows.length > MAX_ROWS) return { kind, rows: rows.length, created: 0, updated: 0, skipped: rows.length, errors: [{ row: 1, message: `Too many rows (${rows.length}). Split the file into parts of ${MAX_ROWS} rows.` }], dryRun };
  const out = kind === 'frames' ? await importFrames(rows, dryRun) : kind === 'lenses' ? await importLenses(rows, dryRun) : await importCoatings(rows, dryRun);
  out.errors = out.errors.slice(0, 200);
  return out;
}

/** Example files the owner downloads, fills in and uploads. */
export const TEMPLATES: Record<Kind, string> = {
  frames: [
    'name,brand,type,shape,material,gender,price,mrp,lens_width,bridge,temple,frame_width,weight,colour,colour_hex,size,stock,sku,image_url,description,active',
    'Vista Rectangle,Lensio,eyeglasses,rectangle,acetate,unisex,1799,2999,52,18,140,,22,Matte black,,,10,,https://example.com/vista-black.jpg,Everyday rectangle frame,yes',
    'Vista Rectangle,Lensio,eyeglasses,rectangle,acetate,unisex,1799,2999,52,18,140,,22,Tortoise,,,6,,https://example.com/vista-tortoise.jpg,,yes',
    'Sky Aviator,Lensio,sunglasses,aviator,metal,men,2499,3999,58,14,145,,26,Gold,,wide,4,,,Polarised aviator sunglasses,yes',
  ].join('\n') + '\n',
  lenses: [
    'name,type,index,price,max_sph,max_cyl,description,active',
    'Clear 1.56,single vision,1.56,0,4,2,Everyday clear lens (included),yes',
    'Thin 1.60,single vision,1.60,1500,8,4,20% thinner; recommended above ±3,yes',
    'Progressive 1.56,progressive,1.56,3000,6,2,Distance + computer + reading with no line,yes',
  ].join('\n') + '\n',
  coatings: ['name,price,description,active', 'Anti-reflective,500,Cuts glare from headlights and screens,yes', 'Blue cut,1000,Filters blue light from screens,yes'].join('\n') + '\n',
};
