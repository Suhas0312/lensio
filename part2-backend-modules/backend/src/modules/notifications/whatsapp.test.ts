import { afterEach, describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ??= 'postgresql://x'; process.env.JWT_SECRET ??= 'test-secret-1234567890';
process.env.WHATSAPP_TOKEN = 'tok'; process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
vi.mock('../../lib/mail', () => ({ sendMail: async () => true, sendOrderEmail: async () => true }));
const calls: any[] = [];
let status = 200;
vi.stubGlobal('fetch', async (_url: string, init: any) => { calls.push(JSON.parse(init.body)); return { ok: status === 200, status, text: async () => 'err' }; });
const wa = await import('./whatsapp.service');
afterEach(() => { calls.length = 0; status = 200; });

describe('WhatsApp', () => {
  it('sends the login code with the copy-code button', async () => {
    expect(await wa.sendOtpWhatsApp('9876543210', '123456')).toBe(true);
    expect(calls[0].to).toBe('919876543210');
    expect(calls[0].template.name).toBe('login_code');
    expect(calls[0].template.components[1]).toMatchObject({ type: 'button', sub_type: 'url', parameters: [{ text: '123456' }] });
  });
  it('cleans parameters Meta would reject', () => {
    expect(wa.cleanParam('a\nb c      d')).toBe('a b c   d');
    expect(wa.cleanParam('')).toBe('-');
  });
  it('order updates use the order_update template', async () => {
    await wa.notifyOrderStatus({ phone: '9876543210', name: 'Asha', orderNumber: 'LNS1', status: 'DISPATCHED', trackingUrl: 'https://t/1' });
    expect(calls[0].template.name).toBe('order_update');
    expect(calls[0].template.components[0].parameters.map((p: any) => p.text)).toEqual(['Asha', 'LNS1', 'Dispatched', 'Track it: https://t/1']);
  });
  it('does not retry a rejected template, retries a server error once', async () => {
    status = 400; expect(await wa.sendTemplate('9876543210', 'x', ['a'])).toBe(false); expect(calls).toHaveLength(1);
    calls.length = 0; status = 500; expect(await wa.sendTemplate('9876543210', 'x', ['a'])).toBe(false); expect(calls).toHaveLength(2);
  });
});
