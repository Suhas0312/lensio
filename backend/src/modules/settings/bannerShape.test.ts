import { describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';
vi.mock('../../lib/prisma', () => ({ prisma: { setting: { findMany: async () => [] } } }));
const { validShape } = await import('./settings.service');

describe('banner shapes', () => {
  it('accepts ready-made and custom shapes (also exact pixel sizes)', () => {
    for (const v of ['8:3', '16:9', '1:1', '21:9', '1920:1080', '1080:1350']) expect(validShape(v)).toBe(true);
  });
  it('refuses nonsense and extreme shapes', () => {
    for (const v of ['', '16x9', '16:0', 'abc', '10:1', '1:5', 16]) expect(validShape(v as string)).toBe(false);
  });
});
