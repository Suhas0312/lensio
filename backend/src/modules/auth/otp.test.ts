import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

type Row = { id: string; email: string; codeHash: string; attempts: number; consumed: boolean; expiresAt: Date; createdAt: Date };
let rows: Row[] = [];
const match = (r: Row, w: any) => r.email === w.email && (w.consumed === undefined || r.consumed === w.consumed) && (!w.expiresAt || r.expiresAt > w.expiresAt.gt);
vi.mock('../../lib/prisma', () => ({ prisma: { otpCode: {
  findMany: async ({ where }: any) => rows.filter((r) => match(r, where)).sort((a, b) => +b.createdAt - +a.createdAt),
  update: async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id)!; if (data.attempts) r.attempts += 1; if (data.consumed) r.consumed = true; return r; },
  updateMany: async ({ where, data }: any) => { rows.filter((r) => match(r, where)).forEach((r) => Object.assign(r, data)); return { count: 1 }; },
} } }));
vi.mock('../../lib/mail', () => ({ sendCodeEmail: async () => true }));

const { verifyEmailCode } = await import('./otp.service');
const { env } = await import('../../config/env');
// Same hashing as the service (reads it indirectly by creating codes through a tiny copy of its formula).
const hash = (key: string, code: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(`${key}:${code}`).digest('hex');
const add = (id: string, code: string, ageSec: number) => rows.push({ id, email: 'a@b.com', codeHash: hash('a@b.com', code), attempts: 0, consumed: false,
  expiresAt: new Date(Date.now() + 600_000 - ageSec * 1000), createdAt: new Date(Date.now() - ageSec * 1000) });

describe('email codes', () => {
  beforeEach(() => { rows = []; });
  it('accepts the newest code', async () => { add('1', '111111', 60); add('2', '222222', 5); await verifyEmailCode('a@b.com', '222222'); expect(rows.every((r) => r.consumed)).toBe(true); });
  it('also accepts the earlier code when two were sent', async () => { add('1', '111111', 60); add('2', '222222', 5); await verifyEmailCode('a@b.com', '111111'); expect(rows.every((r) => r.consumed)).toBe(true); });
  it('rejects a wrong code and limits guessing', async () => {
    add('1', '111111', 60); add('2', '222222', 5);
    for (let i = 0; i < 5; i++) await expect(verifyEmailCode('a@b.com', '999999')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    await expect(verifyEmailCode('a@b.com', '222222')).rejects.toMatchObject({ code: 'OTP_LOCKED' });
  });
  it('a used code cannot be used again', async () => { add('1', '111111', 5); await verifyEmailCode('a@b.com', '111111'); await expect(verifyEmailCode('a@b.com', '111111')).rejects.toMatchObject({ code: 'OTP_EXPIRED' }); });
});
