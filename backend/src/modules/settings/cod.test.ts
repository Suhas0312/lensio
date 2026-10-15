import { describe, expect, it, vi } from 'vitest';
// An old "Cash on Delivery = on" setting is still saved in the database.
vi.mock('../../lib/prisma', () => ({ prisma: { setting: { findMany: async () => [{ key: 'codEnabled', value: 'true' }, { key: 'upiId', value: 'lensio@okaxis' }] } } }));
const { getSettings } = await import('./settings.service');

describe('Cash on Delivery', () => {
  it('is always off, even if an old setting says on', async () => {
    const s = await getSettings();
    expect(s.codEnabled).toBe(false);
    expect(s.upiId).toBe('lensio@okaxis');
  });
});
