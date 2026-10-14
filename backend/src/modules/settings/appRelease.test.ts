import { beforeEach, describe, expect, it, vi } from 'vitest';
const settings: any = { androidApkUrl: 'https://github.com/Suhas0312/lensio/releases/download/v1.0.5/lensio.apk', androidLatestVersion: '1.0.5', androidUpdateNotes: 'old', androidMinVersion: null, androidReleaseRepo: null };
vi.mock('./settings.service', () => ({ getSettings: async () => settings }));
vi.mock('../../lib/logger', () => ({ logger: { warn: () => {} } }));
const { androidRelease, cleanNotes, releaseRepo, _resetReleaseCache } = await import('./appRelease');

let gh: any; let calls = 0;
beforeEach(() => {
  _resetReleaseCache(); calls = 0;
  gh = { status: 200, json: { tag_name: 'v2.0.1', body: '## What\'s Changed\n- **Size** measurement\n\n**Full Changelog**: https://github.com/x/y/commits/v2.0.1', assets: [{ name: 'lensio.apk', browser_download_url: 'https://github.com/Suhas0312/lensio/releases/download/v2.0.1/lensio.apk' }] } };
  vi.stubGlobal('fetch', async (url: string) => { calls++; expect(url).toBe('https://api.github.com/repos/Suhas0312/lensio/releases/latest'); return { status: gh.status, ok: gh.status === 200, json: async () => gh.json }; });
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
    expect(r).toMatchObject({ source: 'github', version: '2.0.1', apkUrl: gh.json.assets[0].browser_download_url, notes: '• Size measurement' });
  });
  it('checks GitHub at most every 5 minutes', async () => {
    await androidRelease(); await androidRelease(); await androidRelease();
    expect(calls).toBe(1);
  });
  it('falls back to admin values when the release has no APK', async () => {
    gh.json.assets = [];
    const r = await androidRelease();
    expect(r).toMatchObject({ source: 'admin', version: '1.0.5' });
    expect(r.error).toMatch(/no \.apk/);
  });
  it('ignores pre-releases (GitHub 404 for latest)', async () => {
    gh.status = 404;
    expect((await androidRelease()).source).toBe('admin');
  });
  it('cleans release notes', () => { expect(cleanNotes('**Full Changelog**: x')).toBeNull(); });
});
