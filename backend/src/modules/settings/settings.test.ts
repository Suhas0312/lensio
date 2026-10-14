import { describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/prisma', () => ({ prisma: {} }));
import { upiUri } from './settings.service';
import QRCode from 'qrcode';

const s = { upiId: 'lensio@okaxis', upiPayeeName: 'Lensio Optical', upiQrImage: null, codEnabled: true, androidApkUrl: null, androidLatestVersion: null };

describe('UPI payment link', () => {
  it('builds a standard upi://pay link with exact amount', () => {
    const u = upiUri(s, 251900, 'LNS260923000123')!;
    const q = new URLSearchParams(u.replace('upi://pay?', ''));
    expect(u.startsWith('upi://pay?')).toBe(true);
    expect(q.get('pa')).toBe('lensio@okaxis');
    expect(q.get('pn')).toBe('Lensio Optical');
    expect(q.get('am')).toBe('2519.00');
    expect(q.get('cu')).toBe('INR');
    expect(q.get('tn')).toBe('Lensio LNS260923000123');
    expect(u).toContain('pa=lensio@okaxis');
    expect(q.get('tr')).toBeNull();
  });
  it('returns null without a UPI ID (falls back to uploaded QR)', () => {
    expect(upiUri({ ...s, upiId: null }, 100, 'X')).toBeNull();
  });
  it('encodes into a scannable QR', async () => {
    const png = await QRCode.toDataURL(upiUri(s, 99900, 'LNS1')!);
    expect(png.startsWith('data:image/png;base64,')).toBe(true);
  });
});
