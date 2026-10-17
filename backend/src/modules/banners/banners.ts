import { z } from 'zod';
import { prisma } from '../../lib/prisma';

/**
 * Home banners (rotating carousel), managed in admin → Banners. Stored as one JSON setting, so no database
 * migration is needed. Each banner can have separate desktop and mobile images, text, a button, a link,
 * visibility and optional start/end dates.
 */
/** Fields of a banner (used to read saved banners: tolerant, never drops the whole list). */
export const bannerFields = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().max(80).optional().default(''),   // optional: designs often carry their own text
  text: z.string().trim().max(200).optional().default(''),
  cta: z.string().trim().max(30).optional().default(''),
  link: z.string().trim().max(300).refine((l) => !l || l.startsWith('/') || /^https:\/\//.test(l), 'Link must start with / (inside the app) or https://').optional().default(''),
  imageDesktop: z.string().url().nullable().optional().default(null),
  imageMobile: z.string().url().nullable().optional().default(null),
  alt: z.string().trim().max(160).optional().default(''),
  // Optional video (MP4/WebM, https). Plays silently on a loop; the images are shown while it loads and
  // wherever video can't play, so a banner with a video should still have images.
  videoDesktop: z.string().url().refine((u) => /^https:\/\//.test(u), 'Use an https link').nullable().optional().default(null),
  videoMobile: z.string().url().refine((u) => /^https:\/\//.test(u), 'Use an https link').nullable().optional().default(null),
  // Optional music/voice-over (MP3/M4A): plays only when a customer taps 🔊 (browsers block sound until a tap).
  audio: z.string().url().refine((u) => /^https:\/\//.test(u), 'Use an https link').nullable().optional().default(null),
  // How a picture/video of any size fits the banner: 'fill' covers it (edges trimmed, keeping `focus`),
  // 'whole' shows all of it with a blurred copy behind (no bars). One upload can serve phones and computers.
  fit: z.enum(['fill', 'whole']).optional().default('fill'),
  focus: z.enum(['center', 'top', 'bottom']).optional().default('center'),
  textInImage: z.boolean().optional().default(false),   // the picture already has its own text: don't write headline/button on it
  sound: z.boolean().optional().default(false),         // video banner: show a 🔊 button customers can tap (always starts muted)
  visible: z.boolean().default(true),
  startsAt: z.string().datetime().nullable().optional().default(null),
  endsAt: z.string().datetime().nullable().optional().default(null),
});
/** Rules when saving from admin: also checks the dates make sense. */
export const bannerSchema = bannerFields.refine((b) => !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt), { message: '“Until” must be later than “Show from” (or leave both empty to always show)', path: ['endsAt'] });
export type Banner = z.infer<typeof bannerFields>;
const KEY = 'homeBanners';

export async function getBanners(): Promise<Banner[]> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row?.value) return [];
  // Read banner by banner: one bad entry must never hide all the others.
  try {
    const raw = JSON.parse(row.value);
    return Array.isArray(raw) ? raw.map((b) => bannerFields.safeParse(b)).filter((r) => r.success).map((r) => (r as { data: Banner }).data) : [];
  } catch { return []; }
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
