import { logger } from '../../lib/logger';
import { getSettings, saveSettings } from './settings.service';

/**
 * The Android app release customers should get.
 * Automatic: Lensio reads the newest (non pre-release) GitHub release of the repo that hosts the APK,
 * so publishing a release on GitHub updates /download, /download/lensio.apk and the in-app update window
 * within a few minutes. Admin → Settings values are the fallback (and the minimum version always comes from admin).
 */
export interface AndroidRelease { apkUrl: string | null; version: string | null; notes: string | null; minVersion: string | null; source: 'github' | 'admin'; repo: string | null; error?: string }

const SEMVER = /^\d+\.\d+\.\d+$/;
export const isNewer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

/** Where the automatic release robot (.github/workflows/android-release.yml) publishes the app. */
export const DEFAULT_RELEASE_REPO = process.env.ANDROID_RELEASE_REPO || 'Suhas0312/lensio';

/**
 * The GitHub repo to read app releases from: the admin setting if filled in, otherwise the repo the
 * release robot publishes to. No admin step is needed for automatic releases.
 */
export function releaseRepo(explicit: string | null, _apkUrl?: string | null) {
  if (explicit && /^[\w.-]+\/[\w.-]+$/.test(explicit)) return explicit;
  return /^[\w.-]+\/[\w.-]+$/.test(DEFAULT_RELEASE_REPO) ? DEFAULT_RELEASE_REPO : null;
}

