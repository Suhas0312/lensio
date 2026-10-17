import { describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';
vi.mock('./lib/prisma', () => ({ prisma: { $queryRaw: async () => 1 } }));

describe('security policy', () => {
  it('lets banner videos and audio from Cloudflare R2 (https) play, like images', async () => {
    const mod = await import('./app');
    const make = (mod as { createApp?: () => unknown; buildApp?: () => unknown }).createApp ?? (mod as { buildApp?: () => unknown }).buildApp;
    const app = make!() as import('express').Express;
    const server = app.listen(0);
    const port = (server.address() as import('net').AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    server.close();
    const csp = r.headers.get('content-security-policy') || '';
    expect(csp).toMatch(/media-src [^;]*https:/);
    expect(csp).toMatch(/img-src [^;]*https:/);
  });
});
