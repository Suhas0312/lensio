import express from 'express';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';

vi.mock('./assistant.service', () => ({ chat: async (h: { text: string }[]) => ({ reply: `got ${h.length} messages, last: ${h[h.length - 1].text}`, products: [], handoff: false, mode: 'basic' }) }));
const settings = { assistantEnabled: true };
vi.mock('../settings/settings.service', () => ({ getSettings: async () => settings }));
vi.mock('../../middleware/auth', () => ({ optionalAuth: (_q: unknown, _r: unknown, n: () => void) => n() }));
const { default: routes } = await import('./assistant.routes');
const { errorHandler } = await import('../../middleware/error');

let base = '';
const app = express().use(express.json({ limit: '1mb' })).use('/a', routes).use(errorHandler);
const server = app.listen(0);
beforeAll(() => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/a`; });
afterAll(() => server.close());

describe('Ask Lensio route', () => {
  it('answers "Cost" after a very long earlier reply (was "Check the highlighted fields")', async () => {
    const long = 'Lens options: ' + '• Thin 1.60 +₹1,500. Supports up to ±8 SPH. '.repeat(60);   // ~2,800 characters
    const r = await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'lenses' }, { role: 'assistant', text: long }, { role: 'user', text: 'Cost' }] }) });
    expect(r.status).toBe(200);
    expect((await r.json()).reply).toContain('last: Cost');
  });
  it('refuses to chat while Ask Lensio is switched off in admin', async () => {
    settings.assistantEnabled = false;
    const r = await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', text: 'hi' }] }) });
    settings.assistantEnabled = true;
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('ASSISTANT_OFF');
  });
});