export function cleanNotes(body: string | null | undefined) {
  if (!body) return null;
  const text = body.split('\n')
    .filter((l) => !/full changelog|^\s*(#+\s*)?what'?s changed\s*$|^\s*new contributors\s*$/i.test(l))
    .map((l) => l.replace(/^#+\s*/, '').replace(/^\s*[-*]\s+/, '• ').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trimEnd())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text ? text.slice(0, 600) : null;
}

type Gh = { version: string; apkUrl: string; notes: string | null };
let cache: { repo: string; at: number; ok: boolean; v?: Gh; error?: string } | null = null;
const OK_TTL = 3 * 60_000, FAIL_TTL = 60_000;

const GH_HEADERS = { 'User-Agent': 'lensio-server', Accept: 'text/html,application/atom+xml,application/json' };
const decode = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/**
 * Reads the newest published release the way a browser does (no GitHub API, so no 60-per-hour limit,
 * which Render's shared addresses often use up):
 *   github.com/<repo>/releases/latest → redirects to …/releases/tag/v2.0.3 (pre-releases and drafts are skipped)
 *   the APK: …/releases/download/v2.0.3/lensio.apk (or the first .apk on the release)
 *   notes: the repo's public releases feed.
 */
async function readRelease(repo: string): Promise<Gh> {
  const t = { signal: AbortSignal.timeout(8000) };
  const r = await fetch(`https://github.com/${repo}/releases/latest`, { ...t, headers: GH_HEADERS, redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  const tag = decodeURIComponent((loc.match(/\/releases\/tag\/([^/?#]+)/) || [])[1] || '');
  if (!tag) throw new Error(r.status === 404 ? 'Repository not found (it must be public)' : 'No published release found (pre-releases and drafts are ignored)');
  const version = tag.replace(/^v/i, '');
  if (!SEMVER.test(version)) throw new Error(`Release tag "${tag}" should look like v2.0.1`);

  let apkUrl = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/lensio.apk`;
  const head = await fetch(apkUrl, { ...t, method: 'HEAD', headers: GH_HEADERS, redirect: 'manual' });
  if (head.status === 404) {
    const html = await (await fetch(`https://github.com/${repo}/releases/expanded_assets/${encodeURIComponent(tag)}`, { ...t, headers: GH_HEADERS })).text();
    const m = html.match(/href="(\/[^"]+\/releases\/download\/[^"]+\.apk)"/i);
    if (!m) throw new Error(`Release ${tag} has no .apk file attached`);
    apkUrl = `https://github.com${decode(m[1])}`;
  }

  let notes: string | null = null;
  try {
    const feed = await (await fetch(`https://github.com/${repo}/releases.atom`, { ...t, headers: GH_HEADERS })).text();
    const entry = feed.split('<entry>').find((e) => new RegExp(`/${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</id>`).test(e));
    const html = entry?.match(/<content type="html">([\s\S]*?)<\/content>/)?.[1];
    if (html) notes = cleanNotes(decode(decode(html)).replace(/<li>/g, '\n- ').replace(/<br\s*\/?>|<\/p>|<\/h\d>/g, '\n').replace(/<[^>]+>/g, ''));
  } catch { /* notes are optional */ }
  return { version, apkUrl, notes };
}

/** With a GITHUB_TOKEN set, the official API is used (5,000 requests an hour); otherwise the public pages. */
async function readReleaseApi(repo: string): Promise<Gh> {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'lensio-server', Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }, signal: AbortSignal.timeout(6000) });
  if (r.status === 404) throw new Error('No published release found (pre-releases and drafts are ignored, and the repo must be public)');
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const j = (await r.json()) as { tag_name?: string; body?: string; assets?: { name: string; browser_download_url: string }[] };
  const version = (j.tag_name || '').replace(/^v/i, '');
  if (!SEMVER.test(version)) throw new Error(`Release tag "${j.tag_name}" should look like v2.0.1`);
  const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
  if (!apk) throw new Error(`Release v${version} has no .apk file attached`);
  return { version, apkUrl: apk.browser_download_url, notes: cleanNotes(j.body) };
}

export async function latestGithubRelease(repo: string): Promise<Gh> {
  const now = Date.now();
  if (cache && cache.repo === repo && now - cache.at < (cache.ok ? OK_TTL : FAIL_TTL)) {
    if (cache.v) return cache.v;
    throw new Error(cache.error);
  }
  try {
    const v = process.env.GITHUB_TOKEN ? await readReleaseApi(repo).catch(() => readRelease(repo)) : await readRelease(repo);
    cache = { repo, at: now, ok: true, v };
    return v;
  } catch (e) {
    const error = (e as Error).message;
    // keep serving the last good release if GitHub is briefly unreachable
    const last = cache?.repo === repo ? cache.v : undefined;
    if (last) { cache = { repo, at: now, ok: false, error, v: last }; return last; }
    cache = { repo, at: now, ok: false, error };
    logger.warn({ repo, error }, 'GitHub release check failed');
    throw e;
  }
}

export async function androidRelease(): Promise<AndroidRelease> {
  const s = await getSettings();
  const admin: AndroidRelease = { apkUrl: s.androidApkUrl, version: s.androidLatestVersion, notes: s.androidUpdateNotes, minVersion: s.androidMinVersion, source: 'admin', repo: null };
  const repo = releaseRepo(s.androidReleaseRepo, s.androidApkUrl);
  if (!repo) return admin;
  try {
    const gh = await latestGithubRelease(repo);
    // GitHub wins unless the admin typed a newer version by hand.
    if (admin.version && SEMVER.test(admin.version) && isNewer(admin.version, gh.version)) return { ...admin, repo };
    const sameAsAdmin = admin.version === gh.version;
    // Keep the backup fields in step with GitHub, so if GitHub is ever unreachable customers still get the newest app
    // (they used to stay on an old hand-typed version like 2.0.2).
    if (!sameAsAdmin || admin.apkUrl !== gh.apkUrl) {
      try { void Promise.resolve(saveSettings({ androidLatestVersion: gh.version, androidApkUrl: gh.apkUrl, ...(gh.notes ? { androidUpdateNotes: gh.notes } : {}) })).catch(() => {}); } catch { /* never affects customers */ }
    }
    return { apkUrl: gh.apkUrl, version: gh.version, notes: gh.notes ?? (sameAsAdmin ? admin.notes : null) ?? admin.notes, minVersion: admin.minVersion, source: 'github', repo };
  } catch (e) {
    return { ...admin, repo, error: (e as Error).message };
  }
}

export function _resetReleaseCache() { cache = null; }
