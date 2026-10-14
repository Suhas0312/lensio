import express from 'express';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const settings = { androidApkUrl: null as string | null, androidLatestVersion: null as string | null, androidUpdateNotes: null as string | null, instagramUrl: null };
vi.mock('../settings/settings.service', () => ({ getSettings: async () => settings }));
vi.mock('../../config/env', () => ({ env: { PUBLIC_BASE_URL: 'https://lensio-api.onrender.com', SUPPORT_WHATSAPP_NUMBER: '918086906713' } }));
const { siteRoutes } = await import('./download.page');

let base = '';
const server = express().use(siteRoutes).listen(0);
beforeAll(() => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => server.close());

describe('/download', () => {
  it('permanent link goes to the download page while no APK is set', async () => {
    const r = await fetch(`${base}/download/lensio.apk`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/download');
  });
  it('permanent link always redirects to the newest APK set in admin', async () => {
    settings.androidApkUrl = 'https://github.com/x/y/releases/download/v2.0.1/lensio-2.0.1.apk';
    const r = await fetch(`${base}/download/lensio.apk`, { redirect: 'manual' });
    expect(r.headers.get('location')).toBe(settings.androidApkUrl);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('page shows the version and what is new', async () => {
    settings.androidLatestVersion = '2.0.1'; settings.androidUpdateNotes = 'Size measurement <in try-on>';
    const html = await (await fetch(`${base}/download`)).text();
    expect(html).toContain('v2.0.1');
    expect(html).toContain('href="/download/lensio.apk"');
    expect(html).toContain('Size measurement &lt;in try-on&gt;');
  });
});
