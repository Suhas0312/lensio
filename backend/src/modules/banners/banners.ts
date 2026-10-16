import { z } from 'zod';
import { prisma } from '../../lib/prisma';

/**
 * Home banners (rotating carousel), managed in admin → Banners. Stored as one JSON setting, so no database
 * migration is needed. Each banner can have separate desktop and mobile images, text, a button, a link,
 * visibility and optional start/end dates.
 */
export const bannerSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1, 'Add a headline').max(80),
  text: z.string().trim().max(200).optional().default(''),
  cta: z.string().trim().max(30).optional().default(''),
  link: z.string().trim().max(300).refine((l) => !l || l.startsWith('/') || /^https:\/\//.test(l), 'Link must start with / (inside the app) or https://').optional().default(''),
  imageDesktop: z.string().url().nullable().optional().default(null),
  imageMobile: z.string().url().nullable().optional().default(null),
  alt: z.string().trim().max(160).optional().default(''),
  visible: z.boolean().default(true),
  startsAt: z.string().datetime().nullable().optional().default(null),
  endsAt: z.string().datetime().nullable().optional().default(null),
});
export type Banner = z.infer<typeof bannerSchema>;
const KEY = 'homeBanners';

export async function getBanners(): Promise<Banner[]> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row?.value) return [];
  try { return z.array(bannerSchema).parse(JSON.parse(row.value)); } catch { return []; }
}
export async function saveBanners(list: Banner[]) {
  const value = JSON.stringify(list);
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return list;
}
/** Banners customers see now: visible and inside their dates. */
export function liveBanners(list: Banner[], now = new Date()) {
  return list.filter((b) => b.visible && (!b.startsAt || new Date(b.startsAt) <= now) && (!b.endsAt || new Date(b.endsAt) > now));
}
