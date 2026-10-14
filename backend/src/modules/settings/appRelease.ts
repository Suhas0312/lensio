import { logger } from '../../lib/logger';
import { getSettings } from './settings.service';

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
    .filter((l) => !/full changelog|^\s*##?\s*what'?s changed\s*$/i.test(l))
    .map((l) => l.replace(/^#+\s*/, '').replace(/^\s*[-*]\s+/, '• ').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trimEnd())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text ? text.slice(0, 600) : null;
}

type Gh = { version: string; apkUrl: string; notes: string | null };
let cache: { repo: string; at: number; ok: boolean; v?: Gh; error?: string } | null = null;
const OK_TTL = 5 * 60_000, FAIL_TTL = 2 * 60_000;

export async function latestGithubRelease(repo: string): Promise<Gh> {
  const now = Date.now();
  if (cache && cache.repo === repo && now - cache.at < (cache.ok ? OK_TTL : FAIL_TTL)) {
    if (cache.v) return cache.v;
    throw new Error(cache.error);
  }
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'lensio-server' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers, signal: AbortSignal.timeout(6000) });
    if (r.status === 404) throw new Error('No published release found (pre-releases and drafts are ignored, and the repo must be public)');
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const j = (await r.json()) as { tag_name?: string; body?: string; assets?: { name: string; browser_download_url: string }[] };
    const version = (j.tag_name || '').replace(/^v/i, '');
    if (!SEMVER.test(version)) throw new Error(`Release tag "${j.tag_name}" should look like v2.0.1`);
    const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
    if (!apk) throw new Error(`Release v${version} has no .apk file attached`);
    const v = { version, apkUrl: apk.browser_download_url, notes: cleanNotes(j.body) };
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
    return { apkUrl: gh.apkUrl, version: gh.version, notes: gh.notes ?? (sameAsAdmin ? admin.notes : null) ?? admin.notes, minVersion: admin.minVersion, source: 'github', repo };
  } catch (e) {
    return { ...admin, repo, error: (e as Error).message };
  }
}

export function _resetReleaseCache() { cache = null; }
