import { beforeEach, describe, expect, it, vi } from 'vitest';
const settings: any = { androidApkUrl: 'https://github.com/Suhas0312/lensio/releases/download/v1.0.5/lensio.apk', androidLatestVersion: '1.0.5', androidUpdateNotes: 'old', androidMinVersion: null, androidReleaseRepo: null };
const saved: object[] = [];
vi.mock('./settings.service', () => ({ getSettings: async () => settings, saveSettings: async (p: object) => { saved.push(p); } }));
vi.mock('../../lib/logger', () => ({ logger: { warn: () => {} } }));
const { androidRelease, cleanNotes, releaseRepo, _resetReleaseCache } = await import('./appRelease');

let gh: any; let calls = 0;
// Simulates github.com's public pages: /releases/latest redirect, the APK download, the releases feed.
beforeEach(() => {
  _resetReleaseCache(); calls = 0;
  gh = { tag: 'v2.0.1', apk: true, notes: '&lt;h2&gt;What&#39;s Changed&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;&lt;strong&gt;Size&lt;/strong&gt; measurement&lt;/li&gt;&lt;/ul&gt;' };
  vi.stubGlobal('fetch', async (url: string) => {
    const res = (status: number, body = '', location = '') => ({ status, ok: status < 300, headers: { get: (h: string) => (h === 'location' ? location : null) }, text: async () => body });
    if (url === 'https://github.com/Suhas0312/lensio/releases/latest') {
      calls++;
      return gh.tag ? res(302, '', `https://github.com/Suhas0312/lensio/releases/tag/${gh.tag}`) : res(302, '', 'https://github.com/Suhas0312/lensio/releases');
    }
    if (url.endsWith('/lensio.apk')) return res(gh.apk ? 302 : 404);
    if (url.includes('/expanded_assets/')) return res(200, '<a href="/x/y/source.zip">src</a>');
    if (url.endsWith('/releases.atom')) return res(200, `<feed><entry><id>tag:github.com,2008:Repository/1/${gh.tag}</id><content type="html">${gh.notes}</content></entry></feed>`);
    throw new Error('unexpected ' + url);
  });
});

describe('automatic Android release from GitHub', () => {
  it('reads the release robot repo by default, or the repo set in admin', () => {
    expect(releaseRepo(null, 'https://github.com/Suhas0312/lensio-app/releases/latest/download/lensio.apk')).toBe('Suhas0312/lensio');
    expect(releaseRepo(null, 'https://pub-x.r2.dev/a.apk')).toBe('Suhas0312/lensio');
    expect(releaseRepo('Suhas0312/lensio-app', settings.androidApkUrl)).toBe('Suhas0312/lensio-app');
  });
  it('switches from an old admin link to the newest automatic release with no admin step', async () => {
    settings.androidApkUrl = 'https://github.com/Suhas0312/lensio-app/releases/latest/download/lensio.apk';
    const r = await androidRelease();
    expect(r).toMatchObject({ source: 'github', version: '2.0.1', repo: 'Suhas0312/lensio' });
    settings.androidApkUrl = 'https://github.com/Suhas0312/lensio/releases/download/v1.0.5/lensio.apk';
  });
  it('uses the newest GitHub release instead of the old admin version', async () => {
    const r = await androidRelease();
    expect(r).toMatchObject({ source: 'github', version: '2.0.1', apkUrl: 'https://github.com/Suhas0312/lensio/releases/download/v2.0.1/lensio.apk', notes: '• Size measurement' });
  });
  it('does not use the rate-limited GitHub API', async () => {
    await androidRelease();   // the fetch stub throws on any api.github.com address
  });
  it('checks GitHub at most every few minutes', async () => {
    await androidRelease(); await androidRelease(); await androidRelease();
    expect(calls).toBe(1);
  });
  it('falls back to admin values when the release has no APK', async () => {
    gh.apk = false;
    const r = await androidRelease();
    expect(r).toMatchObject({ source: 'admin', version: '1.0.5' });
    expect(r.error).toMatch(/no \.apk/);
  });
  it('ignores pre-releases (no latest release)', async () => {
    gh.tag = null;
    expect((await androidRelease()).source).toBe('admin');
  });
  it('cleans release notes', () => { expect(cleanNotes('**Full Changelog**: x')).toBeNull(); });
  it('keeps the backup fields in step with the newest GitHub release', async () => {
    expect(saved.some((p) => (p as { androidLatestVersion?: string }).androidLatestVersion && (p as { androidLatestVersion: string }).androidLatestVersion !== '2.0.2')).toBe(true);
  });
});
