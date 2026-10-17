import { describe, expect, it } from 'vitest';
import { bannerSchema, liveBanners } from './banners';

const b = (o: Partial<Record<string, unknown>>) => bannerSchema.parse({ id: 'b', title: 'Sale', ...o });
describe('home banners', () => {
  it('shows visible banners inside their dates only', () => {
    const now = new Date('2026-10-15T10:00:00Z');
    const list = [b({ id: '1' }), b({ id: '2', visible: false }), b({ id: '3', startsAt: '2026-10-20T00:00:00.000Z' }), b({ id: '4', endsAt: '2026-10-10T00:00:00.000Z' }), b({ id: '5', startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-10-31T00:00:00.000Z' })];
    expect(liveBanners(list, now).map((x) => x.id)).toEqual(['1', '5']);
  });
  it('only allows links inside the app (/…) or https', () => {
    expect(b({ link: '/shop?kind=sunglasses' }).link).toBe('/shop?kind=sunglasses');
    expect(() => b({ link: 'javascript:alert(1)' })).toThrow();
    expect(() => b({ link: 'http://insecure.example' })).toThrow();
  });
});

describe('banner rules (3.6.1)', () => {
  it('headline is optional, and the new switches are kept', async () => {
    const { bannerSchema } = await import('./banners');
    const b = bannerSchema.parse({ id: 'b1', imageDesktop: 'https://x.com/d.jpg', textInImage: true, sound: true, visible: true });
    expect(b).toMatchObject({ title: '', textInImage: true, sound: true });
  });
  it('“Until” must be after “From”', async () => {
    const { bannerSchema } = await import('./banners');
    const bad = bannerSchema.safeParse({ id: 'b1', startsAt: '2026-10-16T07:00:00.000Z', endsAt: '2026-10-16T07:00:00.000Z' });
    expect(bad.success).toBe(false);
    expect(bannerSchema.safeParse({ id: 'b1', startsAt: '2026-10-16T07:00:00.000Z', endsAt: '2026-10-20T07:00:00.000Z' }).success).toBe(true);
  });
});

describe('reading saved banners', () => {
  it('a banner saved with odd dates (or an old format) never hides the others', async () => {
    const { bannerFields } = await import('./banners');
    const saved = [{ id: 'a', title: '.', startsAt: '2026-10-16T07:00:00.000Z', endsAt: '2026-10-16T07:00:00.000Z', visible: true }, { id: 'b', title: 'Sunglasses', visible: true }, { broken: true }];
    const read = saved.map((b) => bannerFields.safeParse(b)).filter((r) => r.success);
    expect(read.length).toBe(2);
  });
});

describe('one video for both devices', () => {
  it('keeps fit and focus, with safe defaults', async () => {
    const { bannerSchema } = await import('./banners');
    expect(bannerSchema.parse({ id: 'b' })).toMatchObject({ fit: 'fill', focus: 'center' });
    expect(bannerSchema.parse({ id: 'b', fit: 'whole', focus: 'top' })).toMatchObject({ fit: 'whole', focus: 'top' });
    expect(bannerSchema.safeParse({ id: 'b', fit: 'stretch' }).success).toBe(false);
  });
});
