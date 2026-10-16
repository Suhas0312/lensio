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
