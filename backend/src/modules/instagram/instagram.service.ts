import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { AppError, badRequest } from '../../lib/errors';
import { putPublicFile } from '../../lib/storage';
import { parseCaption } from './caption';

/**
 * Instagram API with Instagram Login (professional/creator/business accounts).
 * Token: a long-lived user token (valid 60 days). The admin pastes it once; we refresh it weekly.
 */
const API = 'https://graph.instagram.com';
const TOKEN_KEY = 'instagramToken';

async function token(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: TOKEN_KEY } });
  return row?.value || env.INSTAGRAM_ACCESS_TOKEN || null;
}

async function ig<T>(path: string, t: string): Promise<T> {
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(t)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!r.ok || j.error) {
    const msg = j.error?.message ?? `Instagram error ${r.status}`;
    throw new AppError(r.status === 400 || r.status === 190 ? 400 : 502, 'INSTAGRAM', /token|session|OAuth/i.test(msg) ? 'Your Instagram connection has expired. Paste a new access token in Settings → Instagram import.' : msg);
  }
  return j;
}

export async function connectionStatus() {
  const t = await token();
  if (!t) return { connected: false as const };
  try {
    const me = await ig<{ username: string; account_type?: string; media_count?: number }>('/me?fields=username,account_type,media_count', t);
    return { connected: true as const, username: me.username, accountType: me.account_type ?? null, mediaCount: me.media_count ?? null };
  } catch (e) {
    return { connected: false as const, error: (e as Error).message };
  }
}

/** Saves a token after checking it works. */
export async function saveToken(t: string) {
  const clean = t.trim();
  if (clean.length < 20) throw badRequest('BAD_TOKEN', 'That doesn\'t look like an Instagram access token.');
  const me = await ig<{ username: string }>('/me?fields=username', clean);
  await prisma.setting.upsert({ where: { key: TOKEN_KEY }, update: { value: clean }, create: { key: TOKEN_KEY, value: clean } });
  return { username: me.username };
}
export async function disconnect() { await prisma.setting.deleteMany({ where: { key: TOKEN_KEY } }); }

/** Long-lived tokens last 60 days; refreshing extends them. Run weekly from the job runner. */
export async function refreshToken() {
  const t = await token(); if (!t) return;
  try {
    const r = await ig<{ access_token: string }>(`/refresh_access_token?grant_type=ig_refresh_token`, t);
    if (r.access_token) await prisma.setting.upsert({ where: { key: TOKEN_KEY }, update: { value: r.access_token }, create: { key: TOKEN_KEY, value: r.access_token } });
  } catch (err) { logger.warn({ err }, 'Instagram token refresh failed'); }
}

interface Media { id: string; caption?: string; media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string;
  children?: { data: { media_type: string; media_url?: string; thumbnail_url?: string }[] } }

const imagesOf = (m: Media) => {
  if (m.media_type === 'CAROUSEL_ALBUM') return (m.children?.data ?? []).map((c) => (c.media_type === 'VIDEO' ? c.thumbnail_url : c.media_url)).filter((u): u is string => !!u).slice(0, 6);
  const u = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url;
  return u ? [u] : [];
};

/** Recent posts with a best-guess product from each caption, marking ones already imported. */
export async function listPosts(after?: string) {
  const t = await token();
  if (!t) throw badRequest('NOT_CONNECTED', 'Connect your Instagram account first (Settings → Instagram import).');
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';
  const r = await ig<{ data: Media[]; paging?: { cursors?: { after?: string }; next?: string } }>(`/me/media?fields=${encodeURIComponent(fields)}&limit=24${after ? `&after=${encodeURIComponent(after)}` : ''}`, t);
  const links = r.data.map((m) => m.permalink);
  const imported = new Set((await prisma.product.findMany({ where: { instagramPostUrl: { in: links } }, select: { instagramPostUrl: true } })).map((p) => p.instagramPostUrl));
  return {
    posts: r.data.map((m) => ({ id: m.id, permalink: m.permalink, timestamp: m.timestamp, caption: m.caption ?? '', images: imagesOf(m), imported: imported.has(m.permalink), guess: parseCaption(m.caption) }))
      .filter((p) => p.images.length),
    next: r.paging?.next ? r.paging.cursors?.after ?? null : null,
  };
}

/** Copies a post's photos to our storage (Instagram links expire) and returns their public URLs. */
async function copyImages(urls: string[]) {
  const out: string[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
      const type = r.headers.get('content-type') ?? 'image/jpeg';
      if (!r.ok || !type.startsWith('image/')) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) continue;
      out.push(await putPublicFile('products', buf, type.split(';')[0]));
    } catch (err) { logger.warn({ err }, 'Instagram image copy failed'); }
  }
  return out;
}

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'frame';

export interface ImportItem { id: string; name: string; price: number; mrp?: number | null; shape: string; gender: string; sunglasses: boolean; stock: number }

/** Creates products from selected posts. Re-reads each post from Instagram so photos and links are authentic. */
export async function importPosts(items: ImportItem[]) {
  const t = await token();
  if (!t) throw badRequest('NOT_CONNECTED', 'Connect your Instagram account first.');
  const results: { id: string; ok: boolean; productId?: string; error?: string }[] = [];
  for (const it of items) {
    try {
      const m = await ig<Media>(`/${encodeURIComponent(it.id)}?fields=${encodeURIComponent('id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}')}`, t);
      if (await prisma.product.findFirst({ where: { instagramPostUrl: m.permalink } })) { results.push({ id: it.id, ok: false, error: 'Already imported' }); continue; }
      const images = await copyImages(imagesOf(m));
      if (!images.length) { results.push({ id: it.id, ok: false, error: 'Could not copy the photos' }); continue; }
      const price = Math.round(it.price * 100), mrp = Math.max(price, Math.round((it.mrp || it.price) * 100));
      const slug = `${slugify(it.name)}-${Math.random().toString(36).slice(2, 6)}`;
      const p = await prisma.product.create({
        data: {
          slug, name: it.name.slice(0, 80), brand: 'Lensio', description: (m.caption ?? it.name).replace(/#[\p{L}\p{N}_]+/gu, '').trim().slice(0, 1500) || it.name,
          shape: it.shape as never, material: 'ACETATE', gender: it.gender as never, isSunglasses: it.sunglasses,
          basePrice: price, mrp, lensWidthMm: 52, bridgeMm: 18, templeMm: 140, frameWidthMm: 136, isActive: true,
          instagramPostUrl: m.permalink,
          images: { create: images.map((url, i) => ({ url, sortOrder: i })) },
          variants: { create: [{ sku: slug.toUpperCase().slice(0, 60), colorName: 'As shown', colorHex: '#1B1B1F', size: 'MEDIUM', stock: Math.max(0, Math.floor(it.stock)), priceDelta: 0 }] },
        },
      });
      results.push({ id: it.id, ok: true, productId: p.id });
    } catch (e) { results.push({ id: it.id, ok: false, error: (e as Error).message }); }
  }
  return results;
}
